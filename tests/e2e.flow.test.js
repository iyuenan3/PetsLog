// 后端端到端集成测试（E2E flow）：把【真实】云函数代码串成一条链跑——共享一个内存 DB，mock 掉 LLM 的 HTTPS。
// 覆盖：自然语言 → parseRecord（raw 服务端逐字 / tag 候选喂入 / 物种标注，ADR-020）→ saveRecord 落库 →
//       timeline course 聚合 + list_tags 全集（ADR-019）→ importNotion clean_tags 治理（ADR-019）。
// 与各 *.cloudfn.test.js 的单函数 mock 不同：这里多个函数共享同一 DB，验跨函数契约（parse 输出形状 ↔ save 入参 ↔ course 读取）。
// 跑法：node tests/e2e.flow.test.js
const Module = require('module')
const path = require('path')

// ---------- 内存 DB（支持 where/_.in/_.neq/_.inc + field/orderBy/skip/limit/doc/get/update/add/remove/count）----------
function clone(o) { return JSON.parse(JSON.stringify(o)) }
function matchRow(row, where) {
  return Object.entries(where || {}).every(([k, v]) => {
    if (v && typeof v === 'object' && v.__cmd === 'in') return v.v.includes(row[k])
    if (v && typeof v === 'object' && v.__cmd === 'neq') return row[k] !== v.v
    return row[k] === v
  })
}
function applyUpdate(doc, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && v.__cmd === 'inc') doc[k] = (Number(doc[k]) || 0) + v.n
    else doc[k] = v
  }
}
const _ = { in: (v) => ({ __cmd: 'in', v }), neq: (v) => ({ __cmd: 'neq', v }), inc: (n) => ({ __cmd: 'inc', n }) }
let SEQ = 0
class Coll {
  constructor(db, name) { this.db = db; this.name = name; this._where = null; this._skip = 0; this._limit = Infinity; this._docId = undefined }
  rows() { return this.db.data[this.name] || (this.db.data[this.name] = []) }
  where(c) { this._where = c; return this }
  field() { return this }
  orderBy() { return this }
  skip(n) { this._skip = n; return this }
  limit(n) { this._limit = n; return this }
  doc(id) { this._docId = id; return this }
  async get() {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) throw new Error('nf'); return { data: clone(d) } }
    const rows = this.rows().filter((r) => matchRow(r, this._where))
    const end = this._skip === 0 && this._limit === Infinity ? undefined : this._skip + this._limit
    return { data: rows.slice(this._skip, end).map(clone) }
  }
  async count() { return { total: this.rows().filter((r) => matchRow(r, this._where)).length } }
  async update({ data }) {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) return { stats: { updated: 0 } }; applyUpdate(d, data); return { stats: { updated: 1 } } }
    let n = 0; for (const r of this.rows().filter((x) => matchRow(x, this._where))) { applyUpdate(r, data); n++ } return { stats: { updated: n } }
  }
  async remove() {
    if (this._docId !== undefined) { const i = this.rows().findIndex((r) => r._id === this._docId); if (i >= 0) this.rows().splice(i, 1); return { stats: { removed: i >= 0 ? 1 : 0 } } }
    const before = this.rows().length; this.db.data[this.name] = this.rows().filter((r) => !matchRow(r, this._where)); return { stats: { removed: before - this.db.data[this.name].length } }
  }
  async add({ data }) { const doc = clone(data); doc._id = data._id || 'id_' + ++SEQ; this.rows().push(doc); return { _id: doc._id } }
}
class DB { constructor() { this.data = {}; this.command = _ } collection(n) { return new Coll(this, n) } createCollection() { return Promise.resolve() } }

const DB_INST = new DB()
let CUR_OPENID = 'u'
const fakeCloud = { init() {}, DYNAMIC_CURRENT_ENV: 'env', database: () => DB_INST, getWXContext: () => ({ OPENID: CUR_OPENID }) }

// ---------- mock LLM 上游（parseRecord 走 https.request）----------
let NEXT_LLM = '{}' // 测试在每次 parse 前设置「LLM 会返回的 assistant JSON 字符串」
let LAST_REQ = null // 抓最近一次发给 LLM 的请求体（验 tag 候选 / 物种 喂入）
const fakeHttps = {
  request(options, cb) {
    const h = {}
    const res = { on: (ev, fn) => { h[ev] = fn; return res } }
    const req = {
      on: () => req,
      write: (p) => { try { LAST_REQ = JSON.parse(p) } catch (e) {} return req },
      end: () => {
        setImmediate(() => {
          cb(res) // parseRecord 在 cb 内注册 res.on('data'/'end')
          const body = JSON.stringify({ choices: [{ message: { content: NEXT_LLM } }] })
          h.data && h.data(body)
          h.end && h.end()
        })
      },
      destroy: () => {},
    }
    return req
  },
}

