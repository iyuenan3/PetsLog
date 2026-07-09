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
const EDITABLE = ['name', 'species', 'breed', 'birthday', 'neutered', 'gender', 'allergy', 'chronic', 'latest_weight', 'home_date', 'note', 'intro', 'price_base', 'avatar', 'avatar_emoji']

// 物种枚举白名单（ADR-023 物种扩展 A 档）：命中取其值，非法 / 旧值落 other。
// 这一处 = 解除「仅猫狗」的落库真相源（原为 species==='dog'?'dog':'cat' 二元钳制）。前端 src/species.js 持同序副本，改须同步。
const SPECIES_KEYS = ['cat', 'dog', 'rabbit', 'rodent', 'bird', 'reptile', 'fish', 'other']
const normSpecies = (s) => (SPECIES_KEYS.includes(s) ? s : 'other')

// 性别枚举（ADR-025 档案卡富化）：仅 male / female，其余（含未填）落空串。仅展示、不驱动逻辑。
const normGender = (g) => (g === 'male' || g === 'female' ? g : '')

// 头像 fileID 白名单：合法头像必落在 avatars/ 上传路径（src/cloud.js），否则视为客户端注入清空。
// 换头像会用 admin 上下文 cloud.deleteFile 删旧值（绕过 ACL）；若不校验，攻击者可把 avatar 设为受害者文件的 fileID
// 再改一次即借本函数删任意文件（对齐 attachment/index.js 的 att/ 前缀闸门思路）。此处锚定路径挡住 att/ 病历等非头像文件。
const sanitizeAvatar = (v) => {
  const s = typeof v === 'string' ? v : ''
  return !s || s.indexOf('/avatars/') >= 0 ? s : ''
}

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
        gender: normGender(p.gender), // 性别 male/female/''（ADR-025，上档案卡显 ♂/♀）
        allergy: p.allergy || '',
        chronic: p.chronic || '',
        latest_weight: typeof p.latest_weight === 'number' ? p.latest_weight : null,
        home_date: p.home_date || '', // 到家日期（见 ADR-013）
        note: p.note || '', // 备注
        intro: p.intro || '', // 简介（自由文本，见 ADR-014）
        price_base: numOrNull(p.price_base), // 初始身价（当前身价前端派生 = base + cost 累计）
        avatar: sanitizeAvatar(p.avatar), // 头像云存储 fileID（白名单校验防注入他人 fileID，见 sanitizeAvatar）
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

    // 乐观并发（ADR-033）：编辑时前端带进编辑那刻的 updated_at，落库前比对；期间被家人改过即拒，前端刷新重编。
    // 向后兼容：不带 base_updated_at 的调用（saveRecord 体重回写 / importNotion / 旧端）跳过校验，行为不变。
    // 【不变量】updated_at 只有本 update action 会 bump；saveRecord 的体重回写（latest_weight / weight_spark）直写 pets、
    // 不设 updated_at（已核 saveRecord/index.js:20,168），所以 updated_at 实为「档案编辑版本号」、后台系统写不会让用户编辑误撞 CONFLICT。
    // 若以后给体重回写等系统写加上 updated_at，会破坏此前提（用户编辑期间被记体重就误冲突），改动时务必一并评估。
    if (event.base_updated_at != null && cur.data.updated_at != null && cur.data.updated_at !== event.base_updated_at) {
      return { ok: false, code: 'CONFLICT', msg: '这只档案刚被家人修改过' }
    }

    const patch = {}
    for (const k of EDITABLE) {
      if (!(k in p)) continue
      if (k === 'species') patch.species = normSpecies(p.species)
      else if (k === 'neutered') patch.neutered = !!p.neutered
      else if (k === 'gender') patch.gender = normGender(p.gender)
      else if (k === 'latest_weight') {
        if (typeof p.latest_weight === 'number') patch.latest_weight = p.latest_weight
      } else if (k === 'price_base') patch.price_base = numOrNull(p.price_base) // 三态 null/0/正数
      else if (k === 'name') patch.name = String(p.name || '').trim() // 服务端 trim，与 add 对齐
      else if (k === 'avatar') patch.avatar = sanitizeAvatar(p.avatar) // 白名单校验，防注入他人 fileID 借换头像删任意文件（见 sanitizeAvatar）
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
      // foods 单宠覆盖也按名关联（ADR-027），改名一并改 foods.pet（物种默认 pet='' 不受影响）
      await db
        .collection('foods')
        .where({ family_id: familyId, pet: cur.data.name })
        .update({ data: { pet: patch.name } })
        .catch(() => {})
    }

    // 物种变更级联（ADR-027 ⑥）：该宠单宠覆盖 foods.species 随之纠偏（覆盖解析只认名字、不靠 species，这步纯保台账分组正确）。
    // 用改名后的有效名查（若本次同时改名，上面 rename 级联已把 foods.pet 改成 patch.name）
    if (patch.species && patch.species !== cur.data.species) {
      const petName = patch.name && patch.name !== cur.data.name ? patch.name : cur.data.name
      await db
        .collection('foods')
        .where({ family_id: familyId, pet: petName })
        .update({ data: { species: patch.species } })
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
    // 级联清 reminders + foods 单宠覆盖（对齐改名级联 lines 129-140 + cascadeDeleteFamily）：这两类是未来待办 / 当前状态、非病史，
    // 宠没了还带幽灵名在健康页循环推进 / 显「仅<已删宠>」孤儿台账无意义。按名字关联（ADR-027）按 pet=name 清。
    // 注：records（病史）有意保留（删档案≠删病史）；foods 物种默认（pet=''）不受 pet=name 波及、只清该宠单宠覆盖。
    await db.collection('reminders').where({ family_id: familyId, pet: cur.data.name }).remove().catch(() => {})
    await db.collection('foods').where({ family_id: familyId, pet: cur.data.name }).remove().catch(() => {})
    return { ok: true }
  }

  return { ok: false, msg: 'unknown action' }
}
