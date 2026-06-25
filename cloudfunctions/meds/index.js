const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 家庭药品库存 CRUD（按家庭隔离，不绑单宠）。action: list | add | update | delete
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

  return { ok: false, msg: 'unknown action' }
}
