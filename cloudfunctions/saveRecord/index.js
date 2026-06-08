const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 用户确认后落库（按家庭隔离，见 ADR-008）：
// - kind=med_stock → 写 meds（家庭药品库存，不绑单宠）
// - kind=reminder  → 写 reminders（用药 / 疫苗 / 驱虫提醒）
// - 否则 → 写 records，并自动建宠物档案 / 回写体重
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const familyId = event && event.family_id
  const r = event && event.record
  if (!r || r.valid === false) return { ok: false, code: 'INVALID', msg: '无效记录' }

  try {
    await assertMember(OPENID, familyId)
  } catch (e) {
    return { ok: false, code: e.code || 'AUTH', msg: e.msg || '无权限' }
  }

  // 提醒
  if (r.kind === 'reminder') {
    await db.createCollection('reminders').catch(() => {}) // 幂等兜底
    const TYPES = ['用药', '疫苗', '驱虫', '其它']
    const remRes = await db.collection('reminders').add({
      data: {
        family_id: familyId,
        pet: r.pet || '',
        type: TYPES.includes(r.rem_type) ? r.rem_type : '其它',
        title: r.rem_title || '',
        next_date: r.rem_date || '',
        repeat_days: typeof r.rem_repeat_days === 'number' ? r.rem_repeat_days : Number(r.rem_repeat_days) || 0,
        note: '',
        done: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    })
    return { ok: true, id: remRes._id, kind: 'reminder' }
  }

  // 药品入库
  if (r.kind === 'med_stock') {
    const name = r.med_name || r.med || ''
    if (!name) return { ok: false, code: 'NO_MED', msg: '药品名缺失' }
    const medRes = await db.collection('meds').add({
      data: {
        family_id: familyId,
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
    family_id: familyId,
    pet: r.pet || '',
    time: r.time || '',
    event_type: r.event_type || '其它',
    weight: typeof r.weight === 'number' ? r.weight : null,
    med: r.med || null,
    raw: r.raw || '',
    created_at: Date.now(),
  }
  const addRes = await db.collection('records').add({ data: doc })

  // 宠物 upsert（按家庭）：新名字自动建档；已有的若带体重则更新最新体重
  let petCreated = false
  if (doc.pet) {
    const petRes = await db.collection('pets').where({ family_id: familyId, name: doc.pet }).get()
    if (petRes.data.length) {
      if (doc.weight) {
        await db.collection('pets').doc(petRes.data[0]._id).update({ data: { latest_weight: doc.weight } })
      }
    } else {
      await db.collection('pets').add({
        data: {
          family_id: familyId,
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
