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

  // 宠物 upsert：新名字自动建档；已有的若带体重则更新最新体重
  let petCreated = false
  if (doc.pet) {
    const petRes = await db.collection('pets').where({ _openid: OPENID, name: doc.pet }).get()
    if (petRes.data.length) {
      if (doc.weight) {
        await db.collection('pets').doc(petRes.data[0]._id).update({ data: { latest_weight: doc.weight } })
      }
    } else {
      await db.collection('pets').add({
        data: {
          _openid: OPENID,
          name: doc.pet,
          species: r.species === 'dog' ? 'dog' : 'cat',
          breed: '',
          birthday: '',
          neutered: false,
          allergy: '',
          chronic: '',
          latest_weight: doc.weight || null,
          created_at: Date.now(),
        },
      })
      petCreated = true
    }
  }

  return { ok: true, id: addRes._id, petCreated }
}
