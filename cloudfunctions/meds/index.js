const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 药品类型枚举（ADR-035）：与 reminders TYPES / saveRecord 同值，跨入口一套口径。
// 缺 / 非法默认「用药」（药品库存默认就是药，刻意区别于提醒兜底「其它」）。
const MED_TYPES = ['用药', '疫苗', '驱虫', '养护', '其它']
const normMedType = (t) => (MED_TYPES.includes(t) ? t : '用药')
// 存量回填启发式：按 effect 自由文本关键词推断类型（无关键词一律「用药」，保守、用户可改）。
function inferMedType(effect) {
  const e = String(effect || '')
  if (e.includes('驱虫')) return '驱虫'
  if (e.includes('疫苗')) return '疫苗'
  if (e.includes('养护') || e.includes('护理') || e.includes('保健')) return '养护'
  return '用药'
}

// 家庭药品库存 CRUD（按家庭隔离，不绑单宠）。action: list | add | update | delete
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const familyId = event && event.family_id
  const action = (event && event.action) || 'list'
  let member
  try {
    member = await assertMember(OPENID, familyId)
  } catch (e) {
    return { ok: false, code: e.code || 'AUTH', msg: e.msg || '无权限' }
  }

  if (action === 'list') {
    const res = await db.collection('meds').where({ family_id: familyId }).orderBy('expire_date', 'asc').get()
    return { ok: true, data: res.data }
  }

  if (action === 'add') {
    const m = event.med || {}
    if (!m.name) return { ok: false, msg: 'name required' }
    const res = await db.collection('meds').add({
      data: {
        family_id: familyId,
        name: m.name,
        effect: m.effect || '',
        type: normMedType(m.type), // 药品类型（ADR-035），缺 / 非法默认「用药」
        quantity: typeof m.quantity === 'number' ? m.quantity : 1,
        expire_date: m.expire_date || '',
        raw: m.raw || '', // 当时原话 provenance（与 saveRecord med_stock 落库口径一致）
        created_at: Date.now(),
      },
    })
    return { ok: true, id: res._id }
  }

  // 编辑：仅改 name / effect / quantity / expire_date（raw 是当时原话 provenance，只读不改）。
  // 家庭隔离：先 doc().get() 校 family_id 命中本家庭再写（与 foods 同款守卫，防越权改他家药品）。
  if (action === 'update') {
    const id = event.id
    const m = event.med || {}
    if (!id) return { ok: false, msg: 'id required' }
    const cur = await db.collection('meds').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    const patch = {}
    if (typeof m.name === 'string') {
      if (!m.name.trim()) return { ok: false, msg: 'name required' } // 名字不可被清空，防台账空名
      patch.name = m.name.trim()
    }
    if (typeof m.effect === 'string') patch.effect = m.effect.trim()
    if (typeof m.type === 'string') patch.type = normMedType(m.type) // 药品类型可改（ADR-035），钳枚举
    if (m.quantity !== undefined) {
      const q = Number(m.quantity)
      patch.quantity = Number.isFinite(q) && q >= 0 ? q : 0 // 允许 0（用完），非法归 0
    }
    if (m.expire_date !== undefined) patch.expire_date = m.expire_date || '' // 允许补填或清空过期日
    patch.updated_at = Date.now()
    await db.collection('meds').doc(id).update({ data: patch })
    return { ok: true }
  }

  if (action === 'delete') {
    const id = event.id
    if (!id) return { ok: false, msg: 'id required' }
    const cur = await db.collection('meds').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    await db.collection('meds').doc(id).remove()
    return { ok: true }
  }

  // 存量回填药品类型（ADR-035，一次性维护）：仅补本家庭【尚无 type】的行（幂等，重跑不动已有 type），
  // 按 effect 关键词推断。返回 { scanned, changed }；family 隔离（只扫本家庭）+ 仅 admin（对齐 backfill_foods，维护动作收敛到管理员）。
  // limit 1000 = 安全天花板（家庭药品现实远低于此，对齐 pets loadWeight:1000 取全量先例）。
  if (action === 'backfill_type') {
    if (member.role !== 'admin') return { ok: false, msg: 'NOT_ADMIN' }
    const res = await db.collection('meds').where({ family_id: familyId }).limit(1000).get()
    let changed = 0
    for (const m of res.data) {
      if (MED_TYPES.includes(m.type)) continue // 已有合法 type 不动
      await db.collection('meds').doc(m._id).update({ data: { type: inferMedType(m.effect), updated_at: Date.now() } })
      changed++
    }
    return { ok: true, scanned: res.data.length, changed }
  }

  return { ok: false, msg: 'unknown action' }
}
