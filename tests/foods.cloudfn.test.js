// foods 云函数集成测试（轮3 主粮模块，见 ADR-014）：mock wx-server-sdk，跑真实 list/add/update/delete，
// 断言 family 隔离 / 设 current 自动取消其它 / 归属校验。跑法：node tests/foods.cloudfn.test.js
const Module = require('module')
const path = require('path')

function clone(o) { return JSON.parse(JSON.stringify(o)) }
function matchRow(row, where) {
  return Object.entries(where || {}).every(([k, v]) => {
    if (v && typeof v === 'object' && v.__cmd === 'neq') return row[k] !== v.v
    return row[k] === v
  })
}
function applyUpdate(doc, data) { for (const [k, v] of Object.entries(data)) doc[k] = v }
const _ = { neq: (v) => ({ __cmd: 'neq', v }) }
let SEQ = 0
class Coll {
  constructor(db, name) { this.db = db; this.name = name; this._where = null; this._docId = undefined }
  rows() { return this.db.data[this.name] || (this.db.data[this.name] = []) }
  where(c) { this._where = c; return this }
  orderBy() { return this }
  limit() { return this }
  doc(id) { this._docId = id; return this }
  async get() {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) throw new Error('nf'); return { data: clone(d) } }
    return { data: this.rows().filter((r) => matchRow(r, this._where)).map(clone) }
  }
  async update({ data }) {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) return { stats: { updated: 0 } }; applyUpdate(d, data); return { stats: { updated: 1 } } }
    let n = 0; for (const r of this.rows().filter((x) => matchRow(x, this._where))) { applyUpdate(r, data); n++ } return { stats: { updated: n } }
  }
  async remove() { const i = this.rows().findIndex((r) => r._id === this._docId); if (i >= 0) this.rows().splice(i, 1); return { stats: { removed: 1 } } }
  async add({ data }) { const doc = clone(data); doc._id = data._id || 'id_' + ++SEQ; this.rows().push(doc); return { _id: doc._id } }
}
class DB { constructor() { this.data = {}; this.command = _ } collection(n) { return new Coll(this, n) } createCollection() { return Promise.resolve() } }

let DB_INST = new DB()
let CUR_OPENID = ''
const fakeCloud = { init() {}, DYNAMIC_CURRENT_ENV: 'env', database: () => DB_INST, getWXContext: () => ({ OPENID: CUR_OPENID }) }
const origLoad = Module._load
Module._load = function (request) { if (request === 'wx-server-sdk') return fakeCloud; return origLoad.apply(this, arguments) }
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'foods', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function reset() { DB_INST.data = {}; CUR_OPENID = '' }
function seedFamily(fid, openid) {
  DB_INST.data.family_members = DB_INST.data.family_members || []
  DB_INST.data.family_members.push({ family_id: fid, openid, role: 'admin' })
}
function foodsOf(fid) { return (DB_INST.data.foods || []).filter((f) => f.family_id === fid) }
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

;(async () => {
  // 1. add + list
  await run('add + list', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { name: '渴望', start_date: '2022年1月1日', current: true } })
    assert(a.ok === true && a.id, 'add 应成功')
    const f = foodsOf('F1')[0]
    assert(f.name === '渴望' && f.start_date === '2022-01-01' && f.current === true, '落库字段正确（日期归一）')
    const l = await fn.main({ family_id: 'F1', action: 'list' })
    assert(l.ok && l.data.length === 1, 'list 返回 1 条')
  })

  // 2. 设新 current 自动取消旧 current
  await run('add current → 旧 current 自动取消', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    await fn.main({ family_id: 'F1', action: 'add', food: { name: '旧粮', current: true } })
    await fn.main({ family_id: 'F1', action: 'add', food: { name: '新粮', current: true } })
    const fs = foodsOf('F1')
    assert(fs.filter((f) => f.current).length === 1, '只能有 1 个 current')
    assert(fs.find((f) => f.name === '新粮').current === true && fs.find((f) => f.name === '旧粮').current === false, '新粮 current，旧粮取消')
  })

  // 3. update 设 current（带 exceptId，不取消自身）
  await run('update current=true → 其它取消、自身保留', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { name: 'A', current: true } })
    const b = await fn.main({ family_id: 'F1', action: 'add', food: { name: 'B', current: false } })
    await fn.main({ family_id: 'F1', action: 'update', id: b.id, food: { current: true } })
    const fs = foodsOf('F1')
    assert(fs.find((f) => f.name === 'B').current === true, 'B 设为 current')
    assert(fs.find((f) => f.name === 'A').current === false, 'A 被取消')
    assert(fs.filter((f) => f.current).length === 1, '仍只 1 个 current')
  })

  // 4. family 隔离：非成员拒；跨家庭 update/delete 拒
  await run('隔离: 非成员拒 + 跨家庭操作拒', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { name: 'X' } })
    // 别人(uB)对 F1 操作
    CUR_OPENID = 'uB'
    const r1 = await fn.main({ family_id: 'F1', action: 'list' })
    assert(r1.ok === false, '非成员 list 应拒')
    // uB 自己的家庭 F2，拿 F1 的 food id 删
    seedFamily('F2', 'uB')
    const r2 = await fn.main({ family_id: 'F2', action: 'delete', id: a.id })
    assert(r2.ok === false, '跨家庭删别家 food 应拒(not found)')
    assert(foodsOf('F1').length === 1, 'F1 的 food 仍在')
  })

  // 4b. 设为在喂自动清 end_date（避免取消在喂后旧结束日重现）
  await run('设 current 清空 end_date', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { name: '已结束粮', start_date: '2023-01-01', end_date: '2023-06-01', current: false } })
    assert(foodsOf('F1')[0].end_date === '2023-06-01', '初始有结束日')
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, food: { current: true } })
    assert(foodsOf('F1')[0].current === true && foodsOf('F1')[0].end_date === '', '设在喂后 end_date 应清空')
  })

  // 5. delete
  await run('delete', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { name: 'D' } })
    const r = await fn.main({ family_id: 'F1', action: 'delete', id: a.id })
    assert(r.ok === true && foodsOf('F1').length === 0, 'delete 成功')
  })

  // 6. add 校验：名必填
  await run('add 名必填', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', food: { name: '  ' } })
    assert(r.ok === false, '空名应拒')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
