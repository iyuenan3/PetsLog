const cloud = require('wx-server-sdk')
const https = require('https')
const { buildMessages } = require('./prompt')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 集中鉴权守卫：family_id 由客户端传入、可伪造，必须校验成员资格（见 ADR-008）。
async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 上游 LLM = 火山方舟 Coding Plan 直连（OpenAI 兼容协议，见 ADR-016；不再走自建 newapi 中转，无自签 CA）。
// 端点 / 模型有公开默认值，唯一机密是 ARK_API_KEY：优先云函数环境变量，否则读 config.local.js
// （gitignore 排除、不入公开仓，但随云函数上传到你的私有云端）。
let local = {}
try {
  local = require('./config.local')
} catch (e) {
  /* 没有本地配置就用环境变量 */
}
const BASE_URL = process.env.ARK_BASE_URL || local.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/coding/v3'
const TOKEN = process.env.ARK_API_KEY || local.ARK_API_KEY || ''
const MODEL = process.env.ARK_MODEL || local.ARK_MODEL || 'doubao-seed-2.0-pro'
const DAILY_LIMIT = Number(process.env.DAILY_PARSE_LIMIT || local.DAILY_PARSE_LIMIT || 50)

// 首次调用自动建齐数据库集合（省去手动在控制台新建）。warm 容器内只建一次。
let dbReady = false
async function ensureCollections() {
  if (dbReady) return
  for (const name of ['pets', 'records', 'meds', 'parse_log', 'reminders']) {
    try {
      await db.createCollection(name)
    } catch (e) {
      // 集合已存在等情况忽略
    }
  }
  dbReady = true
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const text = ((event && event.text) || '').trim()
  const familyId = event && event.family_id
  if (!text) return { ok: false, code: 'EMPTY', msg: '请输入内容' }
  if (!TOKEN) return { ok: false, code: 'NO_GATEWAY', msg: 'AI 上游未配置（ARK_API_KEY，见 config.local.js）' }

  await ensureCollections()

  try {
    await assertMember(OPENID, familyId)
  } catch (e) {
    return { ok: false, code: e.code || 'AUTH', msg: e.msg || '无权限' }
  }

  const today = todayStr()

  // 频率限制：当天解析次数（按家庭，见 ADR-008）
  const used = await db.collection('parse_log').where({ family_id: familyId, day: today }).count()
  if (used.total >= DAILY_LIMIT) {
    return { ok: false, code: 'RATE_LIMIT', msg: `今日记录次数已达上限（${DAILY_LIMIT}）` }
  }

  // 取家庭已有宠物（名 + 物种）：名用于服务端实体匹配，物种喂 LLM 助 species 判断 / 同名消歧（ADR-020）
  const petsRes = await db.collection('pets').where({ family_id: familyId }).field({ name: true, species: true }).get()
  const pets = petsRes.data.filter((p) => p.name)
  const petNames = pets.map((p) => p.name)

  // 病程标签候选（ADR-020）：喂 LLM「优先复用该家庭已用病程 tag」，把开放集收敛成准闭集、提 tag 准确率。
  // 治理后非病程 tag 已清（ADR-019），库里剩的 tag 即病程线；新家庭为空（不喂跨家庭静态全集，免污染）。
  // limit 1000 = 候选启发式上限（现实家庭记录数远低于此，病程 tag 高频复现，足以覆盖全集，不必为候选分页拖慢每次解析）；
  // Phase 1 的 timeline `list_tags`（distinct，ADR-019）落地后改走它，chip 全集与 LLM 候选一份两用。
  const tagRes = await db.collection('records').where({ family_id: familyId }).field({ tag: true }).limit(1000).get().catch(() => ({ data: [] }))
  const courseTags = [...new Set(tagRes.data.map((r) => (r.tag || '').trim()).filter(Boolean))]

  let parsed
  try {
    parsed = await callGateway(text, pets, courseTags, today)
  } catch (e) {
    return { ok: false, code: 'LLM_ERROR', msg: 'AI 解析失败', detail: String((e && e.message) || e) }
  }

  // 宠物名解析（ADR-015，建档凭意图不凭名字）：
  // ① LLM 已被提示词要求把错别字归一到已有名；② 漏网的服务端模糊兜底（唯一近似才 snap，歧义不猜）；
  // ③ 都不中且非显式新增意图 → pet_unknown，前端确认卡片让用户从已有宠物里选。
  // 0 宠家庭首录视同新增（无可匹配对象 = 无错别字风险；不放行则首录死端。确认卡片会显示「🆕 将建档」，点确认即同意）
  if (parsed.kind === 'record' && parsed.pet && !petNames.length) parsed.new_pet = true
  if (parsed.pet && !parsed.new_pet && !petNames.includes(parsed.pet)) {
    const snapped = fuzzyMatchPet(parsed.pet, petNames)
    if (snapped) parsed.pet = snapped
  }
  parsed.pet_unknown = !!parsed.pet && !parsed.new_pet && !petNames.includes(parsed.pet)
  // is_new = 显式新增意图且名字确实是新的（确认卡片 🆕 将建档只在此时显示）
  parsed.is_new = !!parsed.new_pet && !!parsed.pet && !petNames.includes(parsed.pet)

  // 批量预选（ADR-029 Round 1）：把 LLM 列的多只逐一 snap 到已有名，只保留确定匹配的（批量不猜不建档）；
  // snap 后去重，<2 只视作单宠清空（不触发前端多选态）。建档 / 错别字态不批量（单宠通道优先）。
  if (Array.isArray(parsed.pets) && parsed.pets.length && !parsed.is_new) {
    const resolved = []
    for (const nm of parsed.pets) {
      if (petNames.includes(nm)) resolved.push(nm)
      else {
        const s = fuzzyMatchPet(nm, petNames)
        if (s) resolved.push(s)
      }
    }
    parsed.pets = [...new Set(resolved)]
    if (parsed.pets.length < 2) parsed.pets = []
  } else {
    parsed.pets = []
  }

  // 记一条解析流水用于限流（落库在 saveRecord，二次确认后）
  await db.collection('parse_log').add({ data: { family_id: familyId, day: today, at: Date.now() } })

  // pets 名单随返回带回：pet_unknown 时前端直接渲染选择 chips，免再发一次 list 请求。
  // petSpecies 名→物种映射（ADR-023/024）：确认卡片重选已有宠时前端据此同步 species，驱动物种感知的 event_type / 养护表单。
  const petSpecies = pets.reduce((m, p) => ((m[p.name] = p.species), m), {})
  return { ok: true, parsed, pets: petNames, petSpecies }
}

