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
  // 默认按录入时间 created_at 倒序（主时间线 / 体重图沿用）；
  // 需按事件日期排序时传 orderField:'time'（兽医小结按事件日期由近到远，同日再按 created_at 兜底，保证确定性）。
  let q = db.collection('records').where(where)
  if (event && event.orderField === 'time') {
    q = q.orderBy('time', 'desc').orderBy('created_at', 'desc')
  } else {
    q = q.orderBy('created_at', 'desc')
  }
  const res = await q.limit(event && event.limit ? event.limit : 50).get()
  return { ok: true, data: res.data }
}
