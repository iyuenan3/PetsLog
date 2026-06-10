const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 个人档案（全局，按 openid 隔离自有数据，无需家庭成员校验）。action: me | update
// users: { _openid, nickname, avatar(云存储 fileID), created_at, updated_at }
// 注意：云函数服务端用 wx-server-sdk 写入【不会】自动注入 _openid，必须显式写，
// 否则之后 where({_openid}) 永远查不回（这是头像/昵称保存后读不回的根因，见评审 #1）。
let dbReady = false
async function ensureCollection() {
  if (dbReady) return
  try {
    await db.createCollection('users')
  } catch (e) {
    /* 已存在忽略 */
  }
  dbReady = true
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const action = (event && event.action) || 'me'
  await ensureCollection()

  if (action === 'me') {
    // 只读：不在读路径隐式建档，避免并发首调写出多条重复档案
    const res = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
    const u = res.data[0]
    return { ok: true, data: { nickname: (u && u.nickname) || '', avatar: (u && u.avatar) || '' } }
  }

  if (action === 'update') {
    const patch = { updated_at: Date.now() }
    if ('nickname' in event) patch.nickname = String(event.nickname || '').slice(0, 30)
    if ('avatar' in event) patch.avatar = event.avatar || ''
    const res = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
    if (res.data.length) {
      await db.collection('users').doc(res.data[0]._id).update({ data: patch })
      // 换头像后删旧云存储文件，防孤儿 fileID 白占共享配额（见 ADR-011 清理）
      const old = res.data[0].avatar
      if ('avatar' in patch && old && patch.avatar !== old) {
        await cloud.deleteFile({ fileList: [old] }).catch(() => {})
      }
    } else {
      await db.collection('users').add({
        data: { _openid: OPENID, nickname: patch.nickname || '', avatar: patch.avatar || '', created_at: Date.now(), updated_at: Date.now() },
      })
    }
    return { ok: true }
  }

  return { ok: false, msg: 'unknown action' }
}