function callGateway(text, pets, tags, today) {
  return new Promise((resolve, reject) => {
    // 注：doubao 系上游对 response_format=json_object 支持不稳（auto-llm 时代实测 400），
    // 不依赖它，靠强提示词 + temperature 0 + 下方 extractJson 解析容错。
    const payload = JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: buildMessages(text, pets, tags, today),
    })
    const u = new URL(BASE_URL.replace(/\/$/, '') + '/chat/completions')
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + TOKEN,
        'Content-Length': Buffer.byteLength(payload),
      },
      // 复杂输入 + 冷启动 + 网关延迟下，LLM 生成可达 20s+，HTTP 超时给到 45s（须 < 云函数超时 60s，
      // 让 HTTP 先抛 gateway timeout 而非被云函数硬杀）。云函数超时在控制台调（见 MEMORY）。
      timeout: 45000,
    }
    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', (d) => (body += d))
      res.on('end', () => {
        try {
          const j = JSON.parse(body)
          const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content
          if (!content) return reject(new Error('empty completion: ' + body.slice(0, 200)))
          resolve(normalize(extractJson(content), text, today))
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error('gateway timeout')))
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

// 解析容错：去掉可能的 ```json 围栏，截取第一个 { 到最后一个 }
function extractJson(s) {
  let t = String(s).trim()
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  const i = t.indexOf('{')
  const j = t.lastIndexOf('}')
  if (i >= 0 && j > i) t = t.slice(i, j + 1)
  return JSON.parse(t)
}

// 宠物名模糊匹配（ADR-015，与 saveRecord 同款，云函数目录隔离须两处同步改）：
// 编辑距离 ≤1（≥2 字名错 / 漏一字）或互相包含（简称）。【唯一候选才返回】，歧义（如「小X」系列互距 1）回 null 交用户选，绝不猜。
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

// 物种枚举白名单（ADR-023）：命中取值，非法 / 旧值落 other（前端 src/species.js 持同序副本）。
const SPECIES_KEYS = ['cat', 'dog', 'rabbit', 'rodent', 'bird', 'reptile', 'fish', 'other']
const normSpecies = (s) => (SPECIES_KEYS.includes(s) ? s : 'other')

function normalize(o, raw, today) {
  const kind = ['med_stock', 'reminder'].includes(o.kind) ? o.kind : 'record'
  return {
    kind,
    valid: o.valid !== false,
    pet: String(o.pet || '').trim(), // trim 与 saveRecord 对齐，否则尾空格让精确名误判 pet_unknown；String 防 LLM 输出数字名
    pets: Array.isArray(o.pets) ? [...new Set(o.pets.map((x) => String(x || '').trim()).filter(Boolean))] : [], // 多宠同事件（ADR-029），main 再 snap 到已有名
    new_pet: o.new_pet === true, // 显式新增宠物意图（ADR-015），缺省 false
    species: normSpecies(o.species), // ADR-023 多物种白名单（原 dog?'dog':'cat' 二元钳制会把 rabbit 等强改回 cat）
    time: normalizeDateTime(o.time, today), // 事件时间，精确到分（缺时分则纯日期，前端补默认）
    event_type: o.event_type || '其它',
    weight: typeof o.weight === 'number' ? o.weight : null,
    med: o.med || null,
    // 就诊医院 / 费用 / 病程标签（record 分支，见 ADR-012）；自由文本源头 trim，防同名病程线散裂
    hospital: (o.hospital || '').trim(),
    cost: numOrNull(o.cost),
    tag: (o.tag || '').trim(),
    // 干净的事件描述（不含费用 / 医院），给兽医小结拼接用，不暴露 raw 原话（见用户决策）
    desc: (o.desc || '').trim(),
    // 养护参数（ADR-024）：仅养护记录有，透传 LLM 抽取的对象（saveRecord 落库前再 sanitize）；非对象置 null
    params: o.params && typeof o.params === 'object' && !Array.isArray(o.params) ? o.params : null,
    med_name: o.med_name || '',
    med_effect: o.med_effect || '',
    med_quantity: typeof o.med_quantity === 'number' ? o.med_quantity : Number(o.med_quantity) || 1,
    med_expire: normalizeDate(o.med_expire, ''),
    // 提醒字段
    rem_type: o.rem_type || '其它',
    rem_title: o.rem_title || '',
    rem_date: normalizeDate(o.rem_date, ''),
    rem_repeat_days: typeof o.rem_repeat_days === 'number' ? o.rem_repeat_days : Number(o.rem_repeat_days) || 0,
    // ADR-020：原文逐字落库，以服务端收到的用户 text 为准，不取 LLM 回填的 raw（防 LLM 改错别字 / 吞字致原文失真）
    raw,
  }
}

// 日期归一：保证落库的日期恒为定长零填充 'YYYY-MM-DD'，否则字典序排序（兽医小结按 time 排、提醒按 next_date 比）会失真。
// 已是 'YYYY-MM-DD' 原样返回；'2026-6-9' / '2026/6/9' 等补零归一；解析不出回退 fallback。
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

// 事件时间归一（records.time，精确到分）：LLM 给出时分（如「下午3点半」→「15:30」）则保留 'YYYY-MM-DD HH:mm'；
// 只给日期则保持纯日期（前端确认卡片会补默认时分，最终落库 created_at 由 saveRecord 派生）。与 saveRecord 同款，两处同步改。
function normalizeDateTime(v, fallback) {
  const t = String(v == null ? '' : v).trim()
  const z = (n) => String(n).padStart(2, '0')
  let m = t.match(/^(\d{4})\D(\d{1,2})\D(\d{1,2})[ T](\d{1,2}):(\d{1,2})/)
  if (m) return `${m[1]}-${z(m[2])}-${z(m[3])} ${z(m[4])}:${z(m[5])}`
  m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})\D*$/)
  if (m) return `${m[1]}-${z(m[2])}-${z(m[3])}`
  return fallback
}

// 数字容错：number 原样；"480" / "480元" 取数；空 / null / 无数字串（如「免费」「未知」）/ 非数 → null
// 注意：必须在 Number() 前判空串，否则 Number('')===0 会把无数字串错判成 0，污染「免费就诊(0)」语义
function numOrNull(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null || v === '') return null
  const s = String(v).replace(/[^\d.]/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000) // 云函数为 UTC，校到东八区
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`
}
