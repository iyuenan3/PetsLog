const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 家庭多租户：families / family_members / invites（见 AIREADME/DECISIONS ADR-008）。
// 安全核心：family_id 由客户端传入、可伪造，每个涉及家庭数据的操作必先过 assertMember。

// ---------- 集中鉴权守卫（隔离安全的唯一兜底，务必每个入口都过）----------
async function getMembership(openid, familyId) {
  if (!familyId) return null
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  return r.data[0] || null
}
async function assertMember(openid, familyId) {
  const m = await getMembership(openid, familyId)
  if (!m) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return m
}
async function assertAdmin(openid, familyId) {
  const m = await assertMember(openid, familyId)
  if (m.role !== 'admin') throw { code: 'NOT_ADMIN', msg: '仅管理员可操作' }
  return m
}

let dbReady = false
async function ensureCollections() {
  if (dbReady) return
  for (const n of ['families', 'family_members', 'invites']) {
    try {
      await db.createCollection(n)
    } catch (e) {
      /* 已存在忽略 */
    }
  }
  dbReady = true
}

// 邀请码：6 位，排除易混字符（0/O/1/I/L）
function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const action = (event && event.action) || ''
  await ensureCollections()
  try {
    switch (action) {
      case 'bootstrap':
        return await bootstrap(OPENID)
      case 'create':
        return await createFamily(OPENID, event)
      case 'listMine':
        return { ok: true, families: await listMineRaw(OPENID) }
      case 'get':
        return await getFamily(OPENID, event)
      case 'members':
        return await listMembers(OPENID, event)
      case 'invite':
        return await createInvite(OPENID, event)
      case 'join':
        return await joinByCode(OPENID, event)
      case 'rename':
        return await rename(OPENID, event)
      case 'removeMember':
        return await removeMember(OPENID, event)
      case 'transferAdmin':
        return await transferAdmin(OPENID, event)
      case 'leave':
        return await leave(OPENID, event)
      case 'deleteFamily':
        return await deleteFamily(OPENID, event)
      default:
        return { ok: false, msg: 'unknown action: ' + action }
    }
  } catch (e) {
    return { ok: false, code: e.code || 'ERR', msg: e.msg || String((e && e.message) || e) }
  }
}

// 我加入的所有家庭（给切换器）
async function listMineRaw(openid) {
  const ms = await db.collection('family_members').where({ openid }).get()
  if (!ms.data.length) return []
  const ids = ms.data.map((m) => m.family_id)
  const fs = await db.collection('families').where({ _id: _.in(ids) }).get()
  const byId = {}
  fs.data.forEach((f) => (byId[f._id] = f))
  return ms.data
    .filter((m) => byId[m.family_id]) // 丢弃指向已删家庭的孤儿成员关系
    .map((m) => ({
      family_id: m.family_id,
      name: byId[m.family_id].name,
      owner: byId[m.family_id].owner,
      role: m.role,
    }))
}

async function doCreateFamily(openid, name) {
  const add = await db.collection('families').add({
    data: { name: name || '我的家', owner: openid, created_at: Date.now() },
  })
  await db.collection('family_members').add({
    data: { family_id: add._id, openid, role: 'admin', nickname: '', joined_at: Date.now() },
  })
  return add._id
}

// 首次进入：确保用户至少有一个家庭，没有就自动建「我的家」。返回家庭列表 + 默认 active。
async function bootstrap(openid) {
  let mine = await listMineRaw(openid)
  if (!mine.length) {
    await doCreateFamily(openid, '我的家')
    mine = await listMineRaw(openid)
  }
  return { ok: true, families: mine, active_family_id: mine[0] ? mine[0].family_id : '' }
}

async function createFamily(openid, event) {
  const name = ((event && event.name) || '').trim() || '我的家'
  const id = await doCreateFamily(openid, name)
  return { ok: true, family_id: id }
}

async function getFamily(openid, event) {
  const fid = event && event.family_id
  const me = await assertMember(openid, fid)
  const f = await db.collection('families').doc(fid).get().catch(() => null)
  if (!f || !f.data) return { ok: false, msg: 'not found' }
  return { ok: true, data: { family_id: fid, name: f.data.name, owner: f.data.owner, my_role: me.role } }
}

async function listMembers(openid, event) {
  const fid = event && event.family_id
  await assertMember(openid, fid)
  const r = await db.collection('family_members').where({ family_id: fid }).get()
  // 成员昵称 + 头像以全局个人档案（users 集合，按 _openid，见 ADR-009）为准，读时关联即永远反映最新档案；
  // family_members.nickname 仅作兜底（建家庭/加入时基本恒空，这是成员显示「成员+尾码」的根因）。
  const openids = r.data.map((m) => m.openid)
  const profByOpenid = {}
  if (openids.length) {
    const us = await db.collection('users').where({ _openid: _.in(openids) }).get().catch(() => ({ data: [] }))
    us.data.forEach((u) => {
      profByOpenid[u._openid] = { nickname: (u && u.nickname) || '', avatar: (u && u.avatar) || '' }
    })
  }
  return {
    ok: true,
    data: r.data.map((m) => {
      const p = profByOpenid[m.openid] || {}
      return {
        openid: m.openid,
        role: m.role,
        nickname: p.nickname || m.nickname || '',
        avatar: p.avatar || '', // 云存储 fileID，前端 <image> 直接渲染
        joined_at: m.joined_at,
        is_me: m.openid === openid,
      }
    }),
  }
}

