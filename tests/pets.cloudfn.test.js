// pets 云函数集成测试（轮4 评审硬化，见 ADR-015）：mock wx-server-sdk，跑真实 index.js，
// 断言 add/改名 同名查重、服务端 trim、avatar_emoji 类型收紧。跑法：node tests/pets.cloudfn.test.js
const Module = require('module')
const path = require('path')

function clone(o) { return JSON.parse(JSON.stringify(o)) }
function matchRow(row, where) {
  return Object.entries(where || {}).every(([k, v]) => row[k] === v)
}
let SEQ = 0
class Coll {
  constructor(db, name) { this.db = db; this.name = name; this._where = null; this._docId = undefined }
  rows() { return this.db.data[this.name] || (this.db.data[this.name] = []) }
  where(c) { this._where = c; return this }
  field() { return this }
  orderBy() { return this }
  limit() { return this }
  doc(id) { this._docId = id; return this }
  async get() {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) throw new Error('nf'); return { data: clone(d) } }
    return { data: this.rows().filter((r) => matchRow(r, this._where)).map(clone) }
  }
  async update({ data }) {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) return { stats: { updated: 0 } }; Object.assign(d, data); return { stats: { updated: 1 } } }
    let n = 0; for (const r of this.rows().filter((x) => matchRow(x, this._where))) { Object.assign(r, data); n++ } return { stats: { updated: n } }
  }
  async remove() { const i = this.rows().findIndex((r) => r._id === this._docId); if (i >= 0) this.rows().splice(i, 1); return { stats: { removed: 1 } } }
  async add({ data }) { const doc = clone(data); doc._id = data._id || 'id_' + ++SEQ; this.rows().push(doc); return { _id: doc._id } }
}
class DB { constructor() { this.data = {} } collection(n) { return new Coll(this, n) } createCollection() { return Promise.resolve() } }

let DB_INST = new DB()
let CUR_OPENID = ''
const fakeCloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'env',
  database: () => DB_INST,
  getWXContext: () => ({ OPENID: CUR_OPENID }),
  deleteFile: async () => ({ fileList: [] }),
}
const origLoad = Module._load
Module._load = function (request) { if (request === 'wx-server-sdk') return fakeCloud; return origLoad.apply(this, arguments) }
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'pets', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function reset() { DB_INST.data = {}; CUR_OPENID = '' }
function seed(fid, openid) { DB_INST.data.family_members = [{ family_id: fid, openid, role: 'admin' }] }
const pets = () => DB_INST.data.pets || []
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

;(async () => {
  // 1. add: trim + 落库
  await run('add: 服务端 trim', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const r = await fn.main({ family_id: 'F1', action: 'add', pet: { name: ' 小七 ', species: 'dog' } })
    assert(r.ok === true && pets()[0].name === '小七', '尾空格被 trim')
  })

  // 2. add: 同名查重拒
  await run('add: 同名查重拒', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    await fn.main({ family_id: 'F1', action: 'add', pet: { name: '小七' } })
    const r = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '小七 ' } })
    assert(r.ok === false, 'trim 后同名应拒')
    assert(pets().length === 1, '不产生重名档案')
  })

  // 3. update: 改名撞已有名拒
  await run('update: 改名撞已有名拒', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    await fn.main({ family_id: 'F1', action: 'add', pet: { name: '小七' } })
    const b = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '小葵' } })
    const r = await fn.main({ family_id: 'F1', action: 'update', id: b.id, pet: { name: '小七' } })
    assert(r.ok === false, '改名撞名应拒')
    assert(pets().filter((p) => p.name === '小七').length === 1, '仍只一只小七')
  })

  // 4. avatar_emoji 类型收紧
  await run('avatar_emoji: 非字符串入库为空串 + 超长截断', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const a = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '甲', avatar_emoji: { evil: 1 } } })
    assert(pets().find((p) => p._id === a.id).avatar_emoji === '', '对象 → 空串')
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { avatar_emoji: '🐱'.repeat(20) } })
    const v = pets().find((p) => p._id === a.id).avatar_emoji
    assert(typeof v === 'string' && v.length <= 8, '超长截断 ≤8')
  })

  // 5. 隔离: 非成员拒
  await run('隔离: 非成员拒', async () => {
    CUR_OPENID = 'uB'; seed('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', pet: { name: 'X' } })
    assert(r.ok === false && pets().length === 0, '非成员应拒')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
