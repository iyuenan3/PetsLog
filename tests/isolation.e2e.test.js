// 家庭多租户「隔离」端到端测试：把【真实】云函数串成链跑——共享一个内存 DB，模拟攻击者改包伪造入参。
// 威胁模型：攻击者 = 合法登录用户（持自己的 openid，OPENID 由 getWXContext 不可伪造），但可任意伪造 event 里的
//           family_id / 记录id / record_id / openid / pet 等客户端入参。验四条隔离不变式在跨函数链路上闭合：
//   ① 鉴权闸：每个读写家庭数据的 action 触库前必过 assertMember（写敏感过 assertAdmin）。
//   ② family_id 作用域：跨家庭读写一律拒。
//   ③ IDOR：按 id 直操作前必校验 doc.family_id===familyId。
//   ④ 闸不可短路 + openid 单一可信源（getWXContext，不信 client openid）。
// 与 e2e.flow.test.js（验功能契约）互补：本文件验【安全契约】。跑法：node tests/isolation.e2e.test.js
const Module = require('module')
const path = require('path')

// ---------- 内存 DB（与 e2e.flow.test.js 同款：where/_.in/_.neq/_.inc + field/orderBy/skip/limit/doc/get/update/add/remove/count）----------
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
let CUR_OPENID = 'uA' // 「当前登录用户」——服务端 getWXContext 取它，测试通过切它模拟不同攻击者
const fakeCloud = {
  init() {}, DYNAMIC_CURRENT_ENV: 'env',
  database: () => DB_INST,
  getWXContext: () => ({ OPENID: CUR_OPENID }),
  // 云存储 stub：解散 / 附件删除走清理（尽力而为，归属校验在它之前，故 stub 足够）
  deleteFile: async () => ({ fileList: [] }),
  getTempFileURL: async ({ fileList }) => ({ fileList: (fileList || []).map((id) => ({ fileID: id, tempFileURL: 'http://x/' + id, status: 0 })) }),
}

