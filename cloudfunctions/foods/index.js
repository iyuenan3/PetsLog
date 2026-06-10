const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 家庭主粮台账（家庭级、不分宠，见 ADR-013/014）。action: list | add | update | delete
async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

let dbReady = false
async function ensureCollection() {
  if (dbReady) return
  try {
    await db.createCollection('foods')
  } catch (e) {
    /* 已存在忽略 */
  }
  dbReady = true
}

function normalizeDate(v) {
  const t = String(v == null ? '' : v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/) // 末尾 \D* 容「2026年6月9日」的「日」，否则锚死结尾匹配不上回退兜底
  if (m) {
    const z = (n) => String(n).padStart(2, '0')
    return `${m[1]}-${z(m[2])}-${z(m[3])}`
  }
  return ''
}

// 设某条为当前主粮时，把同家庭其它 current 置 false（家庭通常只一个在喂）
// 不吞错：失败要让其冒泡使整个 add/update 失败回 ok:false，否则会静默留下两条 current:true（评审 medium）。
async function clearOtherCurrent(familyId, exceptId) {
  const where = { family_id: familyId, current: true }
  if (exceptId) where._id = _.neq(exceptId)
  await db.collection('foods').where(where).update({ data: { current: false, updated_at: Date.now() } })
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
  await ensureCollection()

  if (action === 'list') {
    // 当前在喂置顶，其余按起始日期倒序
    const res = await db.collection('foods').where({ family_id: familyId }).orderBy('current', 'desc').orderBy('start_date', 'desc').get()
    return { ok: true, data: res.data }
  }

  if (action === 'add') {
    const f = event.food || {}
    const name = (f.name || '').trim()
    if (!name) return { ok: false, msg: '主粮名必填' }
    const current = !!f.current
    if (current) await clearOtherCurrent(familyId)
    const res = await db.collection('foods').add({
      data: {
        family_id: familyId,
        name,
        start_date: normalizeDate(f.start_date),
        end_date: current ? '' : normalizeDate(f.end_date), // 在喂中无结束日，避免残留矛盾的 end_date
        current,
        note: (f.note || '').trim(),
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    })
    return { ok: true, id: res._id }
  }

  if (action === 'update') {
    const id = event.id
    const f = event.food || {}
    if (!id) return { ok: false, msg: 'no id' }
    const cur = await db.collection('foods').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    const patch = { updated_at: Date.now() }
    if ('name' in f) {
      if (!(f.name || '').trim()) return { ok: false, msg: '主粮名必填' }
      patch.name = f.name.trim()
    }
    if ('start_date' in f) patch.start_date = normalizeDate(f.start_date)
    if ('end_date' in f) patch.end_date = normalizeDate(f.end_date)
    if ('note' in f) patch.note = (f.note || '').trim()
    if ('current' in f) {
      patch.current = !!f.current
      if (patch.current) {
        await clearOtherCurrent(familyId, id)
        patch.end_date = '' // 设为在喂时清空结束日，否则取消在喂后旧 end_date 突然重现（评审 low）
      }
    }
    await db.collection('foods').doc(id).update({ data: patch })
    return { ok: true }
  }

  if (action === 'delete') {
    const id = event.id
    if (!id) return { ok: false, msg: 'no id' }
    const cur = await db.collection('foods').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    await db.collection('foods').doc(id).remove()
    return { ok: true }
  }

  return { ok: false, msg: 'unknown action' }
}
