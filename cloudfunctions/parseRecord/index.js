const cloud = require('wx-server-sdk')
const https = require('https')
const { buildMessages } = require('./prompt')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

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
  for (const name of ['pets', 'records', 'meds', 'parse_log']) {
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
  if (!text) return { ok: false, code: 'EMPTY', msg: '请输入内容' }
  if (!BASE_URL || !TOKEN) return { ok: false, code: 'NO_GATEWAY', msg: '网关未配置（云函数环境变量）' }

  await ensureCollections()

  const today = todayStr()

  // 频率限制：当天解析次数
  const used = await db.collection('parse_log').where({ _openid: OPENID, day: today }).count()
  if (used.total >= DAILY_LIMIT) {
    return { ok: false, code: 'RATE_LIMIT', msg: `今日记录次数已达上限（${DAILY_LIMIT}）` }
  }

  // 取已有宠物名单做实体匹配
  const petsRes = await db.collection('pets').where({ _openid: OPENID }).field({ name: true }).get()
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
  await db.collection('parse_log').add({ data: { _openid: OPENID, day: today, at: Date.now() } })

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
      timeout: 20000,
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
  return {
    valid: o.valid !== false,
    pet: o.pet || '',
    species: o.species === 'dog' ? 'dog' : 'cat',
    time: o.time || today,
    event_type: o.event_type || '其它',
    weight: typeof o.weight === 'number' ? o.weight : null,
    med: o.med || null,
    raw: o.raw || raw,
  }
}

function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000) // 云函数为 UTC，校到东八区
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`
}
