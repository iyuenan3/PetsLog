// 后端全链路 E2E 旅程套件（e2e.journeys）：在 e2e.flow.test.js 的 harness 之上扩 DB mock（真 orderBy / _.gt / 注入故障开关），
// 把【真实】云函数串成完整旅程跑，共享一个内存 DB、mock LLM 的 HTTPS，验「录入 → 落库 → 读回」端到端契约。
// 覆盖架构师场景矩阵 E2E-NEW-1..23（high/medium 优先）：单宠就医旅程 / 药品囤货 / 提醒全链 / 体重乱序不回退 /
//   0 宠首录建档 / Round1 fan-out 聚合读回 / Round2 multi 部分失败 / 多家庭隔离读回 / 主粮写读 seam / 改名级联 /
//   家庭解散级联 / dispatch 优先级 / parse 限流 / 体重派生失败被吞。
// 与各 *.cloudfn.test.js 单函数 mock 不同：这里多个真实云函数共享同一 DB，验跨函数契约。
// 红线：① PET_UNKNOWN 零写入 ② 家庭隔离 assertMember 全路径 ③ 向后兼容。占位名：示例猫/示例狗/示例龟/示例兔/示例鱼/测试家。
// 跑法：node tests/e2e.journeys.test.js
const Module = require('module')
const path = require('path')

