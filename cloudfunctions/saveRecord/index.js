const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 用户确认后落库：写 records，并在带体重时回写对应宠物 latest_weight。
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const r = event && event.record
  if (!r || r.valid === false) return { ok: false, code: 'INVALID', msg: '无效记录' }

  const doc = {
    _openid: OPENID,
    pet: r.pet || '',
    time: r.time || '',
    event_type: r.event_type || '其它',
    weight: typeof r.weight === 'number' ? r.weight : null,
    med: r.med || null,
    raw: r.raw || '',
    created_at: Date.now(),
  }
  const addRes = await db.collection('records').add({ data: doc })

  if (doc.weight && doc.pet) {
    const petRes = await db.collection('pets').where({ _openid: OPENID, name: doc.pet }).get()
    if (petRes.data.length) {
      await db.collection('pets').doc(petRes.data[0]._id).update({ data: { latest_weight: doc.weight } })
    }
  }

  return { ok: true, id: addRes._id }
}
