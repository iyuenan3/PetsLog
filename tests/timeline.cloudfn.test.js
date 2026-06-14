// timeline 云函数集成测试（ADR-019 病程完整视图）：mock wx-server-sdk，跑真实 index.js，
// 验 list_tags 去重全集（不受 50 限）/ course 单宠聚合 / 跨宠不混画体重 / pet 下钻 / family 隔离。
// 跑法：node tests/timeline.cloudfn.test.js
const Module = require('module')
const path = require('path')

function clone(o) { return JSON.parse(JSON.stringify(o)) }
function matchRow(row, where) { return Object.entries(where || {}).every(([k, v]) => row[k] === v) }
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
}
class DB { constructor() { this.data = {} } collection(n) { return new Coll(this, n) } }

let DB_INST = new DB()
let CUR = ''
const fakeCloud = { init() {}, DYNAMIC_CURRENT_ENV: 'env', database: () => DB_INST, getWXContext: () => ({ OPENID: CUR }) }
const origLoad = Module._load
Module._load = function (request) { if (request === 'wx-server-sdk') return fakeCloud; return origLoad.apply(this, arguments) }
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'timeline', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function reset() { DB_INST.data = {}; CUR = '' }
function seed(fid, openid, recs) {
  DB_INST.data.family_members = [{ family_id: fid, openid, role: 'admin' }]
  DB_INST.data.records = recs.map((r, i) => ({ _id: 'r' + i, family_id: fid, ...r }))
}
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

;(async () => {
  await run('course: 非成员拒', async () => {
    CUR = 'u'; seed('F1', 'owner', [{ pet: '示例猫', tag: '尿闭', time: '2026-01-01' }])
    const r = await fn.main({ family_id: 'F1', action: 'course', tag: '尿闭' })
    assert(r.ok === false && (r.code === 'NOT_MEMBER' || r.code === 'AUTH'), '非成员应拒，实际 ' + JSON.stringify(r))
  })

  await run('list_tags: 去重全集 + 跳空 tag', async () => {
    CUR = 'u'; seed('F1', 'u', [
      { pet: '示例猫', tag: '尿闭', time: '2026-01-01' },
      { pet: '示例猫', tag: '尿闭', time: '2026-01-02' },
      { pet: '示例狗', tag: '软骨病', time: '2026-01-03' },
      { pet: '示例狗', tag: '', time: '2026-01-04' },
    ])
    const r = await fn.main({ family_id: 'F1', action: 'list_tags' })
    assert(r.ok === true && r.tags.length === 2 && r.tags.includes('尿闭') && r.tags.includes('软骨病'), '去重全集 [尿闭,软骨病]，实际 ' + JSON.stringify(r.tags))
    assert(!r.tags.includes(''), '空 tag 不入集')
  })

  await run('course: 单宠聚合（起止 / 记录数 / 已记花费 / 体重序列）', async () => {
    CUR = 'u'; seed('F1', 'u', [
      { pet: '示例猫', tag: '尿闭', time: '2026-01-01', cost: 200, weight: 4.5 },
      { pet: '示例猫', tag: '尿闭', time: '2026-03-15', cost: 300, weight: 4.2 },
      { pet: '示例猫', tag: '尿闭', time: '2026-02-10' },
      { pet: '示例猫', tag: '软骨病', time: '2026-01-05' },
    ])
    const r = await fn.main({ family_id: 'F1', action: 'course', tag: '尿闭' })
    assert(r.ok === true && r.data.length === 3, '应取 3 条尿闭记录，实际 ' + (r.data || []).length)
    assert(r.summary.count === 3, 'count=3')
    assert(r.summary.firstDate === '2026-01-01' && r.summary.lastDate === '2026-03-15', '起止对，实际 ' + JSON.stringify([r.summary.firstDate, r.summary.lastDate]))
    assert(r.summary.costSum === 500, '已记花费 500，实际 ' + r.summary.costSum)
    assert(r.summary.weights.length === 2, '体重序列 2 点，实际 ' + r.summary.weights.length)
    assert(r.summary.pets.length === 1 && r.summary.pets[0] === '示例猫', 'pets=[示例猫]')
  })

  await run('course: 全无 cost → costSum null（不显示 ¥0）', async () => {
    CUR = 'u'; seed('F1', 'u', [{ pet: '示例猫', tag: '皮肤病', time: '2026-01-01' }])
    const r = await fn.main({ family_id: 'F1', action: 'course', tag: '皮肤病' })
    assert(r.summary.costSum === null, 'costSum 应 null，实际 ' + r.summary.costSum)
  })

  await run('course: 跨宠同 tag → weights 留空 + pets 列全（不混画）', async () => {
    CUR = 'u'; seed('F1', 'u', [
      { pet: '示例猫', tag: '耳螨', time: '2026-01-01', weight: 4.5 },
      { pet: '示例狗', tag: '耳螨', time: '2026-01-02', weight: 12.0 },
    ])
    const r = await fn.main({ family_id: 'F1', action: 'course', tag: '耳螨' })
    assert(r.data.length === 2 && r.summary.pets.length === 2, '取 2 条涉 2 宠')
    assert(r.summary.weights.length === 0, '跨宠不混画体重，weights 应空')
  })

  await run('course: 带 pet 下钻单宠给体重序列', async () => {
    CUR = 'u'; seed('F1', 'u', [
      { pet: '示例猫', tag: '耳螨', time: '2026-01-01', weight: 4.5 },
      { pet: '示例狗', tag: '耳螨', time: '2026-01-02', weight: 12.0 },
    ])
    const r = await fn.main({ family_id: 'F1', action: 'course', tag: '耳螨', pet: '示例猫' })
    assert(r.data.length === 1 && r.data[0].pet === '示例猫', '只取示例猫')
    assert(r.summary.weights.length === 1, '下钻后单宠给体重序列')
  })

  await run('course: family 隔离不读别家', async () => {
    CUR = 'u'
    DB_INST.data.family_members = [{ family_id: 'F1', openid: 'u', role: 'admin' }]
    DB_INST.data.records = [
      { _id: 'a', family_id: 'F1', pet: '示例猫', tag: '尿闭', time: '2026-01-01' },
      { _id: 'b', family_id: 'F2', pet: '别家猫', tag: '尿闭', time: '2026-01-01' },
    ]
    const r = await fn.main({ family_id: 'F1', action: 'course', tag: '尿闭' })
    assert(r.data.length === 1 && r.data[0].family_id === 'F1', '只读 F1 不读 F2')
  })

  await run('course: 缺 tag 拒', async () => {
    CUR = 'u'; seed('F1', 'u', [])
    const r = await fn.main({ family_id: 'F1', action: 'course', tag: '' })
    assert(r.ok === false, '缺 tag 应拒')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
