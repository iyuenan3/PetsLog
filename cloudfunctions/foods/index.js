const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 家庭主粮台账（ADR-027 多宠化：物种默认 + 单宠覆盖）。action: list | add | update | delete | backfill_foods
// 单宠覆盖用 pet=宠物名字（非 pet_id，与 records/reminders 同约定）；current 排他作用域 = (family, species, pet)。
async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 物种枚举白名单（ADR-023，与 pets/index.js + src/species.js 同序副本，改须同步）
const SPECIES_KEYS = ['cat', 'dog', 'rabbit', 'rodent', 'bird', 'reptile', 'fish', 'other']
const isSpecies = (s) => SPECIES_KEYS.includes(s)

let dbReady = false
async function ensureCollection() {
  if (dbReady) return
  try {
    await db.createCollection('foods')
  } catch (e) {
    /* 已存在忽略 */
  }
  dbReady = true
}

function normalizeDate(v) {
  const t = String(v == null ? '' : v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/) // 末尾 \D* 容「2026年6月9日」的「日」
  if (m) {
    const z = (n) => String(n).padStart(2, '0')
    return `${m[1]}-${z(m[2])}-${z(m[3])}`
  }
  return ''
}

// 服务端「今天」纯日期（东八区）：取消在喂时若无结束日，用今天补换粮日（ADR-027，避免「已结束但 end_date 空」）
function todayCN() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
}

// name「brand（model）」拆 brand/model：容全角（）与半角 ()，model 取到最后一个右括号前（容 I27+F32 的 +）；
// 无右括号则整串落 brand、model 空（ADR-027 迁移；新录入直接给 brand/model 不走此函数）。
function splitName(name) {
  const s = String(name || '').trim()
  const m = s.match(/^(.*?)[（(](.*)[）)]\s*$/)
  if (m) return { brand: m[1].trim(), model: m[2].trim() }
  return { brand: s, model: '' }
}

// current 排他：把同【作用域 (family, species, pet)】其它 current 置 false（ADR-027，从家庭级收窄）。
// pet 空也精确匹配空（物种默认档），故猫默认在喂 / 狗默认在喂 / 某猫覆盖在喂三者可并存、互不清。
// 不吞错：失败冒泡使整个 add/update 失败回 ok:false，避免静默留两条 current:true。
async function clearOtherCurrent(familyId, species, pet, exceptId) {
  const where = { family_id: familyId, species, pet: pet || '', current: true }
  if (exceptId) where._id = _.neq(exceptId)
  await db.collection('foods').where(where).update({ data: { current: false, updated_at: Date.now() } })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const familyId = event && event.family_id
  const action = (event && event.action) || 'list'
  let member
  try {
    member = await assertMember(OPENID, familyId)
  } catch (e) {
    return { ok: false, code: e.code || 'AUTH', msg: e.msg || '无权限' }
  }
  await ensureCollection()

  if (action === 'list') {
    // 当前在喂置顶，其余按起始日期倒序（前端按 species 分组；同作用域多 current 脏数据 tie-break 取首条 = start_date 最新）
    const res = await db.collection('foods').where({ family_id: familyId }).orderBy('current', 'desc').orderBy('start_date', 'desc').get()
    return { ok: true, data: res.data }
  }

  if (action === 'add') {
    const f = event.food || {}
    const species = String(f.species || '').trim()
    if (!isSpecies(species)) return { ok: false, msg: '物种必填且须合法' }
    const brand = String(f.brand || '').trim()
    if (!brand) return { ok: false, msg: '品牌必填' }
    const pet = String(f.pet || '').trim() // 空 = 该物种默认；填 = 某只单独覆盖
    const current = !!f.current
    if (current) await clearOtherCurrent(familyId, species, pet)
    const res = await db.collection('foods').add({
      data: {
        family_id: familyId,
        species,
        pet,
        brand,
        model: String(f.model || '').trim(),
        start_date: normalizeDate(f.start_date),
        end_date: current ? '' : normalizeDate(f.end_date), // 在喂中无结束日，避免残留矛盾
        current,
        note: String(f.note || '').trim(),
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    })
    return { ok: true, id: res._id }
  }

  if (action === 'update') {
    const id = event.id
    const f = event.food || {}
    if (!id) return { ok: false, msg: 'no id' }
    const cur = await db.collection('foods').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    const doc = cur.data
    const patch = { updated_at: Date.now() }
    if ('species' in f) {
      const sp = String(f.species || '').trim()
      if (!isSpecies(sp)) return { ok: false, msg: '物种非法' }
      patch.species = sp
    }
    if ('pet' in f) patch.pet = String(f.pet || '').trim()
    if ('brand' in f) {
      if (!String(f.brand || '').trim()) return { ok: false, msg: '品牌必填' }
      patch.brand = f.brand.trim()
    }
    if ('model' in f) patch.model = String(f.model || '').trim()
    if ('start_date' in f) patch.start_date = normalizeDate(f.start_date)
    if ('end_date' in f) patch.end_date = normalizeDate(f.end_date)
    if ('note' in f) patch.note = String(f.note || '').trim()
    if ('current' in f) {
      patch.current = !!f.current
      // 作用域取「改后值」：改 species/pet 同时设在喂时，按新作用域排他
      const scopeSpecies = 'species' in patch ? patch.species : doc.species
      const scopePet = 'pet' in patch ? patch.pet : doc.pet || ''
      if (patch.current) {
        await clearOtherCurrent(familyId, scopeSpecies, scopePet, id)
        patch.end_date = '' // 设为在喂清结束日，否则取消在喂后旧 end_date 突然重现
      } else {
        // 取消在喂：若仍无结束日，补换粮日进史（ADR-027）
        const willEnd = 'end_date' in patch ? patch.end_date : doc.end_date || ''
        if (!willEnd) patch.end_date = todayCN()
      }
    }
    await db.collection('foods').doc(id).update({ data: patch })
    return { ok: true }
  }

  if (action === 'delete') {
    const id = event.id
    if (!id) return { ok: false, msg: 'no id' }
    const cur = await db.collection('foods').doc(id).get().catch(() => null)
    if (!cur || !cur.data || cur.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    await db.collection('foods').doc(id).remove()
    return { ok: true }
  }

  // 迁移（ADR-027，admin）：现 family 级旧条（只有 name）→ species='cat' + pet='' + 拆 name 为 brand/model。
  // 幂等（已有 brand 的跳过）；dryRun 只返回拆解 report 供肉眼复核。本台账历史均为猫粮（用户确认，狗粮未进过）。
  if (action === 'backfill_foods') {
    if (member.role !== 'admin') return { ok: false, msg: 'NOT_ADMIN' }
    const dry = !!event.dryRun
    const res = await db.collection('foods').where({ family_id: familyId }).get()
    const report = []
    let changed = 0
    for (const d of res.data) {
      if (d.brand) continue // 已迁移
      const { brand, model } = splitName(d.name)
      report.push({ _id: d._id, name: d.name, brand, model })
      if (!dry) {
        await db.collection('foods').doc(d._id).update({
          data: { species: 'cat', pet: '', brand, model, updated_at: Date.now() },
        })
        changed++
      }
    }
    return { ok: true, dryRun: dry, scanned: res.data.length, changed: dry ? 0 : changed, report }
  }

  return { ok: false, msg: 'unknown action' }
}