async function createInvite(openid, event) {
  const fid = event && event.family_id
  await assertAdmin(openid, fid)
  const code = genCode()
  const expires_at = Date.now() + 7 * 86400000 // 默认 7 天有效
  await db.collection('invites').add({
    data: {
      code,
      family_id: fid,
      created_by: openid,
      created_at: Date.now(),
      expires_at,
      // 只接受正整数，负数 / 小数一律归 0（= 不限次），杜绝自伤型失效码
      max_uses: Number.isInteger(event.max_uses) && event.max_uses > 0 ? event.max_uses : 0,
      used_count: 0,
    },
  })
  return { ok: true, code, expires_at }
}

async function joinByCode(openid, event) {
  const code = ((event && event.code) || '').trim().toUpperCase()
  if (!code) return { ok: false, msg: '请输入邀请码' }
  const r = await db.collection('invites').where({ code }).orderBy('created_at', 'desc').limit(1).get()
  const inv = r.data[0]
  if (!inv) return { ok: false, code: 'BAD_CODE', msg: '邀请码无效' }
  if (inv.expires_at && inv.expires_at < Date.now()) return { ok: false, code: 'EXPIRED', msg: '邀请码已过期' }
  // 校验家庭仍存在（避免向已解散家庭写孤儿成员关系）
  const fam = await db.collection('families').doc(inv.family_id).get().catch(() => null)
  if (!fam || !fam.data) return { ok: false, code: 'BAD_CODE', msg: '邀请码无效' }
  const exist = await getMembership(openid, inv.family_id)
  if (exist) return { ok: true, family_id: inv.family_id, already: true }
  // 限次码：原子占名额（条件自增），抢不到 = 已用完，避免 check-then-inc 并发超限
  if (inv.max_uses) {
    const claim = await db
      .collection('invites')
      .where({ _id: inv._id, used_count: _.lt(inv.max_uses) })
      .update({ data: { used_count: _.inc(1) } })
    if (!claim.stats || claim.stats.updated < 1) return { ok: false, code: 'USED_UP', msg: '邀请码已用完' }
  }
  await db.collection('family_members').add({
    data: { family_id: inv.family_id, openid, role: 'member', nickname: (event && event.nickname) || '', joined_at: Date.now() },
  })
  return { ok: true, family_id: inv.family_id }
}

async function rename(openid, event) {
  const fid = event && event.family_id
  await assertAdmin(openid, fid)
  const name = ((event && event.name) || '').trim()
  if (!name) return { ok: false, msg: '名字必填' }
  await db.collection('families').doc(fid).update({ data: { name } })
  return { ok: true }
}

async function removeMember(openid, event) {
  const fid = event && event.family_id
  const target = event && event.openid
  await assertAdmin(openid, fid)
  if (!target) return { ok: false, msg: 'no target' }
  if (target === openid) return { ok: false, msg: '不能移除自己，请用退出 / 转让' }
  const m = await getMembership(target, fid)
  if (!m) return { ok: false, msg: '对方不是成员' }
  await db.collection('family_members').where({ family_id: fid, openid: target }).remove()
  // 作废该家庭现有邀请码，避免被踢成员凭旧码秒回（管理员可再生成新码）
  await db.collection('invites').where({ family_id: fid }).remove().catch(() => {})
  return { ok: true }
}

async function transferAdmin(openid, event) {
  const fid = event && event.family_id
  const target = event && event.openid
  await assertAdmin(openid, fid)
  if (!target) return { ok: false, msg: 'no target' }
  if (target === openid) return { ok: false, msg: '已经是管理员' }
  const tm = await getMembership(target, fid)
  if (!tm) return { ok: false, msg: '对方不是成员' }
  await db.collection('family_members').where({ family_id: fid, openid: target }).update({ data: { role: 'admin' } })
  await db.collection('family_members').where({ family_id: fid, openid }).update({ data: { role: 'member' } })
  await db.collection('families').doc(fid).update({ data: { owner: target } })
  return { ok: true }
}

// 解散家庭：级联清掉该家庭全部数据 + 成员关系 + 邀请码 + 家庭文档。
async function cascadeDeleteFamily(fid) {
  for (const c of ['records', 'meds', 'reminders', 'pets', 'parse_log']) {
    await db.collection(c).where({ family_id: fid }).remove().catch(() => {})
  }
  await db.collection('invites').where({ family_id: fid }).remove().catch(() => {})
  await db.collection('family_members').where({ family_id: fid }).remove().catch(() => {})
  await db.collection('families').doc(fid).remove().catch(() => {})
}

async function leave(openid, event) {
  const fid = event && event.family_id
  const me = await assertMember(openid, fid)
  const cnt = await db.collection('family_members').where({ family_id: fid }).count()
  if (me.role === 'admin' && cnt.total > 1) {
    return { ok: false, code: 'MUST_TRANSFER', msg: '你是管理员，请先转让管理员再退出' }
  }
  if (cnt.total <= 1) {
    // 最后一人退出 = 解散并彻底清理（退出即删，对齐 deleteFamily / PIPL）
    await cascadeDeleteFamily(fid)
    return { ok: true, dissolved: true }
  }
  await db.collection('family_members').where({ family_id: fid, openid }).remove()
  return { ok: true, dissolved: false }
}

async function deleteFamily(openid, event) {
  const fid = event && event.family_id
  await assertAdmin(openid, fid)
  await cascadeDeleteFamily(fid)
  return { ok: true }
}
