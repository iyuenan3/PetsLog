const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 宠物档案 CRUD（按家庭隔离）。action: list | get | add | update | delete
const EDITABLE = ['name', 'species', 'breed', 'birthday', 'neutered', 'allergy', 'chronic', 'latest_weight']

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
    const res = await db.collection('pets').where({ family_id: familyId }).get()
    return { ok: true, data: res.data }
  }

  if (action === 'get') {
    if (!event.id) return { ok: false, msg: 'no id' }
    const res = await db.collection('pets').doc(event.id).get().catch(() => null)
    if (!res || !res.data || res.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    return { ok: true, data: res.data }
  }

  if (action === 'add') {
    const p = event.pet || {}
    if (!p.name) return { ok: false, msg: 'name required' }
    const res = await db.collection('pets').add({
      data: {
        family_id: familyId,
        name: p.name,
        species: p.species === 'dog' ? 'dog' : 'cat',
        breed: p.breed || '',
        birthday: p.birthday || '',
        neutered: !!p.neutered,
        allergy: p.allergy || '',
        chronic: p.chronic || '',
        latest_weight: typeof p.latest_weight === 'number' ? p.latest_weight : null,
        created_at: Date.now(),
      },
    })
    return { ok: true, id: res._id }
  }

  if (action === 'update') {
    const id = event.id
    const p = event.pet || {}
    if (!id) return { ok: false, msg: 'no id' }
    const cur = await db.collection('pets').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return { ok: false, msg: 'not found' }

    const patch = {}
    for (const k of EDITABLE) {
      if (!(k in p)) continue
      if (k === 'species') patch.species = p.species === 'dog' ? 'dog' : 'cat'
      else if (k === 'neutered') patch.neutered = !!p.neutered
      else if (k === 'latest_weight') {
        if (typeof p.latest_weight === 'number') patch.latest_weight = p.latest_weight
      } else patch[k] = p[k] || ''
    }
    if ('name' in patch && !patch.name) return { ok: false, msg: '名字必填' }
    patch.updated_at = Date.now()

    // 改名级联（按家庭）：历史记录的 pet 字段一并改掉，否则时间线 / 体重曲线按名字查会对不上
    if (patch.name && patch.name !== cur.data.name) {
      await db
        .collection('records')
        .where({ family_id: familyId, pet: cur.data.name })
        .update({ data: { pet: patch.name } })
        .catch(() => {})
    }

    await db.collection('pets').doc(id).update({ data: patch })
    return { ok: true }
  }

  if (action === 'delete') {
    const id = event.id
    if (!id) return { ok: false, msg: 'no id' }
    const cur = await db.collection('pets').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    await db.collection('pets').doc(id).remove()
    // 历史记录有意保留在时间线（删档案 ≠ 删病史）。
    return { ok: true }
  }

  return { ok: false, msg: 'unknown action' }
}
