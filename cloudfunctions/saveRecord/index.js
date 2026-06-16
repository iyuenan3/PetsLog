const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 事件类型受控枚举（8 桶，见 ADR-013 + ADR-024 加「养护」）。前端配色 / 分类依赖，非法值落「其它」。
const EVENT_TYPES = ['症状', '用药', '疫苗', '驱虫', '体重', '就医', '养护', '其它']

// 养护参数 sanitize（ADR-024）：只接收对象、键数 ≤8、键名 ≤16 字、值为 number 或 ≤32 字串；越界 / 非法丢弃。
// schemaless（物种参数集差异大），仅防垃圾入库；前端 speciesProfile 驱动正确键，服务端不强校键名。
function sanitizeParams(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined
  const out = {}
  let n = 0
  for (const k of Object.keys(v)) {
    if (n >= 8) break
    if (typeof k !== 'string' || k.length === 0 || k.length > 16) continue
    let val = v[k]
    if (typeof val === 'number') {
      if (!Number.isFinite(val)) continue
    } else if (typeof val === 'string') {
      val = val.trim()
      if (val === '' || val.length > 32) continue
    } else continue
    out[k] = val
    n++
  }
  return n ? out : undefined
}

// 物种枚举白名单（ADR-023 物种扩展 A 档）：自动建宠时归一，非法 / 旧值落 other。前端 src/species.js 持同序副本，改须同步。
const SPECIES_KEYS = ['cat', 'dog', 'rabbit', 'rodent', 'bird', 'reptile', 'fish', 'other']
const normSpecies = (s) => (SPECIES_KEYS.includes(s) ? s : 'other')

// 日期归一：保证落库日期恒为定长零填充 'YYYY-MM-DD'，否则字典序排序（兽医小结按 time、提醒按 next_date）会失真。
// 已是 'YYYY-MM-DD' 原样；'2026-6-9' / '2026/6/9' 补零归一；解析不出回退 fallback。防 LLM 偶发非零填充。
function normalizeDate(v, fallback) {
  const t = String(v == null ? '' : v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/) // 末尾 \D* 容「2026年6月9日」的「日」，否则锚死结尾匹配不上回退兜底
  if (m) {
    const z = (n) => String(n).padStart(2, '0')
    return `${m[1]}-${z(m[2])}-${z(m[3])}`
  }
  return fallback
}

// 事件时间归一（records.time，精确到分）：'YYYY-MM-DD HH:mm'（含带秒 / 单数位时分）→ 补零归一；
// 仅日期 'YYYY-MM-DD' → 原样（不强加时间，旧记录 / AI 未给时保持纯日期）；解析不出回退 fallback。
// 字典序仍单调（日期段定长零填充，时间段在其后），兽医小结按 time 排不失真。
function normalizeDateTime(v, fallback) {
  const t = String(v == null ? '' : v).trim()
  const z = (n) => String(n).padStart(2, '0')
  let m = t.match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})[ T](\d{1,2}):(\d{1,2})/)
  if (m) return `${m[1]}-${z(m[2])}-${z(m[3])} ${z(m[4])}:${z(m[5])}`
  m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/)
  if (m) return `${m[1]}-${z(m[2])}-${z(m[3])}`
  return fallback
}

// 事件时间 → created_at（ms，东八区）：有分用准点；仅日期用中午 12:00（延续历史导入约定，
// 避免补录旧记录按 created_at 排到主时间线顶）；都不是回退当前时刻。主时间线 / 体重图按此排序。
function createdAtFromTime(dt) {
  const s = String(dt || '').trim()
  let m = s.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/)
  if (m) return Date.parse(`${m[1]}T${m[2]}:00+08:00`) || Date.now()
  m = s.match(/^(\d{4}-\d{2}-\d{2})$/)
  if (m) return Date.parse(`${m[1]}T12:00:00+08:00`) || Date.now()
  return Date.now()
}