// ---------- 内存 DB（在 e2e.flow 骨架上扩：真 orderBy / field 投影 / _.gt + _.lt / 注入式故障开关）----------
function clone(o) { return JSON.parse(JSON.stringify(o)) }
function matchRow(row, where) {
  return Object.entries(where || {}).every(([k, v]) => {
    if (v === undefined) return true // 忠实模拟 wx tcb:上行序列化丢弃 undefined 键 → 约束消失(无约束)。与 foods.cloudfn.test 范本对齐,否则掩盖 legacy 跨物种误清缺陷(review #3)
    if (v && typeof v === 'object' && v.__cmd) {
      if (v.__cmd === 'in') return v.v.includes(row[k])
      if (v.__cmd === 'neq') return row[k] !== v.v
      if (v.__cmd === 'gt') return typeof row[k] === 'number' && row[k] > v.v
      if (v.__cmd === 'lt') return typeof row[k] === 'number' && row[k] < v.v
      if (v.__cmd === 'gte') return typeof row[k] === 'number' && row[k] >= v.v
      return false
    }
    return row[k] === v
  })
}
function applyUpdate(doc, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && v.__cmd === 'inc') doc[k] = (Number(doc[k]) || 0) + v.n
    else doc[k] = v
  }
}
const _ = {
  in: (v) => ({ __cmd: 'in', v }),
  neq: (v) => ({ __cmd: 'neq', v }),
  inc: (n) => ({ __cmd: 'inc', n }),
  gt: (v) => ({ __cmd: 'gt', v }),
  lt: (v) => ({ __cmd: 'lt', v }),
  gte: (v) => ({ __cmd: 'gte', v }),
}
let SEQ = 0
// 故障注入开关（E2E-NEW-23）：开后 pets 集合的 update 抛错，模拟体重派生回写失败（须被 saveRecord 吞）。
let THROW_PET_UPDATE = false
class Coll {
  constructor(db, name) { this.db = db; this.name = name; this._where = null; this._skip = 0; this._limit = Infinity; this._docId = undefined; this._order = []; this._field = null }
  rows() { return this.db.data[this.name] || (this.db.data[this.name] = []) }
  where(c) { this._where = c; return this }
  field(f) { this._field = f; return this }
  orderBy(k, dir) { this._order.push([k, dir === 'desc' ? -1 : 1]); return this }
  skip(n) { this._skip = n; return this }
  limit(n) { this._limit = n; return this }
  doc(id) { this._docId = id; return this }
  _project(row) {
    if (!this._field) return clone(row)
    const out = {}
    for (const k of Object.keys(this._field)) if (this._field[k]) out[k] = row[k]
    out._id = row._id
    return clone(out)
  }
  _sorted(rows) {
    if (!this._order.length) return rows
    const ord = this._order
    return rows.slice().sort((a, b) => {
      for (const [k, dir] of ord) {
        const av = a[k], bv = b[k]
        if (av === bv) continue
        // undefined / null 排最后（稳定 tie-break，与真 tcb 不强对齐但确定性足够）
        if (av === undefined || av === null) return 1
        if (bv === undefined || bv === null) return -1
        return (av < bv ? -1 : 1) * dir
      }
      return 0
    })
  }
  async get() {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) throw new Error('nf'); return { data: clone(d) } }
    let rows = this.rows().filter((r) => matchRow(r, this._where))
    rows = this._sorted(rows)
    const end = this._skip === 0 && this._limit === Infinity ? undefined : this._skip + this._limit
    return { data: rows.slice(this._skip, end).map((r) => this._project(r)) }
  }
  async count() { return { total: this.rows().filter((r) => matchRow(r, this._where)).length } }
  async update({ data }) {
    if (THROW_PET_UPDATE && this.name === 'pets') throw new Error('injected pets.update failure')
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
const fakeCloud = {
  init() {}, DYNAMIC_CURRENT_ENV: 'env', database: () => DB_INST, getWXContext: () => ({ OPENID: CUR_OPENID }),
  // importNotion clear 级联会调云存储删文件；本套件不造附件，给 no-op 兜底
  deleteFile: async () => ({ fileList: [] }),
  uploadFile: async () => ({ fileID: 'cloud://env.bkt/att/_probe/x.txt' }),
  getTempFileURL: async ({ fileList }) => ({ fileList: (fileList || []).map((id) => ({ fileID: id, status: 0, tempFileURL: 'https://x' })) }),
}

// ---------- mock LLM 上游（parseRecord 走 https.request）----------
let NEXT_LLM = '{}'
let LAST_REQ = null
const fakeHttps = {
  request(options, cb) {
    const h = {}
    const res = { on: (ev, fn) => { h[ev] = fn; return res } }
    const req = {
      on: () => req,
      write: (p) => { try { LAST_REQ = JSON.parse(p) } catch (e) {} return req },
      end: () => {
        setImmediate(() => {
          cb(res)
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

process.env.ARK_API_KEY = 'test-token'

const origLoad = Module._load
Module._load = function (request) {
  if (request === 'wx-server-sdk') return fakeCloud
  if (request === 'https') return fakeHttps
  if (request === './config.local') return {}
  if (request === './data.json') return {} // 安全：绝不在测试里加载含真实宠物名的 data.json
  return origLoad.apply(this, arguments)
}

const parseRecord = require(path.join(__dirname, '..', 'cloudfunctions', 'parseRecord', 'index.js'))
const saveRecord = require(path.join(__dirname, '..', 'cloudfunctions', 'saveRecord', 'index.js'))
const timeline = require(path.join(__dirname, '..', 'cloudfunctions', 'timeline', 'index.js'))
const reminders = require(path.join(__dirname, '..', 'cloudfunctions', 'reminders', 'index.js'))
const foods = require(path.join(__dirname, '..', 'cloudfunctions', 'foods', 'index.js'))
const importNotion = require(path.join(__dirname, '..', 'cloudfunctions', 'importNotion', 'index.js'))
const petsFn = require(path.join(__dirname, '..', 'cloudfunctions', 'pets', 'index.js'))

// resolveCurrentFood（前端纯函数，ESM，strip-eval 直测真实源，与 foodsResolve.test 同法）
const fs = require('fs')
const resolveSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'foodsResolve.js'), 'utf8')
const resolveSandbox = { exports: {} }
new Function('module', resolveSrc.replace(/\bexport\s+/g, '') + '\nmodule.exports = { resolveCurrentFood }')(resolveSandbox)
const { resolveCurrentFood } = resolveSandbox.exports

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }

// 重置 DB 到「单家庭 F1 + admin u + 示例猫/示例狗」基线（每组旅程独立，互不串数据）
function seedF1() {
  DB_INST.data = {}
  SEQ = 0
  THROW_PET_UPDATE = false
  CUR_OPENID = 'u'
  DB_INST.data.family_members = [{ family_id: 'F1', openid: 'u', role: 'admin' }]
  DB_INST.data.families = [{ _id: 'F1', name: '测试家', owner: 'u', storage_bytes: 0 }]
  DB_INST.data.pets = [
    { _id: 'p1', family_id: 'F1', name: '示例猫', species: 'cat', latest_weight: null, latest_weight_date: '', weight_spark: [] },
    { _id: 'p2', family_id: 'F1', name: '示例狗', species: 'dog', latest_weight: null, latest_weight_date: '', weight_spark: [] },
  ]
}

;(async () => {
  // ============================================================
  // E2E-NEW-1：单宠就医旅程，一句话录入 → 落库 → 主时间线 list / 单条 get read-back
  // ============================================================
  seedF1()
  {
    const input = '示例猫今天下午两点半复查尿闭花了300'
    NEXT_LLM = JSON.stringify({ kind: 'record', valid: true, pet: '示例猫', new_pet: false, species: 'cat', time: '2026-03-01 14:30', event_type: '就医', weight: 4.5, hospital: '示例医院', cost: '300元', tag: '尿闭', desc: '复查尿闭', raw: 'LLM 乱填' })
    const p = await parseRecord.main({ text: input, family_id: 'F1' })
    assert(p.ok && p.parsed && p.parsed.cost === 300, 'NEW-1 parse：cost「300元」→300')
    const s = await saveRecord.main({ record: p.parsed, family_id: 'F1' })
    assert(s.ok && s.id, 'NEW-1 save 成功返回 id')

    const list = await timeline.main({ action: 'list', family_id: 'F1' })
    const rec = list.data.find((r) => r.tag === '尿闭')
    assert(!!rec, 'NEW-1 list read-back 含该条')
    assert(rec && rec.event_type === '就医' && rec.time === '2026-03-01 14:30' && rec.desc === '复查尿闭', 'NEW-1 list：event_type/time(到分)/desc 完整')
    assert(rec && rec.raw === input, 'NEW-1 list：raw 服务端逐字 = 用户原句（ADR-020 贯穿 parse→save→read）')
    assert(rec && rec.cost === 300 && rec.att_count === 0 && Array.isArray(rec.attachments) && rec.attachments.length === 0, 'NEW-1 list：cost=300 / att_count=0 / attachments=[]')

    const got = await timeline.main({ action: 'get', id: s.id, family_id: 'F1' })
    assert(got.ok && got.data && got.data.family_id === 'F1', 'NEW-1 get(id) 返回整 doc，family_id=F1')
    assert(got.data.raw === rec.raw && got.data.cost === rec.cost && got.data.pet === rec.pet && got.data.time === rec.time, 'NEW-1 get 逐字段 == list 同一条（raw/cost/pet/time）')
    // created_at 由 time 派生为东八区准点（14:30 → 06:30 UTC，当日毫秒余 23400000），非当前时刻
    assert(got.data.created_at % 86400000 === 23400000, 'NEW-1 created_at 由 time 派生为东八区 14:30 准点（非当前时刻）')
    assert(list.hasMore === false, 'NEW-1 hasMore 反映无续页（仅 1 条 < limit）')
  }

  // ============================================================
  // E2E-NEW-2：药品囤货旅程，NL → parse(kind=med_stock) → save 落 meds，records/pets 不动
  // ============================================================
  seedF1()
  {
    NEXT_LLM = JSON.stringify({ kind: 'med_stock', med_name: '体内驱虫药', med_effect: '驱虫', med_quantity: 2, med_expire: '2027-3-1' })
    const p = await parseRecord.main({ text: '囤了两盒体内驱虫药，2027年3月过期', family_id: 'F1' })
    assert(p.ok && p.parsed.kind === 'med_stock', 'NEW-2 parse kind=med_stock')
    assert(p.parsed.med_name === '体内驱虫药' && p.parsed.med_effect === '驱虫' && p.parsed.med_quantity === 2 && p.parsed.med_expire === '2027-03-01', 'NEW-2 parse med 字段归一带出（expire 补零）')

    const petsBefore = (DB_INST.data.pets || []).length
    const recsBefore = (DB_INST.data.records || []).length
    const s = await saveRecord.main({ record: p.parsed, family_id: 'F1' })
    assert(s.ok === true && s.kind === 'med_stock' && s.id, 'NEW-2 save 返回 {ok,kind:med_stock,id}')

    const meds = DB_INST.data.meds || []
    const med = meds.find((m) => m.name === '体内驱虫药')
    assert(med && med.effect === '驱虫' && med.quantity === 2 && med.expire_date === '2027-03-01' && med.family_id === 'F1', 'NEW-2 meds doc：name/effect/quantity/expire(补零)/family_id 正确')
    assert((DB_INST.data.records || []).length === recsBefore && (DB_INST.data.pets || []).length === petsBefore, 'NEW-2 records/pets 集合无新增（med_stock 不建档不写记录）')
  }

  // ============================================================
  // E2E-NEW-3：med_stock 缺药名 NO_MED 拒 + med 兜底名 + quantity 强制转数
  // ============================================================
  seedF1()
  {
    // (a) 空名（med_name 与 med 均空）→ NO_MED 零写入
    const s1 = await saveRecord.main({ record: { kind: 'med_stock', med_name: '', med: '', med_effect: 'x' }, family_id: 'F1' })
    assert(s1.ok === false && s1.code === 'NO_MED', 'NEW-3a 空药名 → NO_MED')
    assert((DB_INST.data.meds || []).length === 0, 'NEW-3a meds 集合无新增（NO_MED 零写入）')

    // (b) med_name 空但 med 有值 → name 取 med 兜底；quantity 字符串'3' → 3
    const s2 = await saveRecord.main({ record: { kind: 'med_stock', med_name: '', med: '布洛芬', med_quantity: '3' }, family_id: 'F1' })
    assert(s2.ok === true && s2.kind === 'med_stock', 'NEW-3b med 兜底名落库成功')
    const m2 = (DB_INST.data.meds || []).find((m) => m.name === '布洛芬')
    assert(m2 && m2.name === '布洛芬' && m2.quantity === 3, 'NEW-3b name 取 med 兜底，quantity「3」字符串强转为 3')

    // (c) 无 quantity → 缺省 1
    const s3 = await saveRecord.main({ record: { kind: 'med_stock', med_name: '钙片' }, family_id: 'F1' })
    assert(s3.ok === true, 'NEW-3c 钙片落库成功')
    const m3 = (DB_INST.data.meds || []).find((m) => m.name === '钙片')
    assert(m3 && m3.quantity === 1, 'NEW-3c 无 quantity 缺省落 1（Number()||1）')
  }

  // ============================================================
  // E2E-NEW-4：提醒旅程，NL → parse(kind=reminder) → save 落 reminders → reminders.list read-back
  // ============================================================
  seedF1()
  {
    NEXT_LLM = JSON.stringify({ kind: 'reminder', pet: '示例猫', rem_type: '驱虫', rem_title: '体外驱虫', rem_date: '2026-7-15', rem_repeat_days: 30 })
    const p = await parseRecord.main({ text: '下个月给示例猫做体外驱虫，每月一次', family_id: 'F1' })
    assert(p.ok && p.parsed.kind === 'reminder', 'NEW-4 parse kind=reminder')

    const recsBefore = (DB_INST.data.records || []).length
    const s = await saveRecord.main({ record: p.parsed, family_id: 'F1' })
    assert(s.ok === true && s.kind === 'reminder', 'NEW-4 save 返回 {ok,kind:reminder}')
    assert((DB_INST.data.records || []).length === recsBefore, 'NEW-4 records 集合无新增')

    const list = await reminders.main({ action: 'list', family_id: 'F1' })
    assert(list.ok && Array.isArray(list.data), 'NEW-4 reminders.list 成功')
    const rem = list.data.find((r) => r.title === '体外驱虫')
    assert(rem && rem.pet === '示例猫' && rem.type === '驱虫' && rem.next_date === '2026-07-15' && rem.repeat_days === 30 && rem.done === false, 'NEW-4 reminders.list 读回该条：pet/type/title/next_date(补零)/repeat_days/done')
    assert(typeof list.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(list.today), 'NEW-4 list 响应带 today 字段')
  }

  // ============================================================
  // E2E-NEW-5：错别字宠物名设提醒 → PET_UNKNOWN 零写入（reminder 防线，不建档不 snap）
  // ============================================================
  seedF1()
  {
    NEXT_LLM = JSON.stringify({ kind: 'reminder', pet: '幽灵', rem_type: '疫苗', rem_title: '打疫苗', rem_date: '2026-09-01' })
    const p = await parseRecord.main({ text: '给幽灵打疫苗', family_id: 'F1' })
    assert(p.ok === true, 'NEW-5 parse 成功')
    // 「幽灵」与示例猫/示例狗距离 >1，snap 不中，标 pet_unknown
    assert(p.parsed.pet_unknown === true, 'NEW-5 parse 侧标 pet_unknown（snap 不中）')

    const s = await saveRecord.main({ record: p.parsed, family_id: 'F1' })
    assert(s.ok === false && s.code === 'PET_UNKNOWN', 'NEW-5 save 拒 PET_UNKNOWN')
    assert(Array.isArray(s.pets) && s.pets.includes('示例猫') && s.pets.includes('示例狗') && 'suggest' in s, 'NEW-5 回传现有名单 pets + suggest')
    const remList = await reminders.main({ action: 'list', family_id: 'F1', includeDone: true })
    assert(remList.ok && remList.data.length === 0, 'NEW-5 reminders 集合仍为空（零写入红线①在 reminder 通道生效）')
    // 不静默 snap：suggest 仅建议，落库层不改派
    assert(!['示例猫', '示例狗'].includes(s.suggest), 'NEW-5 落库层不静默 snap（suggest 不得=已有宠名，绝不把幽灵改派成在库宠）')
  }

  // ============================================================
  // E2E-NEW-6：家庭级提醒（空 pet 放行）+ EMPTY_REMINDER 分支 + 重复提醒 done 顺延
  // ============================================================
  seedF1()
  {
    // (a) 空 pet + 有 title → 放行（family-level reminder）
    const sa = await saveRecord.main({ record: { kind: 'reminder', pet: '', rem_title: '家庭消毒', rem_date: '2026-10-01' }, family_id: 'F1' })
    assert(sa.ok === true && sa.kind === 'reminder', 'NEW-6a 空 pet + 有 title → 落库成功（family-level 放行）')

    // (b) 空 pet + 空 title → EMPTY_REMINDER 零写入
    const remCntBefore = (DB_INST.data.reminders || []).length
    const sb = await saveRecord.main({ record: { kind: 'reminder', pet: '', rem_title: '' }, family_id: 'F1' })
    assert(sb.ok === false && sb.code === 'EMPTY_REMINDER', 'NEW-6b 空 pet + 空 title → EMPTY_REMINDER')
    assert((DB_INST.data.reminders || []).length === remCntBefore, 'NEW-6b EMPTY_REMINDER 零写入')

    // (c) repeat_days=30 的 done → next_date 顺延一个周期，done 仍 false
    const addR = await reminders.main({ action: 'add', family_id: 'F1', reminder: { pet: '示例猫', type: '驱虫', title: '月度驱虫', next_date: '2099-01-01', repeat_days: 30 } })
    assert(addR.ok && addR.id, 'NEW-6c reminders.add repeat 提醒')
    const doneR = await reminders.main({ action: 'done', family_id: 'F1', id: addR.id })
    assert(doneR.ok && doneR.next_date === '2099-01-31', 'NEW-6c repeat done：next_date 从 max(today,next_date)=2099-01-01 顺延 30 天 → 2099-01-31')
    const remDoc = (DB_INST.data.reminders || []).find((r) => r._id === addR.id)
    assert(remDoc && remDoc.done === false, 'NEW-6c repeat done：done 保持 false（顺延不标完成）')

    // (d) repeat_days=0 的 done → done=true
    const addR0 = await reminders.main({ action: 'add', family_id: 'F1', reminder: { pet: '示例狗', type: '疫苗', title: '一次性疫苗', next_date: '2099-02-01', repeat_days: 0 } })
    const doneR0 = await reminders.main({ action: 'done', family_id: 'F1', id: addR0.id })
    assert(doneR0.ok && doneR0.done === true, 'NEW-6d repeat_days=0 done → done=true')
    const remDoc0 = (DB_INST.data.reminders || []).find((r) => r._id === addR0.id)
    assert(remDoc0 && remDoc0.done === true, 'NEW-6d 落库 done=true')
  }

  // ============================================================
  // E2E-NEW-7：养护类型提醒经两个写入口 type 白名单一致（契约漂移已修：reminders 补养护对齐 saveRecord，ADR-024）
  // ============================================================
  seedF1()
  {
    // 路径A：saveRecord（reminder 路径 TYPES 含「养护」，ADR-024）→ type='养护' 保留
    NEXT_LLM = JSON.stringify({ kind: 'reminder', pet: '示例猫', rem_type: '养护', rem_title: '换水提醒', rem_date: '2026-06-01' })
    const pa = await parseRecord.main({ text: '提醒示例猫换水', family_id: 'F1' })
    const sa = await saveRecord.main({ record: pa.parsed, family_id: 'F1' })
    assert(sa.ok && sa.kind === 'reminder', 'NEW-7A saveRecord 养护提醒落库')
    const listA = await reminders.main({ action: 'list', family_id: 'F1' })
    const remA = listA.data.find((r) => r.title === '换水提醒')
    assert(remA && remA.type === '养护', 'NEW-7A 路径A（saveRecord）落库 type=养护 保留')

    // 路径B：reminders.add（CRUD 入口，TYPES 现已含养护）→ type='养护' 保留，不再降级
    const addB = await reminders.main({ action: 'add', family_id: 'F1', reminder: { pet: '示例猫', type: '养护', title: '换水B' } })
    assert(addB.ok, 'NEW-7B reminders.add 养护提醒落库')
    const listB = await reminders.main({ action: 'list', family_id: 'F1' })
    const remB = listB.data.find((r) => r.title === '换水B')
    assert(remB && remB.type === '养护', 'NEW-7B 路径B（reminders.add，TYPES 已补养护）落库 type=养护 保留，不再静默降级')
    assert(remA.type === remB.type && remA.type === '养护', 'NEW-7 两写入口对「养护」枚举一致（契约漂移已修，两入口同源 5 桶）')
  }

  // ============================================================
  // E2E-NEW-8：乱序录入多条体重 → latest 不回退 + weight_spark 升序 + course weights 三处一致
  // ============================================================
  seedF1()
  {
    await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-03-01', event_type: '体重', weight: 4.8, tag: '体重线', desc: '中期', raw: 'a' }, family_id: 'F1' })
    await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-01-01', event_type: '体重', weight: 4.5, tag: '体重线', desc: '补录旧', raw: 'b' }, family_id: 'F1' }) // 补录旧日期
    await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-05-01', event_type: '体重', weight: 5.0, tag: '体重线', desc: '最新', raw: 'c' }, family_id: 'F1' })

    const cat = (DB_INST.data.pets || []).find((p) => p.name === '示例猫')
    assert(cat.latest_weight === 5.0 && cat.latest_weight_date === '2026-05-01', 'NEW-8 latest_weight=5.0 / date=2026-05-01（补录旧日期不把 latest 覆盖回退）')
    assert(JSON.stringify(cat.weight_spark) === JSON.stringify([4.5, 4.8, 5.0]), 'NEW-8 weight_spark=[4.5,4.8,5.0]（按 time 升序累积，不随插入序）')

    const course = await timeline.main({ action: 'course', tag: '体重线', family_id: 'F1' })
    assert(course.ok && course.summary.weights.length === 3, 'NEW-8 course.weights 含 3 点')
    const courseSeq = course.summary.weights.map((w) => w.weight)
    assert(JSON.stringify(courseSeq) === JSON.stringify([4.5, 4.8, 5.0]), 'NEW-8 course.weights 按 time 升序')
    assert(JSON.stringify(courseSeq) === JSON.stringify(cat.weight_spark), 'NEW-8 weight_spark 序列 == course.weights 序列（两条派生路径一致）')
  }

  // ============================================================
  // E2E-NEW-9：0 宠家庭首录自动建档（firstPet）+ 建档后错别字名拒
  // ============================================================
  {
    seedF1()
    // 新建空宠家庭 F2（admin u + 0 pets）
    DB_INST.data.family_members.push({ family_id: 'F2', openid: 'u', role: 'admin' })
    DB_INST.data.families.push({ _id: 'F2', name: '测试家二', owner: 'u', storage_bytes: 0 })

    // parse：0 宠 + kind=record + 有 pet → new_pet/is_new=true
    NEXT_LLM = JSON.stringify({ kind: 'record', valid: true, pet: '示例龟', new_pet: false, species: 'reptile', time: '2026-01-01', event_type: '养护', params: { temp: 28, humidity: 60 }, desc: '换水', tag: '', raw: 'x' })
    const p = await parseRecord.main({ text: '给示例龟换水，水温28度', family_id: 'F2' })
    assert(p.parsed.new_pet === true && p.parsed.is_new === true, 'NEW-9 parse：0 宠首录 → new_pet=true / is_new=true（确认卡片显将建档）')

    const s = await saveRecord.main({ record: p.parsed, family_id: 'F2' })
    assert(s.ok === true && s.petCreated === true, 'NEW-9 首录 writeRecordOne firstPet 放行 → 建出档案 petCreated=true')
    const turtle = (DB_INST.data.pets || []).find((pp) => pp.family_id === 'F2' && pp.name === '示例龟')
    assert(turtle && turtle.species === 'reptile', 'NEW-9 建档 species=reptile（normSpecies 命中）')
    const careRec = (DB_INST.data.records || []).find((r) => r.family_id === 'F2' && r.pet === '示例龟')
    assert(careRec && careRec.event_type === '养护' && careRec.params && careRec.params.temp === 28 && careRec.params.humidity === 60, 'NEW-9 养护 record 的 params 经 sanitize 落库（event_type=养护 门控通过）')

    // 非首录新名（已有 1 宠，无 new_pet）→ PET_UNKNOWN 零写入
    const recsBefore = (DB_INST.data.records || []).filter((r) => r.family_id === 'F2').length
    const s2 = await saveRecord.main({ record: { kind: 'record', pet: '示例兔', time: '2026-02-01', event_type: '症状', desc: 'x', raw: 'y' }, family_id: 'F2' })
    assert(s2.ok === false && s2.code === 'PET_UNKNOWN', 'NEW-9 非首录新名（无 new_pet）→ PET_UNKNOWN 零写入（已有宠后不再 firstPet 放行）')
    assert((DB_INST.data.records || []).filter((r) => r.family_id === 'F2').length === recsBefore, 'NEW-9 非首录新名零写入')
  }

  // ============================================================
  // E2E-NEW-10：Round1 多宠同事件 fan-out → course 聚合 + list read-back（跨宠 weights 留空 + pets 列全）
  // ============================================================
  seedF1()
  {
    NEXT_LLM = JSON.stringify({ kind: 'record', valid: true, pet: '示例猫', pets: ['示例猫', '示列狗'], new_pet: false, species: 'cat', time: '2026-05-01', event_type: '驱虫', med: '体外驱虫', weight: null, tag: '春季驱虫', desc: '体外驱虫', raw: 'x' })
    const p = await parseRecord.main({ text: '给示例猫和示例狗都驱虫', family_id: 'F1' })
    assert(Array.isArray(p.parsed.pets) && p.parsed.pets.length === 2 && p.parsed.pets.includes('示例猫') && p.parsed.pets.includes('示例狗'), 'NEW-10 parse snap 2 只（错别字「示列狗」归一）')

    const s = await saveRecord.main({ record: p.parsed, family_id: 'F1' })
    assert(s.ok && s.count === 2 && s.ids.length === 2, 'NEW-10 save fan-out count=2 + ids 长 2')
    const batch = (DB_INST.data.records || []).filter((r) => r.tag === '春季驱虫')
    assert(batch.length === 2 && batch.some((r) => r.pet === '示例猫') && batch.some((r) => r.pet === '示例狗'), 'NEW-10 落 2 条分属示例猫/示例狗，无多写')

    const course = await timeline.main({ action: 'course', tag: '春季驱虫', family_id: 'F1' })
    assert(course.ok && course.summary.count === 2, 'NEW-10 course.count=2')
    assert(course.summary.pets.length === 2 && course.summary.pets.includes('示例猫') && course.summary.pets.includes('示例狗'), 'NEW-10 course.pets 含示例猫与示例狗（跨宠）')
    assert(Array.isArray(course.summary.weights) && course.summary.weights.length === 0, 'NEW-10 course.weights=[]（跨宠不混画体重）')
    assert(course.summary.costSum === null, 'NEW-10 course.costSum=null（无 cost）')

    const list = await timeline.main({ action: 'list', family_id: 'F1' })
    const lb = list.data.filter((r) => r.tag === '春季驱虫')
    assert(lb.length === 2 && lb.some((r) => r.pet === '示例猫') && lb.some((r) => r.pet === '示例狗'), 'NEW-10 list read-back 两条都在，各带正确 pet')
  }

  // ============================================================
  // E2E-NEW-12：Round2 multi 部分失败 → results index 对齐 + 成功条落库 + list 只读回成功条
  // ============================================================
  seedF1()
  {
    NEXT_LLM = JSON.stringify({ kind: 'multi', records: [
      { pet: '示例猫', time: '2026-08-01', event_type: '症状', desc: '呕吐' },
      { pet: '外星猫', time: '2026-08-01', event_type: '症状', desc: '不明' },
    ] })
    const p = await parseRecord.main({ text: '示例猫吐了，还有只外星猫不明', family_id: 'F1' })
    assert(p.parsed.kind === 'multi' && p.parsed.records.length === 2, 'NEW-12 parse multi 2 条')
    const sub0 = p.parsed.records.find((r) => r.pet === '示例猫')
    const sub1 = p.parsed.records.find((r) => r.desc === '不明')
    assert(sub0 && sub0.pet_unknown === false, 'NEW-12 子条1 示例猫 pet_unknown=false')
    assert(sub1 && sub1.pet_unknown === true, 'NEW-12 子条2 外星猫 snap 不中 pet_unknown=true')

    const recsBefore = (DB_INST.data.records || []).length
    const s = await saveRecord.main({ record: p.parsed, family_id: 'F1' })
    assert(s.ok === true && s.kind === 'multi' && s.count === 2 && s.saved === 1, 'NEW-12 save {ok,kind:multi,count:2,saved:1}')
    assert(s.results.length === 2 && s.results[0].ok === true && s.results[1].ok === false && s.results[1].code === 'PET_UNKNOWN', 'NEW-12 results 同序同长：[0].ok=true / [1].ok=false code=PET_UNKNOWN')
    assert((DB_INST.data.records || []).length === recsBefore + 1, 'NEW-12 只落 1 条（外星猫子条零写入，部分成功非原子）')
    assert(Array.isArray(s.pets) && s.pets.includes('示例猫') && s.pets.includes('示例狗'), 'NEW-12 返回 pets=knownNames（供前端刷失败卡可选名单）')

    const list = await timeline.main({ action: 'list', family_id: 'F1' })
    const ghost = list.data.find((r) => r.desc === '不明')
    const ok0 = list.data.find((r) => r.pet === '示例猫' && r.desc === '呕吐')
    assert(!ghost && !!ok0, 'NEW-12 list read-back 仅含成功的示例猫呕吐条，无外星猫幽灵记录')
    assert(ok0 && ok0.raw === '示例猫吐了，还有只外星猫不明', 'NEW-12 幸存 multi 子条 raw=整句原文（ADR-020 契约层逐条下发，部分失败也不丢 raw，review #2）')
  }

  // ============================================================
  // E2E-NEW-15：多家庭隔离，F1 录入的记录 F2 成员经 timeline list/get/parse/save 全读不到
  // ============================================================
  {
    seedF1()
    // 两家：F1(成员u + 示例猫)，F2(成员v + 示例狗)
    DB_INST.data.family_members.push({ family_id: 'F2', openid: 'v', role: 'admin' })
    DB_INST.data.families.push({ _id: 'F2', name: '测试家二', owner: 'v', storage_bytes: 0 })
    DB_INST.data.pets.push({ _id: 'p3', family_id: 'F2', name: '示例狗', species: 'dog', latest_weight: null, latest_weight_date: '', weight_spark: [] })

    // F1 落一条记录（成员 u）
    CUR_OPENID = 'u'
    const sF1 = await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-04-01', event_type: '就医', tag: '体检线', desc: 'F1记录', cost: 100, raw: 'r1' }, family_id: 'F1' })
    assert(sF1.ok && sF1.id, 'NEW-15 F1 成员 u 落记录成功')
    const f1RecId = sF1.id

    // 非成员 v 访问 F1：list / course / list_tags / get → NOT_MEMBER（assertMember 全读路径前置）
    CUR_OPENID = 'v'
    const vList = await timeline.main({ action: 'list', family_id: 'F1' })
    assert(vList.ok === false && vList.code === 'NOT_MEMBER', 'NEW-15 非成员 v list F1 → NOT_MEMBER')
    const vCourse = await timeline.main({ action: 'course', tag: '体检线', family_id: 'F1' })
    assert(vCourse.ok === false && vCourse.code === 'NOT_MEMBER', 'NEW-15 非成员 v course F1 → NOT_MEMBER')
    const vTags = await timeline.main({ action: 'list_tags', family_id: 'F1' })
    assert(vTags.ok === false && vTags.code === 'NOT_MEMBER', 'NEW-15 非成员 v list_tags F1 → NOT_MEMBER')

    // v 用 F2 上下文 get F1 的记录 id → not found（跨家庭读防护：timeline get 校 doc.family_id===familyId）
    const vGet = await timeline.main({ action: 'get', id: f1RecId, family_id: 'F2' })
    assert(vGet.ok === false && vGet.msg === 'not found', 'NEW-15 v 用 F2 上下文 get F1 记录 → not found（跨家庭读防护）')

    // parse/save 篡改 family_id 为 F1（非 v 的家庭）→ NOT_MEMBER 零写入
    NEXT_LLM = JSON.stringify({ kind: 'record', valid: true, pet: '示例狗', species: 'dog', time: '2026-04-02', event_type: '症状', desc: 'x', raw: 'x' })
    const vParse = await parseRecord.main({ text: '示例狗咳嗽', family_id: 'F1' })
    assert(vParse.ok === false && vParse.code === 'NOT_MEMBER', 'NEW-15 v parse 篡改 family_id=F1 → NOT_MEMBER')
    const recsBefore = (DB_INST.data.records || []).length
    const vSave = await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-04-03', event_type: '症状', desc: 'x', raw: 'x' }, family_id: 'F1' })
    assert(vSave.ok === false && vSave.code === 'NOT_MEMBER', 'NEW-15 v save 篡改 family_id=F1 → NOT_MEMBER 零写入')
    assert((DB_INST.data.records || []).length === recsBefore, 'NEW-15 篡改 save 零写入')

    // F1/F2 同名宠不串档：各自 list 只见本家记录
    CUR_OPENID = 'u'
    const f1List = await timeline.main({ action: 'list', family_id: 'F1' })
    assert(f1List.ok && f1List.data.every((r) => r.family_id === 'F1'), 'NEW-15 F1 成员 list 只返回 F1 记录')
    CUR_OPENID = 'v'
    const f2List = await timeline.main({ action: 'list', family_id: 'F2' })
    assert(f2List.ok && f2List.data.every((r) => r.family_id === 'F2') && !f2List.data.some((r) => r.desc === 'F1记录'), 'NEW-15 F2 成员 list 不含 F1 记录（同名宠不串档）')
    CUR_OPENID = 'u'
  }

  // ============================================================
  // E2E-NEW-16：录主粮（物种默认）→ list → resolveCurrentFood 回落命中默认（写读 seam）
  // ============================================================
  seedF1()
  {
    const add = await foods.main({ action: 'add', family_id: 'F1', food: { species: 'cat', pet: '', brand: '示例粮', model: 'I27', current: true } })
    assert(add.ok && add.id, 'NEW-16 foods.add 成功')
    const fdoc = (DB_INST.data.foods || []).find((f) => f.brand === '示例粮')
    assert(fdoc && fdoc.species === 'cat' && fdoc.pet === '' && fdoc.current === true && fdoc.end_date === '', 'NEW-16 add 落 foods doc：species=cat / pet=空 / current=true / end_date=空')

    const list = await foods.main({ action: 'list', family_id: 'F1' })
    assert(list.ok && list.data.length === 1, 'NEW-16 list 返回 1 条')
    const r = resolveCurrentFood(list.data, '示例猫', 'cat')
    assert(r && r.brand === '示例粮', 'NEW-16 resolveCurrentFood 命中该物种默认条（override 无 → def 命中 pet=空 & species=cat）')
  }

  // ============================================================
  // E2E-NEW-17：单宠覆盖 > 物种默认 + 排他作用域 (family,species,pet) 跨物种不误清
  // ============================================================
  seedF1()
  {
    const defCat1 = await foods.main({ action: 'add', family_id: 'F1', food: { species: 'cat', pet: '', brand: '猫默认A', current: true } })
    const overCat = await foods.main({ action: 'add', family_id: 'F1', food: { species: 'cat', pet: '示例猫', brand: '猫覆盖', current: true } })
    const defDog = await foods.main({ action: 'add', family_id: 'F1', food: { species: 'dog', pet: '', brand: '狗默认', current: true } })
    assert(defCat1.ok && overCat.ok && defDog.ok, 'NEW-17 三条主粮均落库')

    const list1 = await foods.main({ action: 'list', family_id: 'F1' })
    const r1 = resolveCurrentFood(list1.data, '示例猫', 'cat')
    assert(r1 && r1.brand === '猫覆盖', 'NEW-17 resolveCurrentFood 取覆盖条（override 按名命中，优先于默认）')
    // 三条不同作用域 current 并存（猫默认 / 猫覆盖 / 狗默认互不清）
    const cur1 = (DB_INST.data.foods || []).filter((f) => f.current === true)
    assert(cur1.length === 3, 'NEW-17 三条 current=true 不同作用域并存（互不清）')

    // 再设猫默认（第二条）在喂 → 旧猫默认条 current=false（同作用域排他），狗默认不动
    const defCat2 = await foods.main({ action: 'add', family_id: 'F1', food: { species: 'cat', pet: '', brand: '猫默认B', current: true } })
    assert(defCat2.ok, 'NEW-17 第二条猫默认在喂落库')
    const old = (DB_INST.data.foods || []).find((f) => f.brand === '猫默认A')
    const dog = (DB_INST.data.foods || []).find((f) => f.brand === '狗默认')
    const overStill = (DB_INST.data.foods || []).find((f) => f.brand === '猫覆盖')
    assert(old && old.current === false, 'NEW-17 旧猫默认条 current=false（同作用域 (family,cat,空) 排他）')
    assert(dog && dog.current === true, 'NEW-17 狗默认条 current 仍 true（跨物种不误清）')
    assert(overStill && overStill.current === true, 'NEW-17 猫覆盖条 (family,cat,示例猫) current 仍 true（不同 pet 作用域不误清）')
  }

  // ============================================================
  // E2E-NEW-18：改名级联到 foods 覆盖条仍可解析 + 改物种级联台账分组
  // ============================================================
  seedF1()
  {
    await foods.main({ action: 'add', family_id: 'F1', food: { species: 'cat', pet: '示例猫', brand: '处方粮', current: true } })
    // 改名 示例猫 → 示例咪
    const rn = await petsFn.main({ action: 'update', id: 'p1', pet: { name: '示例咪' }, family_id: 'F1' })
    assert(rn.ok, 'NEW-18 pets.update 改名成功')
    const fAfterRename = (DB_INST.data.foods || []).find((f) => f.brand === '处方粮')
    assert(fAfterRename && fAfterRename.pet === '示例咪', 'NEW-18 改名级联：foods.pet 从示例猫 → 示例咪')

    const list1 = await foods.main({ action: 'list', family_id: 'F1' })
    const r1 = resolveCurrentFood(list1.data, '示例咪', 'cat')
    assert(r1 && r1.brand === '处方粮', 'NEW-18 resolveCurrentFood 用新名示例咪 仍命中覆盖条（改名不破解析）')

    // 改物种 cat → dog → foods 覆盖条 species 纠偏
    const rs = await petsFn.main({ action: 'update', id: 'p1', pet: { species: 'dog' }, family_id: 'F1' })
    assert(rs.ok, 'NEW-18 pets.update 改物种成功')
    const fAfterSpecies = (DB_INST.data.foods || []).find((f) => f.brand === '处方粮')
    assert(fAfterSpecies && fAfterSpecies.species === 'dog', 'NEW-18 改物种后 foods 覆盖条 species 纠偏为 dog（纯保台账分组）')
    // resolver 按名忽略 species 仍正确（宠物现 species=dog，覆盖条按名命中）
    const list2 = await foods.main({ action: 'list', family_id: 'F1' })
    const r2 = resolveCurrentFood(list2.data, '示例咪', 'dog')
    assert(r2 && r2.brand === '处方粮', 'NEW-18 改物种后 resolveCurrentFood 按名仍命中（覆盖只认名字）')
  }

  // ============================================================
  // E2E-NEW-20：家庭解散级联，clear 后 records/reminders/foods/meds 本家庭清空，F2 不受影响
  // ============================================================
  {
    seedF1()
    // F2 另一家庭（成员 u admin，造对照数据）
    DB_INST.data.family_members.push({ family_id: 'F2', openid: 'u', role: 'admin' })
    DB_INST.data.families.push({ _id: 'F2', name: '测试家二', owner: 'u', storage_bytes: 0 })
    DB_INST.data.pets.push({ _id: 'p9', family_id: 'F2', name: '别家猫', species: 'cat', latest_weight: null, latest_weight_date: '', weight_spark: [] })

    // F1 落 records + reminders + foods + meds
    await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-01-01', event_type: '症状', desc: 'x', raw: 'x' }, family_id: 'F1' })
    await saveRecord.main({ record: { kind: 'reminder', pet: '示例猫', rem_title: 'r', rem_date: '2026-02-01' }, family_id: 'F1' })
    await saveRecord.main({ record: { kind: 'med_stock', med_name: '药' }, family_id: 'F1' })
    await foods.main({ action: 'add', family_id: 'F1', food: { species: 'cat', pet: '', brand: 'f', current: true } })
    // F2 对照数据
    await saveRecord.main({ record: { kind: 'record', pet: '别家猫', time: '2026-01-01', event_type: '症状', desc: 'y', raw: 'y' }, family_id: 'F2' })

    const f2RecBefore = (DB_INST.data.records || []).filter((r) => r.family_id === 'F2').length
    const res = await importNotion.main({ action: 'clear', family_name: '测试家' })
    assert(res.ok && res.cleared, 'NEW-20 clear 成功返回 counts')

    const cnt = (coll) => (DB_INST.data[coll] || []).filter((r) => r.family_id === 'F1').length
    assert(cnt('records') === 0 && cnt('pets') === 0 && cnt('meds') === 0 && cnt('reminders') === 0 && cnt('foods') === 0, 'NEW-20 clear 后 F1 的 records/pets/meds/reminders/foods 全 0')
    assert((DB_INST.data.records || []).filter((r) => r.family_id === 'F2').length === f2RecBefore && (DB_INST.data.pets || []).some((p) => p.name === '别家猫'), 'NEW-20 F2 数据不受影响（隔离）')
    assert(typeof res.cleared.records === 'number' && typeof res.cleared.foods === 'number' && typeof res.cleared.reminders === 'number', 'NEW-20 返回 counts 各集合删除数')
  }

  // ============================================================
  // E2E-NEW-21：saveRecord dispatch 优先级，multi 赢 batch / multi records 非数组 INVALID / valid:false 早退
  // ============================================================
  seedF1()
  {
    // (a) kind=multi + 杂散 pets[] → 走 saveMulti（非 saveBatch fan-out）
    const sa = await saveRecord.main({ record: { kind: 'multi', records: [{ pet: '示例猫', time: '2026-09-01', event_type: '症状', desc: 'm' }], pets: ['示例狗'] }, family_id: 'F1' })
    assert(sa.ok === true && sa.kind === 'multi' && sa.count === 1 && sa.saved === 1, 'NEW-21a kind=multi + 杂散 pets[] → 走 saveMulti（multi 优先于 batch），按 records 不按 pets fan-out')
    // 只落 1 条（示例猫），不按 pets 数 fan-out 出示例狗条
    const dogStray = (DB_INST.data.records || []).find((r) => r.desc === 'm' && r.pet === '示例狗')
    assert(!dogStray, 'NEW-21a 未按杂散 pets[] fan-out 出示例狗记录')

    // (b) kind=multi 但 records 非数组 → INVALID，不穿透单条路径写空 pet 垃圾
    const recsBefore = (DB_INST.data.records || []).length
    const sb = await saveRecord.main({ record: { kind: 'multi', records: 'notarray' }, family_id: 'F1' })
    assert(sb.ok === false && sb.code === 'INVALID', 'NEW-21b kind=multi + records 非数组 → INVALID')
    assert((DB_INST.data.records || []).length === recsBefore, 'NEW-21b records 非数组不穿透单条路径写空 pet 垃圾')

    // (c) valid:false → INVALID 在 assertMember 前早退
    const sc = await saveRecord.main({ record: { valid: false, kind: 'record', pet: '示例猫' }, family_id: 'F1' })
    assert(sc.ok === false && sc.code === 'INVALID', 'NEW-21c valid:false → INVALID 早退')
  }

  // ============================================================
  // E2E-NEW-22：parse 限流，连续录入到当日上限触发 RATE_LIMIT + parse_log 累积
  // ============================================================
  {
    seedF1()
    const DAY = (() => { const d = new Date(Date.now() + 8 * 3600 * 1000); const z = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}` })()
    // DAILY_LIMIT 默认 50（parseRecord 模块加载时读 env，已加载无法改）→ 种 parse_log 到 上限-1，再连发 2 次
    const LIMIT = 50
    DB_INST.data.parse_log = []
    for (let i = 0; i < LIMIT - 1; i++) DB_INST.data.parse_log.push({ family_id: 'F1', day: DAY, at: Date.now() })

    NEXT_LLM = JSON.stringify({ kind: 'record', valid: true, pet: '示例猫', species: 'cat', time: '2026-01-01', event_type: '症状', desc: 'x', raw: 'x' })
    const ok = await parseRecord.main({ text: '示例猫咳嗽', family_id: 'F1' })
    assert(ok.ok === true, 'NEW-22 第 50 次 parse 成功（未达上限前放行）')
    assert((DB_INST.data.parse_log || []).filter((x) => x.family_id === 'F1' && x.day === DAY).length === LIMIT, 'NEW-22 成功 parse 写一条 parse_log（累积到 50）')

    LAST_REQ = null
    const blocked = await parseRecord.main({ text: '示例猫又咳嗽', family_id: 'F1' })
    assert(blocked.ok === false && blocked.code === 'RATE_LIMIT', 'NEW-22 达上限再 parse → RATE_LIMIT 早退')
    assert(LAST_REQ === null, 'NEW-22 RATE_LIMIT 早退不调 LLM（LAST_REQ 未被写）')
    assert((DB_INST.data.parse_log || []).filter((x) => x.family_id === 'F1' && x.day === DAY).length === LIMIT, 'NEW-22 RATE_LIMIT 不写 parse_log（计数仍 50，不污染配额）')
  }

  // ============================================================
  // E2E-NEW-23：体重派生回写失败被吞，batch 路径不让已落库 record 误报 WRITE_FAIL
  // ============================================================
  seedF1()
  {
    THROW_PET_UPDATE = true // 注入 pets.update 抛错（模拟体重派生回写失败）
    const recsBefore = (DB_INST.data.records || []).length
    const s = await saveRecord.main({ record: { kind: 'record', pets: ['示例猫', '示例狗'], time: '2026-06-01', event_type: '体重', weight: 5.2, tag: '体重线', desc: '批量称重', raw: 'w' }, family_id: 'F1' })
    THROW_PET_UPDATE = false
    assert(s.ok === true && s.count === 2 && Array.isArray(s.ids) && s.ids.length === 2, 'NEW-23 pets.update 抛错时 saveBatch 仍 {ok:true,count:2,ids}（派生失败被吞）')
    const batch = (DB_INST.data.records || []).filter((r) => r.desc === '批量称重')
    assert(batch.length === 2, 'NEW-23 records 已落库 2 条（updateExistingPetWeight try/catch 吞异常，不冒泡 WRITE_FAIL）')
    assert((DB_INST.data.records || []).length === recsBefore + 2, 'NEW-23 主写不被体重回写失败阻断')
  }

  // ============================================================
  // E2E-NEW-24：删宠保留病史经 timeline（records 红线）+ 删宠级联清 foods 单宠覆盖（sweep 决定：孤儿台账清掉）+ 同名重建回落物种默认
  // ============================================================
  seedF1()
  {
    await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-04-01', event_type: '就医', tag: '尿闭', desc: '首诊', raw: 'x' }, family_id: 'F1' })
    await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-04-10', event_type: '就医', tag: '尿闭', desc: '复查', raw: 'y' }, family_id: 'F1' })
    await foods.main({ action: 'add', family_id: 'F1', food: { species: 'cat', pet: '', brand: '猫默认粮', current: true } })
    await foods.main({ action: 'add', family_id: 'F1', food: { species: 'cat', pet: '示例猫', brand: '处方粮', current: true } })

    const del = await petsFn.main({ action: 'delete', id: 'p1', family_id: 'F1' })
    assert(del.ok, 'NEW-24 删宠成功')
    assert(!(DB_INST.data.pets || []).some((p) => p.name === '示例猫'), 'NEW-24 pets 档案已删')
    // (a) 病史保留:删档案≠删病史 → timeline list/course 仍读得到示例猫历史（红线）
    const list = await timeline.main({ action: 'list', family_id: 'F1' })
    assert(list.data.filter((r) => r.pet === '示例猫').length === 2, 'NEW-24 删宠后 timeline.list 仍读回示例猫 2 条历史（病史保留）')
    const course = await timeline.main({ action: 'course', tag: '尿闭', family_id: 'F1' })
    assert(course.ok && course.summary.count === 2, 'NEW-24 删宠后 course 仍聚合示例猫尿闭病程 2 条')
    // (b) 删宠级联清 foods 单宠覆盖（sweep 决定）→ 示例猫覆盖已删、物种默认（pet=''）保留
    const flist = await foods.main({ action: 'list', family_id: 'F1' })
    assert(!flist.data.some((f) => f.pet === '示例猫'), 'NEW-24 删宠级联清 foods：示例猫单宠覆盖已删（不留孤儿台账）')
    assert(flist.data.some((f) => f.pet === '' && f.brand === '猫默认粮' && f.current === true), 'NEW-24 foods 物种默认（pet=空）保留')
    // (c) 同名重建 → 覆盖已清，resolveCurrentFood 回落物种默认粮（干净状态，非拾起陈旧覆盖）
    const reb = resolveCurrentFood(flist.data, '示例猫', 'cat')
    assert(reb && reb.brand === '猫默认粮', 'NEW-24 同名重建回落物种默认粮（覆盖已级联删，无陈旧残留）')
  }

  // ============================================================
  // E2E-NEW-25：legacy 裸记录（早期 schema 缺 attachments/att_count/created_at/weight_spark）经 timeline list/get/course 读不炸（向后兼容红线③）
  // ============================================================
  seedF1()
  {
    DB_INST.data.records = DB_INST.data.records || []
    DB_INST.data.records.push({ _id: 'legacy1', family_id: 'F1', pet: '示例猫', time: '2025-01-01', event_type: '其它', tag: '旧病', desc: '老记录', raw: '老' }) // 无 attachments/att_count/created_at
    const list = await timeline.main({ action: 'list', family_id: 'F1' })
    assert(list.ok, 'NEW-25 timeline.list 对缺字段裸记录不抛')
    const leg = list.data.find((r) => r._id === 'legacy1')
    assert(!!leg, 'NEW-25 裸 legacy 记录仍被 list 读回（缺 created_at 不被滤掉）')
    const got = await timeline.main({ action: 'get', id: 'legacy1', family_id: 'F1' })
    assert(got.ok && got.data && got.data._id === 'legacy1', 'NEW-25 get(legacy) 不抛、返回整 doc')
    const course = await timeline.main({ action: 'course', tag: '旧病', family_id: 'F1' })
    assert(course.ok && course.summary.count === 1, 'NEW-25 course 对 legacy tag 容缺字段聚合（不炸）')
  }

  // ============================================================
  // E2E-NEW-26：混域 time（纯日期 + 同日到分）下两条体重派生路径仍一致（course.weights == weight_spark，钉死红线）
  // ============================================================
  seedF1()
  {
    await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-03-01', event_type: '体重', weight: 4.5, tag: '体重线', desc: '纯日期', raw: 'a' }, family_id: 'F1' })
    await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-03-01 09:00', event_type: '体重', weight: 4.6, tag: '体重线', desc: '同日到分', raw: 'b' }, family_id: 'F1' })
    await saveRecord.main({ record: { kind: 'record', pet: '示例猫', time: '2026-03-05', event_type: '体重', weight: 4.8, tag: '体重线', desc: '后一天', raw: 'c' }, family_id: 'F1' })
    const cat = (DB_INST.data.pets || []).find((p) => p.name === '示例猫')
    const course = await timeline.main({ action: 'course', tag: '体重线', family_id: 'F1' })
    const courseSeq = course.summary.weights.map((w) => w.weight)
    assert(JSON.stringify(courseSeq) === JSON.stringify(cat.weight_spark), 'NEW-26 混域 time（纯日期 + 到分）course.weights 序列 == weight_spark 序列（两路派生在混域下仍逐元素一致）')
    assert(cat.latest_weight === 4.8 && cat.latest_weight_date === '2026-03-05', 'NEW-26 latest_weight 落真正最新那天（混域日期不乱序）')
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})().catch((e) => { console.error('未捕获异常：', e); process.exit(1) })
