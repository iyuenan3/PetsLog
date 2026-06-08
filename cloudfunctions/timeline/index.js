const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 健康时间线（按家庭隔离），倒序。可选 event.pet 过滤单宠。
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const familyId = event && event.family_id
  try {
    await assertMember(OPENID, familyId)
  } catch (e) {
    return { ok: false, code: e.code || 'AUTH', msg: e.msg || '无权限' }
  }

  const where = { family_id: familyId }
  if (event && event.pet) where.pet = event.pet
  const res = await db
    .collection('records')
    .where(where)
    .orderBy('created_at', 'desc')
    .limit(event && event.limit ? event.limit : 50)
    .get()
  return { ok: true, data: res.data }
}
