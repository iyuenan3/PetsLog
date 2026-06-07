const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 宠物档案 CRUD（按 openid 隔离）。action: list | get | add
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const action = (event && event.action) || 'list'

  if (action === 'list') {
    const res = await db.collection('pets').where({ _openid: OPENID }).get()
    return { ok: true, data: res.data }
  }

  if (action === 'get') {
    if (!event.id) return { ok: false, msg: 'no id' }
    const res = await db.collection('pets').doc(event.id).get().catch(() => null)
    if (!res || !res.data || res.data._openid !== OPENID) return { ok: false, msg: 'not found' }
    return { ok: true, data: res.data }
  }

  if (action === 'add') {
    const p = event.pet || {}
    if (!p.name) return { ok: false, msg: 'name required' }
    const res = await db.collection('pets').add({
      data: {
        _openid: OPENID,
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

  return { ok: false, msg: 'unknown action' }
}