// mock LLM（仅 parse→save 篡改链用到）
let NEXT_LLM = '{}'
const fakeHttps = {
  request(options, cb) {
    const h = {}
    const res = { on: (ev, fn) => { h[ev] = fn; return res } }
    const req = {
      on: () => req,
      write: () => req,
      end: () => { setImmediate(() => { cb(res); h.data && h.data(JSON.stringify({ choices: [{ message: { content: NEXT_LLM } }] })); h.end && h.end() }) },
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

const family = require(path.join(__dirname, '..', 'cloudfunctions', 'family', 'index.js'))
const pets = require(path.join(__dirname, '..', 'cloudfunctions', 'pets', 'index.js'))
const timeline = require(path.join(__dirname, '..', 'cloudfunctions', 'timeline', 'index.js'))
const saveRecord = require(path.join(__dirname, '..', 'cloudfunctions', 'saveRecord', 'index.js'))
const parseRecord = require(path.join(__dirname, '..', 'cloudfunctions', 'parseRecord', 'index.js'))
const reminders = require(path.join(__dirname, '..', 'cloudfunctions', 'reminders', 'index.js'))
const meds = require(path.join(__dirname, '..', 'cloudfunctions', 'meds', 'index.js'))
const foods = require(path.join(__dirname, '..', 'cloudfunctions', 'foods', 'index.js'))
const attachment = require(path.join(__dirname, '..', 'cloudfunctions', 'attachment', 'index.js'))
const importNotion = require(path.join(__dirname, '..', 'cloudfunctions', 'importNotion', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function as(openid) { CUR_OPENID = openid }
function recs() { return DB_INST.data.records || [] }

;(async () => {
  // ── 种子：两个独立家庭 A / B + 一个 A 家普通成员 uC ──
  // 家A：admin=uA、member=uC；家B：admin=uB。各自有宠物 / 记录 / 提醒 / 主粮。
  DB_INST.data.family_members = [
    { _id: 'm_uA', family_id: 'FA', openid: 'uA', role: 'admin', nickname: '', joined_at: 1 },
    { _id: 'm_uC', family_id: 'FA', openid: 'uC', role: 'member', nickname: '', joined_at: 1 },
    { _id: 'm_uB', family_id: 'FB', openid: 'uB', role: 'admin', nickname: '', joined_at: 1 },
  ]
  DB_INST.data.families = [
    { _id: 'FA', name: '家A', owner: 'uA', storage_bytes: 0 },
    { _id: 'FB', name: '家B', owner: 'uB', storage_bytes: 0 },
  ]
  DB_INST.data.pets = [
    { _id: 'pA', family_id: 'FA', name: '咪咪', species: 'cat', latest_weight: null, latest_weight_date: '' },
    { _id: 'pB', family_id: 'FB', name: '旺财', species: 'dog', latest_weight: null, latest_weight_date: '' },
  ]
  DB_INST.data.records = [
    { _id: 'rB', family_id: 'FB', pet: '旺财', tag: '尿闭', desc: 'B家记录', raw: 'B家原文', time: '2026-01-01', cost: 100, weight: 5, event_type: '就医', attachments: [], att_count: 0 },
  ]
  DB_INST.data.reminders = [
    { _id: 'remB', family_id: 'FB', pet: '旺财', type: '用药', title: 'B家提醒', next_date: '2026-12-01', repeat_days: 0, done: false },
  ]
  DB_INST.data.foods = [
    { _id: 'fdB', family_id: 'FB', name: 'B家粮', current: true, start_date: '2026-01-01', end_date: '' },
  ]
  DB_INST.data.meds = [
    { _id: 'medB', family_id: 'FB', name: 'B家药', effect: '', quantity: 1, expire_date: '' },
  ]

  // ───────── A 组：鉴权闸（uA 改包把 family_id 指向家B，自己不是 B 成员）─────────
  as('uA')
  const okRecord = { kind: 'record', pet: '咪咪', time: '2026-05-01', event_type: '其它', desc: 'x', raw: 'x' }
  const a1 = await saveRecord.main({ record: okRecord, family_id: 'FB' })
  assert(a1.ok === false && a1.code === 'NOT_MEMBER', 'A1 saveRecord 跨家庭(FB) 被闸拒 NOT_MEMBER')
  assert(recs().filter((r) => r.family_id === 'FB').length === 1, 'A1 家B records 未被写入(仍 1 条)')
  const a2 = await reminders.main({ action: 'list', family_id: 'FB' })
  assert(a2.ok === false && a2.code === 'NOT_MEMBER', 'A2 reminders.list 跨家庭被拒')
  const a3 = await foods.main({ action: 'list', family_id: 'FB' })
  assert(a3.ok === false && a3.code === 'NOT_MEMBER', 'A3 foods.list 跨家庭被拒')
  const a4 = await pets.main({ action: 'list', family_id: 'FB' })
  assert(a4.ok === false && a4.code === 'NOT_MEMBER', 'A4 pets.list 跨家庭被拒')
  const a5 = await timeline.main({ action: 'list', family_id: 'FB' })
  assert(a5.ok === false && a5.code === 'NOT_MEMBER', 'A5 timeline.list 跨家庭被拒')
  const a6 = await meds.main({ action: 'list', family_id: 'FB' })
  assert(a6.ok === false && a6.code === 'NOT_MEMBER', 'A6 meds.list 跨家庭被拒')
  const a7 = await attachment.main({ action: 'deleteRecord', record_id: 'rB', family_id: 'FB' })
  assert(a7.ok === false && a7.code === 'NOT_MEMBER', 'A7 attachment 跨家庭被拒(闸先于归属校验)')
  const a8 = await parseRecord.main({ text: '咪咪体检', family_id: 'FB' })
  assert(a8.ok === false && a8.code === 'NOT_MEMBER', 'A8 parseRecord 跨家庭被拒(连解析也过闸)')

  // ───────── B 组：空 family_id → NO_FAMILY（callFn 前端已挡，服务端仍须拒）─────────
  const b1 = await saveRecord.main({ record: okRecord, family_id: '' })
  assert(b1.ok === false && b1.code === 'NO_FAMILY', 'B1 saveRecord 空 family_id → NO_FAMILY')
  const b2 = await reminders.main({ action: 'list', family_id: '' })
  assert(b2.ok === false && b2.code === 'NO_FAMILY', 'B2 reminders 空 family_id → NO_FAMILY')
  const b3 = await pets.main({ action: 'list', family_id: undefined })
  assert(b3.ok === false && b3.code === 'NO_FAMILY', 'B3 pets 缺 family_id → NO_FAMILY')

  // ───────── C 组：IDOR（uA 用自己合法的 FA 过闸，但 id 指向家B 的文档）─────────
  as('uA')
  const c1 = await reminders.main({ action: 'delete', id: 'remB', family_id: 'FA' })
  assert(c1.ok === false, 'C1 reminders.delete 删家B提醒(用 FA 过闸) 被归属校验拒')
  assert((DB_INST.data.reminders || []).some((r) => r._id === 'remB'), 'C1 家B提醒 remB 仍在')
  const c2 = await reminders.main({ action: 'done', id: 'remB', family_id: 'FA' })
  assert(c2.ok === false, 'C2 reminders.done 改家B提醒 被拒')
  assert((DB_INST.data.reminders || []).find((r) => r._id === 'remB').done === false, 'C2 家B提醒 done 未被翻')
  const c3 = await foods.main({ action: 'delete', id: 'fdB', family_id: 'FA' })
  assert(c3.ok === false, 'C3 foods.delete 删家B主粮 被拒')
  assert((DB_INST.data.foods || []).some((f) => f._id === 'fdB'), 'C3 家B主粮 fdB 仍在')
  const c4 = await foods.main({ action: 'update', id: 'fdB', family_id: 'FA', food: { name: '被改了' } })
  assert(c4.ok === false, 'C4 foods.update 改家B主粮 被拒')
  assert((DB_INST.data.foods || []).find((f) => f._id === 'fdB').name === 'B家粮', 'C4 家B主粮名未被改')
  const c5 = await pets.main({ action: 'delete', id: 'pB', family_id: 'FA' })
  assert(c5.ok === false, 'C5 pets.delete 删家B宠物 被拒')
  assert((DB_INST.data.pets || []).some((p) => p._id === 'pB'), 'C5 家B宠物 pB 仍在')
  const c6 = await pets.main({ action: 'update', id: 'pB', family_id: 'FA', pet: { name: '被改了' } })
  assert(c6.ok === false, 'C6 pets.update 改家B宠物 被拒')
  assert((DB_INST.data.pets || []).find((p) => p._id === 'pB').name === '旺财', 'C6 家B宠物名未被改')
  const c7 = await pets.main({ action: 'get', id: 'pB', family_id: 'FA' })
  assert(c7.ok === false, 'C7 pets.get 跨家庭读家B宠物 被拒(不泄露)')
  const c8 = await timeline.main({ action: 'get', id: 'rB', family_id: 'FA' })
  assert(c8.ok === false, 'C8 timeline.get 跨家庭读家B记录 被拒(不泄露)')
  const c9 = await attachment.main({ action: 'deleteRecord', record_id: 'rB', family_id: 'FA' })
  assert(c9.ok === false && c9.code === 'NOT_FOUND', 'C9 attachment.deleteRecord 删家B记录(用 FA 过闸) → NOT_FOUND')
  assert(recs().some((r) => r._id === 'rB'), 'C9 家B记录 rB 仍在')
  const c10 = await attachment.main({ action: 'remove', record_id: 'rB', fileID: 'x', family_id: 'FA' })
  assert(c10.ok === false && c10.code === 'NOT_FOUND', 'C10 attachment.remove 跨家庭 → NOT_FOUND')

  // ───────── D 组：parse→save 篡改链（合法 parse 后，落库时把 family_id 改成家B）─────────
  as('uA')
  NEXT_LLM = JSON.stringify({ kind: 'record', valid: true, pet: '咪咪', new_pet: false, species: 'cat', time: '2026-06-01', event_type: '就医', cost: 50, tag: '', desc: '体检', raw: 'x' })
  const d0 = await parseRecord.main({ text: '咪咪体检', family_id: 'FA' })
  assert(d0.ok === true && d0.parsed, 'D0 家A 内 parse 正常成功')
  const dBefore = recs().filter((r) => r.family_id === 'FB').length
  const d1 = await saveRecord.main({ record: d0.parsed, family_id: 'FB' }) // 篡改：落到家B
  assert(d1.ok === false && d1.code === 'NOT_MEMBER', 'D1 parse(家A)→save 改 family_id=FB 被独立闸拒')
  assert(recs().filter((r) => r.family_id === 'FB').length === dBefore, 'D1 家B records 未被写入')
  const d2 = await saveRecord.main({ record: d0.parsed, family_id: 'FA' }) // 正向对照：落自己家成功
  assert(d2.ok === true, 'D2 同一 parse 结果落自己家(FA) 成功(正向对照)')
  assert(recs().some((r) => r.family_id === 'FA' && r.desc === '体检'), 'D2 记录确落在家A')

  // ───────── E 组：importNotion 高权操作(批量导入/清库)防越权 ─────────
  // uC 是家A 普通成员(非 admin)
  as('uC')
  const e1 = await importNotion.main({ action: 'clean_tags', family_name: '家A' })
  assert(e1.ok === false && e1.code === 'NOT_ADMIN', 'E1 非管理员调 importNotion → NOT_ADMIN')
  // uA 是家A admin，但企图对家B 操作(按家庭名解析，只解析到自己 admin 的家)
  as('uA')
  const e2 = await importNotion.main({ action: 'clean_tags', family_name: '家B' })
  assert(e2.ok === false && e2.code === 'NOT_FOUND', 'E2 admin 对非自己家庭名(家B) → NOT_FOUND')
  const e3 = await importNotion.main({ action: 'clear', family_name: '家B' })
  assert(e3.ok === false && e3.code === 'NOT_FOUND', 'E3 admin clear 家B → NOT_FOUND')
  assert(recs().some((r) => r._id === 'rB'), 'E3 家B记录未被 clear')
  // 同名家庭歧义：给 uA 再加一个也叫「家A」的 admin 家庭
  DB_INST.data.families.push({ _id: 'FA2', name: '家A', owner: 'uA', storage_bytes: 0 })
  DB_INST.data.family_members.push({ _id: 'm_uA2', family_id: 'FA2', openid: 'uA', role: 'admin', nickname: '', joined_at: 1 })
  const e4 = await importNotion.main({ action: 'clean_tags', family_name: '家A' })
  assert(e4.ok === false && e4.code === 'AMBIGUOUS', 'E4 同名多家庭 → AMBIGUOUS(不误伤)')
  // 复原，免污染后续
  DB_INST.data.families = DB_INST.data.families.filter((f) => f._id !== 'FA2')
  DB_INST.data.family_members = DB_INST.data.family_members.filter((m) => m.family_id !== 'FA2')

  // ───────── F 组：family 角色 / 身份混淆 ─────────
  as('uC') // 家A 普通成员
  const f1 = await family.main({ action: 'removeMember', family_id: 'FA', openid: 'uA' })
  assert(f1.ok === false && f1.code === 'NOT_ADMIN', 'F1 普通成员 removeMember → NOT_ADMIN(不能踢管理员)')
  const f2 = await family.main({ action: 'transferAdmin', family_id: 'FA', openid: 'uC' })
  assert(f2.ok === false && f2.code === 'NOT_ADMIN', 'F2 普通成员 transferAdmin 自封 → NOT_ADMIN')
  const f3 = await family.main({ action: 'rename', family_id: 'FA', name: '黑' })
  assert(f3.ok === false && f3.code === 'NOT_ADMIN', 'F3 普通成员 rename → NOT_ADMIN')
  assert((DB_INST.data.families || []).find((f) => f._id === 'FA').name === '家A', 'F3 家A 名未被改')
  as('uA') // 家A admin
  const f4 = await family.main({ action: 'removeMember', family_id: 'FA', openid: 'uA' })
  assert(f4.ok === false, 'F4 管理员 removeMember 自己 被拒(请用退出/转让)')
  const f5 = await family.main({ action: 'removeMember', family_id: 'FB', openid: 'uB' }) // 管 A 的人想踢 B 的人
  assert(f5.ok === false && f5.code === 'NOT_MEMBER', 'F5 家A admin 对家B removeMember → NOT_MEMBER')
  assert((DB_INST.data.family_members || []).some((m) => m.family_id === 'FB' && m.openid === 'uB'), 'F5 家B admin uB 仍在')

  // ───────── G 组：邀请码加入 + 被踢后旧码失效 ─────────
  as('uA') // 家A admin 生成不限次邀请码
  const g0 = await family.main({ action: 'invite', family_id: 'FA' })
  assert(g0.ok === true && g0.code, 'G0 admin 生成邀请码')
  const code = g0.code
  as('uD') // 新用户，无家庭
  const g1 = await family.main({ action: 'join', code })
  assert(g1.ok === true && g1.family_id === 'FA', 'G1 新用户凭码加入家A')
  as('uA')
  const g2 = await family.main({ action: 'members', family_id: 'FA' })
  assert(g2.ok === true && g2.data.some((m) => m.openid === 'uD'), 'G2 成员列表含新成员 uD')
  // 现在 uD 是家A 成员，可读
  as('uD')
  const g3 = await pets.main({ action: 'list', family_id: 'FA' })
  assert(g3.ok === true, 'G3 入伙后 uD 可正常读家A 数据')
  // admin 踢掉 uD → 作废现有邀请码
  as('uA')
  const g4 = await family.main({ action: 'removeMember', family_id: 'FA', openid: 'uD' })
  assert(g4.ok === true, 'G4 admin 踢掉 uD')
  // uD 被踢后用旧码想秒回 → 码已作废
  as('uD')
  const g5 = await family.main({ action: 'join', code })
  assert(g5.ok === false && g5.code === 'BAD_CODE', 'G5 被踢成员凭旧码回流 → BAD_CODE(踢人即作废码)')
  const g6 = await pets.main({ action: 'list', family_id: 'FA' })
  assert(g6.ok === false && g6.code === 'NOT_MEMBER', 'G6 被踢后 uD 再读家A → NOT_MEMBER')

  // ───────── H 组：同名宠物不串档（家B 有「旺财」，家A 没有）─────────
  as('uA') // 家A 现有宠物：咪咪（+D 组未建新宠）
  const h1 = await saveRecord.main({ record: { kind: 'record', pet: '旺财', time: '2026-07-01', event_type: '其它', desc: 'x', raw: 'x' }, family_id: 'FA' })
  assert(h1.ok === false && h1.code === 'PET_UNKNOWN', 'H1 家A 记到「旺财」(家B宠物名) → PET_UNKNOWN(按家A名单)')
  assert(!recs().some((r) => r.family_id === 'FA' && r.pet === '旺财'), 'H1 家A 未生成「旺财」记录')
  assert((DB_INST.data.pets || []).filter((p) => p.name === '旺财').length === 1, 'H1 家B宠物「旺财」未被串改/复制')

  // ───────── I 组：最后一人退出即解散 + 级联清理(只清自己家)─────────
  as('uE')
  const i0 = await family.main({ action: 'bootstrap' }) // 自动建「我的家」
  const newFid = i0.active_family_id
  assert(i0.ok === true && newFid, 'I0 uE bootstrap 建私有家庭')
  await saveRecord.main({ record: { kind: 'record', pet: '小白', new_pet: true, species: 'cat', time: '2026-08-01', event_type: '其它', desc: 'uE的记录', raw: 'x' }, family_id: newFid })
  assert(recs().some((r) => r.family_id === newFid), 'I0 uE 家有 1 条记录')
  const fbRecsBefore = recs().filter((r) => r.family_id === 'FB').length
  const i1 = await family.main({ action: 'leave', family_id: newFid })
  assert(i1.ok === true && i1.dissolved === true, 'I1 最后一人退出 → dissolved')
  assert(!(DB_INST.data.families || []).some((f) => f._id === newFid), 'I1 家庭文档已删')
  assert(!recs().some((r) => r.family_id === newFid), 'I1 该家 records 级联清空')
  assert(!(DB_INST.data.pets || []).some((p) => p.family_id === newFid), 'I1 该家 pets 级联清空')
  assert(recs().filter((r) => r.family_id === 'FB').length === fbRecsBefore, 'I1 解散只清自己家，家B records 毫发无损')
  assert((DB_INST.data.families || []).some((f) => f._id === 'FB') && (DB_INST.data.families || []).some((f) => f._id === 'FA'), 'I1 家A/家B 仍在')

  // ───────── J 组：joinByCode 并发去重 + leave 按 distinct openid 计数（评审 should-fix：防孤儿家庭）─────────
  // 模拟 joinByCode 并发残留的重复成员行：唯一成员（含重复行）退出时按 distinct openid 应判 1 → 解散，
  // 而非按物理行数 count()=2 误判成「还有人」漏解散（留孤儿家庭 + 数据，违反退出即删）。
  as('uJ')
  DB_INST.data.families = DB_INST.data.families || []
  DB_INST.data.family_members = DB_INST.data.family_members || []
  DB_INST.data.families.push({ _id: 'FJ', name: 'uJ家', owner: 'uJ', storage_bytes: 0 })
  DB_INST.data.family_members.push({ _id: 'mJ1', family_id: 'FJ', openid: 'uJ', role: 'admin', nickname: '', joined_at: 1 })
  DB_INST.data.family_members.push({ _id: 'mJ2', family_id: 'FJ', openid: 'uJ', role: 'admin', nickname: '', joined_at: 2 }) // 重复行（并发 join 残留）
  const j1 = await family.main({ action: 'leave', family_id: 'FJ' })
  assert(j1.ok === true && j1.dissolved === true, 'J1 唯一成员(含重复行)退出 → distinct=1 → 解散(不被物理行数误判 MUST_TRANSFER/漏解散)')
  assert(!(DB_INST.data.families || []).some((f) => f._id === 'FJ'), 'J1 FJ 家庭文档已删')
  assert(!(DB_INST.data.family_members || []).some((m) => m.family_id === 'FJ'), 'J1 FJ 成员行全清(含重复行)')

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
