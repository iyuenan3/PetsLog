const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 用户确认后落库：
// - kind=med_stock → 写 meds（家庭药品库存，不绑单宠）
// - 否则 → 写 records，并自动建宠物档案 / 回写体重
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const r = event && event.record
  if (!r || r.valid === false) return { ok: false, code: 'INVALID', msg: '无效记录' }

  // 药品入库
  if (r.kind === 'med_stock') {
    const name = r.med_name || r.med || ''
    if (!name) return { ok: false, code: 'NO_MED', msg: '药品名缺失' }
    const medRes = await db.collection('meds').add({
      data: {
        _openid: OPENID,
        name,
        effect: r.med_effect || '',
        quantity: typeof r.med_quantity === 'number' ? r.med_quantity : Number(r.med_quantity) || 1,
        expire_date: r.med_expire || '',
        created_at: Date.now(),
      },
    })
    return { ok: true, id: medRes._id, kind: 'med_stock' }
  }

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
