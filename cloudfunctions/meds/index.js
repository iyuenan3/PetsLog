const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 家庭药品库存 CRUD（按家庭隔离，不绑单宠）。action: list | add
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
        created_at: Date.now(),
      },
    })
    return { ok: true, id: res._id }
  }

  return { ok: false, msg: 'unknown action' }
}
