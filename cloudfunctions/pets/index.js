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
const EDITABLE = ['name', 'species', 'breed', 'birthday', 'neutered', 'allergy', 'chronic', 'latest_weight', 'home_date', 'note', 'intro', 'price_base', 'avatar', 'avatar_emoji']

// 物种枚举白名单（ADR-023 物种扩展 A 档）：命中取其值，非法 / 旧值落 other。
// 这一处 = 解除「仅猫狗」的落库真相源（原为 species==='dog'?'dog':'cat' 二元钳制）。前端 src/species.js 持同序副本，改须同步。
const SPECIES_KEYS = ['cat', 'dog', 'rabbit', 'rodent', 'bird', 'reptile', 'fish', 'other']
const normSpecies = (s) => (SPECIES_KEYS.includes(s) ? s : 'other')

// 数字容错：number 原样；'2000'/'¥2,000' 取数；空 / 无数字 → null
function numOrNull(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null || v === '') return null
  const s = String(v).replace(/[^\d.]/g, '')
  if (s === '' || s === '.') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

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
    const name = String(p.name || '').trim() // 服务端 trim：客户端入参不可信，尾空格名会让 records 按名关联失配 + fuzzy 出肉眼不可分候选
    if (!name) return { ok: false, msg: 'name required' }
    // 同名查重：records/reminders 按名字关联，重名档案会共享时间线 + 体重回写只更新其一（ADR-015 评审硬化）
    const dup = await db.collection('pets').where({ family_id: familyId, name }).limit(1).get()
    if (dup.data.length) return { ok: false, msg: `已有叫「${name}」的宠物` }
    const res = await db.collection('pets').add({
      data: {
        family_id: familyId,
        name,
        species: normSpecies(p.species),
        breed: p.breed || '',
        birthday: p.birthday || '',
        neutered: !!p.neutered,
        allergy: p.allergy || '',
        chronic: p.chronic || '',
        latest_weight: typeof p.latest_weight === 'number' ? p.latest_weight : null,
        home_date: p.home_date || '', // 到家日期（见 ADR-013）
        note: p.note || '', // 备注
        intro: p.intro || '', // 简介（自由文本，见 ADR-014）
        price_base: numOrNull(p.price_base), // 初始身价（当前身价前端派生 = base + cost 累计）
        avatar: p.avatar || '', // 头像云存储 fileID
        avatar_emoji: typeof p.avatar_emoji === 'string' ? p.avatar_emoji.slice(0, 8) : '', // 自选 emoji 头像（照片 > emoji > 物种默认，ADR-015）；类型收紧防对象入库
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
      if (k === 'species') patch.species = normSpecies(p.species)
      else if (k === 'neutered') patch.neutered = !!p.neutered
      else if (k === 'latest_weight') {
        if (typeof p.latest_weight === 'number') patch.latest_weight = p.latest_weight
      } else if (k === 'price_base') patch.price_base = numOrNull(p.price_base) // 三态 null/0/正数
      else if (k === 'name') patch.name = String(p.name || '').trim() // 服务端 trim，与 add 对齐
      else if (k === 'avatar_emoji') patch.avatar_emoji = typeof p.avatar_emoji === 'string' ? p.avatar_emoji.slice(0, 8) : ''
      else patch[k] = p[k] || ''
    }
    if ('name' in patch && !patch.name) return { ok: false, msg: '名字必填' }
    patch.updated_at = Date.now()

    // 改名级联（按家庭）：records + reminders 的 pet 字段一并改掉，否则按名字查会对不上
    if (patch.name && patch.name !== cur.data.name) {
      // 改名撞已有名同样会产生重名档案，先查重拒绝
      const dup = await db.collection('pets').where({ family_id: familyId, name: patch.name }).limit(1).get()
      if (dup.data.length) return { ok: false, msg: `已有叫「${patch.name}」的宠物` }
      await db
        .collection('records')
        .where({ family_id: familyId, pet: cur.data.name })
        .update({ data: { pet: patch.name } })
        .catch(() => {})
      await db
        .collection('reminders')
        .where({ family_id: familyId, pet: cur.data.name })
        .update({ data: { pet: patch.name } })
        .catch(() => {})
    }

    await db.collection('pets').doc(id).update({ data: patch })
    // 换头像后删旧云存储文件，否则旧 fileID 成孤儿白占共享配额（见 ADR-011 清理）
    if ('avatar' in patch && cur.data.avatar && patch.avatar !== cur.data.avatar) {
      await cloud.deleteFile({ fileList: [cur.data.avatar] }).catch(() => {})
    }
    return { ok: true }
  }

  if (action === 'delete') {
    const id = event.id
    if (!id) return { ok: false, msg: 'no id' }
    const cur = await db.collection('pets').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    await db.collection('pets').doc(id).remove()
    // 头像文件随档案删（历史记录及其附件有意保留在时间线：删档案 ≠ 删病史）
    if (cur.data.avatar) await cloud.deleteFile({ fileList: [cur.data.avatar] }).catch(() => {})
    return { ok: true }
  }

  return { ok: false, msg: 'unknown action' }
}
