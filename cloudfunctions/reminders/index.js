const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 提醒 CRUD（按家庭隔离）。action: list | add | done | snooze | update | delete
const TYPES = ['用药', '疫苗', '驱虫', '其它']

function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000) // 云函数 UTC，校到东八区
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`
}

function addDays(base, days) {
  const t = new Date(String(base).replace(/-/g, '/') + ' 00:00:00')
  if (isNaN(t.getTime())) return base
  t.setDate(t.getDate() + days)
  const z = (n) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${z(t.getMonth() + 1)}-${z(t.getDate())}`
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const familyId = event && event.family_id
  const action = (event && event.action) || 'list'

  try {
    await assertMember(OPENID, familyId)
  } catch (e) {
    return { ok: false, code: e.code || 'AUTH', msg: e.msg || '无权限' }
  }

  if (action === 'list') {
    const includeDone = !!(event && event.includeDone)
    const where = { family_id: familyId }
    if (!includeDone) where.done = false // 默认只列未完成
    const res = await db.collection('reminders').where(where).orderBy('next_date', 'asc').get()
    return { ok: true, data: res.data, today: todayStr() }
  }

  if (action === 'add') {
    const r = event.reminder || {}
    if (!r.title && !r.pet) return { ok: false, msg: '提醒内容缺失' }
    const res = await db.collection('reminders').add({
      data: {
        family_id: familyId,
        pet: r.pet || '',
        type: TYPES.includes(r.type) ? r.type : '其它',
        title: r.title || '',
        next_date: r.next_date || todayStr(),
        repeat_days: typeof r.repeat_days === 'number' ? r.repeat_days : Number(r.repeat_days) || 0,
        note: r.note || '',
        done: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    })
    return { ok: true, id: res._id }
  }

  // 校验归属（按家庭）
  const own = async (id) => {
    if (!id) return null
    const cur = await db.collection('reminders').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return null
    return cur.data
  }

  if (action === 'done') {
    const cur = await own(event.id)
    if (!cur) return { ok: false, msg: 'not found' }
    if (cur.repeat_days > 0) {
      // 重复提醒：从 max(today, next_date) 顺延一个周期，避免逾期堆积
      const today = todayStr()
      const base = cur.next_date && cur.next_date > today ? cur.next_date : today
      const next = addDays(base, cur.repeat_days)
      await db.collection('reminders').doc(event.id).update({ data: { next_date: next, updated_at: Date.now() } })
      return { ok: true, next_date: next }
    }
    await db.collection('reminders').doc(event.id).update({ data: { done: true, updated_at: Date.now() } })
    return { ok: true, done: true }
  }

  if (action === 'snooze') {
    const cur = await own(event.id)
    if (!cur) return { ok: false, msg: 'not found' }
    const days = typeof event.days === 'number' ? event.days : 7
    const base = cur.next_date || todayStr()
    const next = addDays(base, days)
    await db.collection('reminders').doc(event.id).update({ data: { next_date: next, done: false, updated_at: Date.now() } })
    return { ok: true, next_date: next }
  }

  if (action === 'update') {
    const cur = await own(event.id)
    if (!cur) return { ok: false, msg: 'not found' }
    const r = event.reminder || {}
    const patch = { updated_at: Date.now() }
    if ('pet' in r) patch.pet = r.pet || ''
    if ('type' in r) patch.type = TYPES.includes(r.type) ? r.type : '其它'
    if ('title' in r) patch.title = r.title || ''
    if ('next_date' in r) patch.next_date = r.next_date || cur.next_date
    if ('repeat_days' in r) patch.repeat_days = Number(r.repeat_days) || 0
    if ('note' in r) patch.note = r.note || ''
    if ('done' in r) patch.done = !!r.done
    await db.collection('reminders').doc(event.id).update({ data: patch })
    return { ok: true }
  }

  if (action === 'delete') {
    const cur = await own(event.id)
    if (!cur) return { ok: false, msg: 'not found' }
    await db.collection('reminders').doc(event.id).remove()
    return { ok: true }
  }

  return { ok: false, msg: 'unknown action' }
}