// 环境：parseRecord 模块加载时读 ARK_API_KEY（设 test 让 TOKEN truthy，否则返回 NO_GATEWAY）
process.env.ARK_API_KEY = 'test-token'

const origLoad = Module._load
Module._load = function (request) {
  if (request === 'wx-server-sdk') return fakeCloud
  if (request === 'https') return fakeHttps
  if (request === './config.local') return {} // 不加载本地真 key 文件
  if (request === './data.json') return {} // 安全：绝不在测试里加载含真实宠物名的 data.json
  return origLoad.apply(this, arguments)
}

const parseRecord = require(path.join(__dirname, '..', 'cloudfunctions', 'parseRecord', 'index.js'))
const saveRecord = require(path.join(__dirname, '..', 'cloudfunctions', 'saveRecord', 'index.js'))
const timeline = require(path.join(__dirname, '..', 'cloudfunctions', 'timeline', 'index.js'))
const importNotion = require(path.join(__dirname, '..', 'cloudfunctions', 'importNotion', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }

;(async () => {
  // 种子：家庭 + 管理员成员 + 2 宠
  DB_INST.data.family_members = [{ family_id: 'F1', openid: 'u', role: 'admin' }]
  DB_INST.data.families = [{ _id: 'F1', name: '测试家', owner: 'u', storage_bytes: 0 }]
  DB_INST.data.pets = [
    { _id: 'p1', family_id: 'F1', name: '示例猫', species: 'cat', latest_weight: null, latest_weight_date: '' },
    { _id: 'p2', family_id: 'F1', name: '示例狗', species: 'dog', latest_weight: null, latest_weight_date: '' },
  ]
  CUR_OPENID = 'u'

  // ── E2E-1：自然语言 → parseRecord，raw 服务端逐字（LLM 乱填 raw 也被覆盖，ADR-020）+ 字段抽取 ──
  const input1 = '示例猫今天复查尿闭花了300'
  NEXT_LLM = JSON.stringify({ kind: 'record', valid: true, pet: '示例猫', new_pet: false, species: 'cat', time: '2026-03-01', event_type: '就医', weight: 4.5, med: null, hospital: '爱康', cost: 300, tag: '尿闭', desc: '复查尿闭', raw: 'LLM 乱填的原文不该被采用' })
  const p1 = await parseRecord.main({ text: input1, family_id: 'F1' })
  assert(p1.ok === true && p1.parsed, 'E2E-1 parse 成功')
  assert(p1.parsed.raw === input1, 'E2E-1 raw 服务端逐字：= 用户输入原文，不取 LLM 回填（ADR-020）')
  assert(p1.parsed.tag === '尿闭' && p1.parsed.cost === 300 && p1.parsed.pet === '示例猫', 'E2E-1 字段抽取正确')

  // ── E2E-2：把 parse 结果交 saveRecord 落库（验跨函数契约：parse 输出形状 = save 入参）──
  const s1 = await saveRecord.main({ record: p1.parsed, family_id: 'F1' })
  assert(s1.ok === true, 'E2E-2 save 成功')
  const rec1 = (DB_INST.data.records || []).find((r) => r.tag === '尿闭')
  assert(!!rec1 && rec1.raw === input1 && rec1.cost === 300 && rec1.pet === '示例猫', 'E2E-2 落库 raw=原文 + cost + pet')

  // ── E2E-3：再 parse 一次，验「该家庭已存的病程 tag」+ 物种 被喂进 LLM 输入（courseTags→buildMessages 端到端）──
  NEXT_LLM = JSON.stringify({ kind: 'record', valid: true, pet: '示例猫', new_pet: false, species: 'cat', time: '2026-03-10', event_type: '就医', tag: '尿闭', desc: '复查', raw: 'x' })
  await parseRecord.main({ text: '示例猫尿闭复查', family_id: 'F1' })
  const userMsg = LAST_REQ.messages[LAST_REQ.messages.length - 1].content
  assert(userMsg.includes('【病程标签】') && userMsg.includes('尿闭'), 'E2E-3 tag 候选：库内已存的「尿闭」喂进 LLM 输入')
  assert(userMsg.includes('示例猫(cat)') && userMsg.includes('示例狗(dog)'), 'E2E-3 宠物名带物种标注喂入')

  // ── E2E-4：再落一条「尿闭」记录凑成病程，timeline course 服务端聚合（ADR-019）──
  await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-01-01', event_type: '就医', cost: 200, weight: 4.8, tag: '尿闭', desc: '首诊', raw: '示例猫尿闭首诊' }, family_id: 'F1' })
  const course = await timeline.main({ action: 'course', tag: '尿闭', family_id: 'F1' })
  assert(course.ok === true && course.summary.count === 2, 'E2E-4 course 取 2 条尿闭')
  assert(course.summary.costSum === 500, 'E2E-4 course 已记花费 500（300+200）')
  assert(course.summary.weights.length === 2, 'E2E-4 course 体重序列 2 点（单宠）')
  assert(course.summary.firstDate === '2026-01-01' && course.summary.lastDate === '2026-03-01', 'E2E-4 course 起止日期')
  assert(course.summary.pets.length === 1 && course.summary.pets[0] === '示例猫', 'E2E-4 course 单宠')

  // ── E2E-5：list_tags 全集含尿闭 ──
  const lt = await timeline.main({ action: 'list_tags', family_id: 'F1' })
  assert(lt.ok === true && lt.tags.includes('尿闭'), 'E2E-5 list_tags 含「尿闭」')

  // ── E2E-6：clean_tags 治理——落一条非病程「驱虫」tag，dryRun 预览 → 真清，病程 tag 不动 ──
  await saveRecord.main({ record: { kind: 'record', pet: '示例狗', time: '2026-02-01', event_type: '驱虫', tag: '驱虫', desc: '体外驱虫', raw: '示例狗驱虫' }, family_id: 'F1' })
  const dry = await importNotion.main({ action: 'clean_tags', family_name: '测试家' })
  assert(dry.ok === true && dry.dryRun === true && dry.matched === 1 && dry.byTag['驱虫'] === 1 && dry.cleared === 0, 'E2E-6 clean_tags dryRun 命中驱虫 1 不写')
  const apply = await importNotion.main({ action: 'clean_tags', family_name: '测试家', dryRun: false })
  assert(apply.cleared === 1, 'E2E-6 clean_tags 真清 1 条')
  const deworm = (DB_INST.data.records || []).find((r) => r.desc === '体外驱虫')
  assert(deworm && deworm.tag === '' && deworm.raw === '示例狗驱虫', 'E2E-6 驱虫 tag 清空，raw 原文不碰')
  assert((DB_INST.data.records || []).filter((r) => r.tag === '尿闭').length === 2, 'E2E-6 病程 tag「尿闭」不受治理影响')

  // ── E2E-7：list_tags 治理后只剩病程 tag（驱虫已清）──
  const lt2 = await timeline.main({ action: 'list_tags', family_id: 'F1' })
  assert(lt2.tags.includes('尿闭') && !lt2.tags.includes('驱虫'), 'E2E-7 治理后 list_tags 含尿闭、不含驱虫')

  // ── E2E-8：多宠同事件批量（ADR-029 Round 1）：NL 点到两只 → parse snap pets[]（含错别字归一）→ saveRecord fan-out 各存一条 ──
  NEXT_LLM = JSON.stringify({ kind: 'record', valid: true, pet: '示例猫', pets: ['示例猫', '示列狗'], new_pet: false, species: 'cat', time: '2026-05-01', event_type: '驱虫', med: '体外驱虫', desc: '体外驱虫', tag: '', raw: 'x' })
  const pb = await parseRecord.main({ text: '给示例猫和示例狗都做了体外驱虫', family_id: 'F1' })
  assert(pb.ok === true && Array.isArray(pb.parsed.pets) && pb.parsed.pets.length === 2, 'E2E-8 parse 返回 pets 数组(2)')
  assert(pb.parsed.pets.includes('示例猫') && pb.parsed.pets.includes('示例狗'), 'E2E-8 pets snap：错别字「示列狗」归一到示例狗')
  const recsBefore = (DB_INST.data.records || []).length
  const sb = await saveRecord.main({ record: pb.parsed, family_id: 'F1' })
  assert(sb.ok === true && sb.count === 2 && sb.ids.length === 2, 'E2E-8 saveRecord fan-out 返回 count=2 + ids')
  const batchRecs = (DB_INST.data.records || []).filter((r) => r.time === '2026-05-01' && r.desc === '体外驱虫')
  assert(batchRecs.length === 2 && batchRecs.some((r) => r.pet === '示例猫') && batchRecs.some((r) => r.pet === '示例狗'), 'E2E-8 落 2 条分属两只')
  assert((DB_INST.data.records || []).length === recsBefore + 2, 'E2E-8 只新增 2 条（无多写）')

  // ── E2E-9：批量含不存在的宠物 → 整批拒 PET_UNKNOWN 零写入（守 ADR-015 红线）──
  const recsBefore2 = (DB_INST.data.records || []).length
  const sbad = await saveRecord.main({ record: { kind: 'record', pets: ['示例猫', '幽灵'], time: '2026-05-02', event_type: '体重', weight: 5, desc: 'x', raw: 'x' }, family_id: 'F1' })
  assert(sbad.ok === false && sbad.code === 'PET_UNKNOWN' && Array.isArray(sbad.missing) && sbad.missing.includes('幽灵'), 'E2E-9 含不存在宠物整批拒 + missing 列幽灵')
  assert((DB_INST.data.records || []).length === recsBefore2, 'E2E-9 零写入')

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