// 费用容错：number 原样；"480" / "480元" 取数；空 / 无数字串（如「免费」「未知」）/ 非数 → null
// 注意：必须在 Number() 前判空串，否则 Number('')===0 会把无数字串错判成 0，污染「免费就诊(0)」语义
function numOrNull(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null || v === '') return null
  const s = String(v).replace(/[^\d.]/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// 宠物名模糊匹配（ADR-015，与 parseRecord 同款，云函数目录隔离须两处同步改）：
// 编辑距离 ≤1（≥2 字名错 / 漏一字）或互相包含（简称）。【唯一候选才返回】，歧义回 null 交用户选，绝不猜。
// 按 Unicode code point 切分：emoji 名（如「🐶」）是 UTF-16 代理对，按 .length 算会绕过单字护栏 + 不同动物 emoji 互距 1 误 snap。
function fuzzyMatchPet(name, names) {
  if (!name) return null
  const cp = (s) => Array.from(String(s))
  const dist = (A, B) => {
    const m = A.length, n = B.length
    if (Math.abs(m - n) > 1) return 9
    const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)])
    for (let j = 0; j <= n; j++) d[0][j] = j
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1))
    return d[m][n]
  }
  const A = cp(name)
  const cands = new Set()
  for (const n of names) {
    const B = cp(n)
    if (Math.max(A.length, B.length) >= 2 && dist(A, B) <= 1) cands.add(n)
    else if (A.length >= 2 && B.length >= 2 && (n.includes(name) || name.includes(n))) cands.add(n)
  }
  return cands.size === 1 ? [...cands][0] : null
}

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

  // 宠物名统一解析（ADR-015 + 评审硬化）：record / reminder 都先验名（med_stock 无宠跳过），
  // 且必须在任何写入之前（PET_UNKNOWN 零写入）。规则：
  // - 在库 → 直用；
  // - record 且显式新增意图(new_pet) → 放行建档；
  // - record 且家庭还没有任何宠物 → 视同新增（0 宠无可匹配对象，不放行就是首录死端；确认卡片已展示「将建档」）；
  // - 其余一律拒 PET_UNKNOWN（附名单 + fuzzy 建议名）。【不做静默 snap】：parse 层 snap 用户在确认卡片可见，
  //   落库层名字不在库属异常态（名单已变 / 绕过 UI），静默改派=把记录写进别的宠物，医疗数据不可猜。
  const resolvedPet = String((r && r.pet) || '').trim()
  let petExists = false
  if (resolvedPet && r.kind !== 'med_stock') {
    const names = (await db.collection('pets').where({ family_id: familyId }).field({ name: true }).get()).data
      .map((p) => p.name)
      .filter(Boolean)
    petExists = names.includes(resolvedPet)
    if (!petExists) {
      const isRecord = r.kind !== 'reminder'
      const explicitNew = isRecord && r.new_pet === true
      const firstPet = isRecord && names.length === 0
      if (!explicitNew && !firstPet) {
        const suggest = fuzzyMatchPet(resolvedPet, names) || ''
        return { ok: false, code: 'PET_UNKNOWN', msg: `没找到叫「${resolvedPet}」的宠物，请选择已有宠物`, pets: names, suggest }
      }
    }
  }

  // 提醒
  if (r.kind === 'reminder') {
    if (!r.rem_title && !r.pet) return { ok: false, code: 'EMPTY_REMINDER', msg: '提醒内容缺失' }
    await db.createCollection('reminders').catch(() => {}) // 幂等兜底
    const TYPES = ['用药', '疫苗', '驱虫', '养护', '其它'] // ADR-024 加「养护」（爬宠 / 鱼提醒分类）
    const remRes = await db.collection('reminders').add({
      data: {
        family_id: familyId,
        pet: resolvedPet,
        type: TYPES.includes(r.rem_type) ? r.rem_type : '其它',
        title: r.rem_title || '',
        next_date: normalizeDate(r.rem_date, ''),
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
        expire_date: normalizeDate(r.med_expire, ''),
        created_at: Date.now(),
      },
    })
    return { ok: true, id: medRes._id, kind: 'med_stock' }
  }

  const eventTime = normalizeDateTime(r.time, '') // 事件时间，精确到分（旧 / AI 未给时为纯日期）
  const params = sanitizeParams(r.params) // 养护参数（ADR-024）：爬宠温湿度 / 鱼水质等，缺省不写
  const doc = {
    family_id: familyId,
    pet: resolvedPet,
    time: eventTime,
    event_type: EVENT_TYPES.includes(r.event_type) ? r.event_type : '其它',
    weight: typeof r.weight === 'number' ? r.weight : null,
    med: r.med || null,
    hospital: (r.hospital || '').trim(), // 就诊医院（见 ADR-012）
    cost: numOrNull(r.cost), // 费用（元）
    tag: (r.tag || '').trim(), // 病程标签（与 event_type 双轴）；trim 防同名病程线因首尾空格散裂
    desc: (r.desc || '').trim(), // 干净事件描述（不含费用 / 医院），给兽医小结拼接用，不暴露 raw 原话
    raw: r.raw || '',
    attachments: [], // 附件列表（见 ADR-011），上传后由 attachment 云函数登记
    att_count: 0,
    created_at: createdAtFromTime(eventTime), // 由事件时间派生（精确到分；缺时中午），主时间线按此排
  }
  if (params && doc.event_type === '养护') doc.params = params // 养护参数仅落「养护」记录（event_type 门控，防 params 串到非养护记录）
  const addRes = await db.collection('records').add({ data: doc })

  // 宠物 upsert（按家庭）：已有的若带体重则更新最新体重；建档只剩「new_pet 显式意图 / 0 宠首录」两条路（上方守卫保证）
  let petCreated = false
  if (doc.pet) {
    const petRes = await db.collection('pets').where({ family_id: familyId, name: doc.pet }).get()
    if (petRes.data.length) {
      const p = petRes.data[0]
      // 仅当新记录日期 >= 已存最新体重日期时才回写，避免补录旧体重把「最新」覆盖回退
      const wDate = (doc.time || '').slice(0, 10) // latest_weight_date 保持纯日期语义（time 现含到分）
      if (doc.weight && (!p.latest_weight_date || wDate >= p.latest_weight_date)) {
        await db.collection('pets').doc(p._id).update({ data: { latest_weight: doc.weight, latest_weight_date: wDate } })
      }
    } else {
      // 字段集与 pets add 对齐（缺省值），避免后续读取 undefined 漂移
      await db.collection('pets').add({
        data: {
          family_id: familyId,
          name: doc.pet,
          species: normSpecies(r.species),
          breed: '',
          birthday: '',
          neutered: false,
          allergy: '',
          chronic: '',
          home_date: '',
          note: '',
          intro: '',
          price_base: null,
          avatar: '',
          avatar_emoji: '',
          latest_weight: doc.weight || null,
          latest_weight_date: doc.weight ? (doc.time || '').slice(0, 10) : '',
          created_at: Date.now(),
        },
      })
      petCreated = true
    }
  }

  return { ok: true, id: addRes._id, petCreated, pet: doc.pet }
}
