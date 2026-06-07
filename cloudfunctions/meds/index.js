const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 家庭药品库存 CRUD（按 openid 隔离，不绑单宠）。action: list | add
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const action = (event && event.action) || 'list'

  if (action === 'list') {
    const res = await db.collection('meds').where({ _openid: OPENID }).orderBy('expire_date', 'asc').get()
    return { ok: true, data: res.data }
  }

  if (action === 'add') {
    const m = event.med || {}
    if (!m.name) return { ok: false, msg: 'name required' }
    const res = await db.collection('meds').add({
      data: {
        _openid: OPENID,
        name: m.name,
        effect: m.effect || '',
        quantity: typeof m.quantity === 'number' ? m.quantity : 0,
        expire_date: m.expire_date || '',
        created_at: Date.now(),
      },
    })
    return { ok: true, id: res._id }
  }

  return { ok: false, msg: 'unknown action' }
}
