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

// 网关配置：优先云函数环境变量；本地开发可放 config.local.js
// （gitignore 排除、不入库，但随云函数上传到你的私有云端）。
let local = {}
try {
  local = require('./config.local')
} catch (e) {
  /* 没有本地配置就用环境变量 */
}
const BASE_URL = process.env.GATEWAY_BASE_URL || local.GATEWAY_BASE_URL || '' // 形如 https://<ip>:<port>/v1
const TOKEN = process.env.GATEWAY_TOKEN || local.GATEWAY_TOKEN || ''
const MODEL = process.env.GATEWAY_MODEL || local.GATEWAY_MODEL || 'auto-llm'
const CA = process.env.GATEWAY_CA || local.GATEWAY_CA || '' // 自签 root CA（PEM 文本）
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
  if (!BASE_URL || !TOKEN) return { ok: false, code: 'NO_GATEWAY', msg: '网关未配置（云函数环境变量）' }

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

  // 取家庭已有宠物名单做实体匹配
  const petsRes = await db.collection('pets').where({ family_id: familyId }).field({ name: true }).get()
  const petNames = petsRes.data.map((p) => p.name).filter(Boolean)

  let parsed
  try {
    parsed = await callGateway(text, petNames, today)
  } catch (e) {
    return { ok: false, code: 'LLM_ERROR', msg: 'AI 解析失败', detail: String((e && e.message) || e) }
  }

  // 标记是否为新宠物（名字不在已有列表里），供前端确认卡片提示「将建档」
  parsed.is_new = !!parsed.pet && !petNames.includes(parsed.pet)

  // 记一条解析流水用于限流（落库在 saveRecord，二次确认后）
  await db.collection('parse_log').add({ data: { family_id: familyId, day: today, at: Date.now() } })

  return { ok: true, parsed }
}

function callGateway(text, petNames, today) {
  return new Promise((resolve, reject) => {
    // 注：上游 doubao(auto-llm) 不支持 response_format=json_object（实测 400），
    // 改靠强提示词 + temperature 0 + 下方 extractJson 解析容错。
    const payload = JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: buildMessages(text, petNames, today),
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
    if (CA) options.ca = CA // 信任自签 root CA，而非 rejectUnauthorized:false
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

function normalize(o, raw, today) {
  const kind = ['med_stock', 'reminder'].includes(o.kind) ? o.kind : 'record'
  return {
    kind,
    valid: o.valid !== false,
    pet: o.pet || '',
    species: o.species === 'dog' ? 'dog' : 'cat',
    time: normalizeDate(o.time, today),
    event_type: o.event_type || '其它',
    weight: typeof o.weight === 'number' ? o.weight : null,
    med: o.med || null,
    // 就诊医院 / 费用 / 病程标签（record 分支，见 ADR-012）；自由文本源头 trim，防同名病程线散裂
    hospital: (o.hospital || '').trim(),
    cost: numOrNull(o.cost),
    tag: (o.tag || '').trim(),
    // 干净的事件描述（不含费用 / 医院），给兽医小结拼接用，不暴露 raw 原话（见用户决策）
    desc: (o.desc || '').trim(),
    med_name: o.med_name || '',
    med_effect: o.med_effect || '',
    med_quantity: typeof o.med_quantity === 'number' ? o.med_quantity : Number(o.med_quantity) || 1,
    med_expire: normalizeDate(o.med_expire, ''),
    // 提醒字段
    rem_type: o.rem_type || '其它',
    rem_title: o.rem_title || '',
    rem_date: normalizeDate(o.rem_date, ''),
    rem_repeat_days: typeof o.rem_repeat_days === 'number' ? o.rem_repeat_days : Number(o.rem_repeat_days) || 0,
    raw: o.raw || raw,
  }
}

// 日期归一：保证落库的日期恒为定长零填充 'YYYY-MM-DD'，否则字典序排序（兽医小结按 time 排、提醒按 next_date 比）会失真。
// 已是 'YYYY-MM-DD' 原样返回；'2026-6-9' / '2026/6/9' 等补零归一；解析不出回退 fallback。
function normalizeDate(v, fallback) {
  const t = String(v == null ? '' : v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/)
  if (m) {
    const z = (n) => String(n).padStart(2, '0')
    return `${m[1]}-${z(m[2])}-${z(m[3])}`
  }
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
