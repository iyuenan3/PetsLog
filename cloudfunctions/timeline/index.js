const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 健康时间线：按 openid 读 records，倒序。可选 event.pet 过滤单宠。
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const where = { _openid: OPENID }
  if (event && event.pet) where.pet = event.pet
  const res = await db
    .collection('records')
    .where(where)
    .orderBy('created_at', 'desc')
    .limit(event && event.limit ? event.limit : 50)
    .get()
  return { ok: true, data: res.data }
}
