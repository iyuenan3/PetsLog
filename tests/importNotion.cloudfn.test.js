// importNotion 云函数集成测试（轮3 历史导入，见 ADR-014）：mock wx-server-sdk + ./data.json，
// 跑真实 clear/import 代码，断言家庭解析安全 / clear 只动目标家庭 / import 拼对 fileID+验证+写库。
// 破坏性代码，交用户跑前先本地验。跑法：node tests/importNotion.cloudfn.test.js
const Module = require('module')
const path = require('path')

// ---------- 内存 DB ----------
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
const _ = {
  in: (v) => ({ __cmd: 'in', v }),
  neq: (v) => ({ __cmd: 'neq', v }),
  inc: (n) => ({ __cmd: 'inc', n }),
}
let SEQ = 0
class Coll {
  constructor(db, name) { this.db = db; this.name = name; this._where = null; this._skip = 0; this._limit = Infinity; this._docId = undefined }
  rows() { return this.db.data[this.name] || (this.db.data[this.name] = []) }
  where(c) { this._where = c; return this }
  skip(n) { this._skip = n; return this }
  limit(n) { this._limit = n; return this }
  field() { return this }
  orderBy() { return this }
  doc(id) { this._docId = id; return this }
  async get() {
    if (this._docId !== undefined) {
      const d = this.rows().find((r) => r._id === this._docId)
      if (!d) throw new Error('not found')
      return { data: clone(d) }
    }
    let rows = this.rows().filter((r) => matchRow(r, this._where))
    const end = this._skip === 0 && this._limit === Infinity ? undefined : this._skip + this._limit
    return { data: rows.slice(this._skip, end).map(clone) }
  }
  async update({ data }) {
    if (this._docId !== undefined) {
      const d = this.rows().find((r) => r._id === this._docId)
      if (!d) return { stats: { updated: 0 } }
      applyUpdate(d, data); return { stats: { updated: 1 } }
    }
    let n = 0
    for (const r of this.rows().filter((x) => matchRow(x, this._where))) { applyUpdate(r, data); n++ }
    return { stats: { updated: n } }
  }
  async remove() {
    if (this._docId !== undefined) {
      const i = this.rows().findIndex((r) => r._id === this._docId)
      if (i >= 0) this.rows().splice(i, 1)
      return { stats: { removed: i >= 0 ? 1 : 0 } }
    }
    const before = this.rows().length
    this.db.data[this.name] = this.rows().filter((r) => !matchRow(r, this._where))
    return { stats: { removed: before - this.db.data[this.name].length } }
  }
  async add({ data }) {
    if ('_id' in data && this.rows().some((r) => r._id === data._id)) throw new Error('dup _id ' + data._id)
    const doc = clone(data); doc._id = data._id || 'id_' + ++SEQ; this.rows().push(doc); return { _id: doc._id }
  }
}
class DB { constructor() { this.data = {}; this.command = _ } collection(n) { return new Coll(this, n) } createCollection() { return Promise.resolve() } }

// ---------- mock 云存储 ----------
let DB_INST = new DB()
let CUR_OPENID = ''
const DELETED = new Set()
const UPLOADED = new Set()
let MISSING_FILEIDS = new Set() // 这些 fileID 验证为坏链（status!=0）
const PREFIX = 'cloud://env-x.bkt/'
const fakeCloud = {
  init() {}, DYNAMIC_CURRENT_ENV: 'env',
  database: () => DB_INST,
  getWXContext: () => ({ OPENID: CUR_OPENID }),
  async uploadFile({ cloudPath }) { UPLOADED.add(cloudPath); return { fileID: PREFIX + cloudPath } },
  async getTempFileURL({ fileList }) {
    return { fileList: fileList.map((id) => ({ fileID: id, status: MISSING_FILEIDS.has(id) ? 1 : 0, tempFileURL: 'https://x/' + id })) }
  },
  async deleteFile({ fileList }) { fileList.forEach((f) => DELETED.add(f)); return { fileList: [] } },
}

// 合成 data.json（不加载真实 94KB）：2 宠物 + 2 记录(1 带附件) + 1 主粮
const FAKE_DATA = {
  pets: [
    { name: '示例猫', species: 'cat', breed: '布偶', birthday: '2020-01-01', home_date: '2020-03-01', chronic: '', note: '', intro: '', price_base: 2000, neutered: false },
    { name: '示例狗', species: 'dog', breed: '柯基', birthday: '2021-01-01', home_date: '2021-02-01', chronic: '已绝育', note: '', intro: '', price_base: 0, neutered: true },
  ],
  records: [
    { _id: 'imp_h_0', pet: '示例猫', time: '2023-06-19', event_type: '就医', tag: '软骨病', desc: '复查', raw: '复查', weight: 4.2, hospital: '爱康', cost: 480, med: '钙片', attachments: [{ key_name: '0.pdf', type: 'pdf', name: '病历.pdf', size: 1000, bytes: 1000 }] },
    { _id: 'imp_d_0_0', pet: '示例狗', time: '2023-09-19', event_type: '驱虫', tag: '驱虫', desc: '猫驱虫', raw: '猫驱虫', weight: null, hospital: '', cost: null, med: '大宠爱', attachments: [] },
  ],
  foods: [{ name: '渴望', start_date: '2022-01-01', end_date: '', current: true, note: '' }],
}

const origLoad = Module._load
Module._load = function (request, parent) {
  if (request === 'wx-server-sdk') return fakeCloud
  if (request === './data.json') return FAKE_DATA
  return origLoad.apply(this, arguments)
}
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'importNotion', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function reset() { DB_INST.data = {}; DELETED.clear(); UPLOADED.clear(); MISSING_FILEIDS = new Set(); CUR_OPENID = '' }
function seedFamily(fid, name, members) {
  DB_INST.data.families = DB_INST.data.families || []
  DB_INST.data.families.push({ _id: fid, name, owner: members[0].openid, storage_bytes: 0 })
  DB_INST.data.family_members = DB_INST.data.family_members || []
  members.forEach((m) => DB_INST.data.family_members.push({ family_id: fid, openid: m.openid, role: m.role }))
}
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

;(async () => {
  // 1. 家庭解析：admin 命中对名家庭
  await run('resolve: admin 命中「南山有乔木」', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '南山有乔木', [{ openid: 'uA', role: 'admin' }])
    seedFamily('F2', '别的家', [{ openid: 'uA', role: 'admin' }])
    const r = await fn.main({ action: 'clear', family_name: '南山有乔木' })
    assert(r.ok === true && r.family_id === 'F1', '应解析到 F1，实际 ' + JSON.stringify(r))
  })

  // 2. 非管理员拒
  await run('resolve: 非管理员 → 拒', async () => {
    CUR_OPENID = 'uB'
    seedFamily('F1', '南山有乔木', [{ openid: 'uA', role: 'admin' }, { openid: 'uB', role: 'member' }])
    const r = await fn.main({ action: 'clear', family_name: '南山有乔木' })
    assert(r.ok === false && (r.code === 'NOT_ADMIN' || r.code === 'NOT_FOUND'), '非管理员应被拒，实际 ' + JSON.stringify(r))
  })

  // 3. 错误家庭名拒
  await run('resolve: 家庭名不存在 → 拒', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '南山有乔木', [{ openid: 'uA', role: 'admin' }])
    const r = await fn.main({ action: 'clear', family_name: '不存在的家' })
    assert(r.ok === false && r.code === 'NOT_FOUND', '应 NOT_FOUND，实际 ' + JSON.stringify(r))
  })

  // 4. clear 只删目标家庭、删文件、归零 storage_bytes，别家不动
  await run('clear: 只清目标家庭 + 删文件 + 归零，别家不动', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '南山有乔木', [{ openid: 'uA', role: 'admin' }])
    seedFamily('F2', '别人家', [{ openid: 'uX', role: 'admin' }])
    DB_INST.data.families.find((f) => f._id === 'F1').storage_bytes = 5000
    DB_INST.data.pets = [{ _id: 'p1', family_id: 'F1', name: 'a', avatar: 'cloud://av1' }, { _id: 'p2', family_id: 'F2', name: 'b', avatar: 'cloud://av2' }]
    DB_INST.data.records = [{ _id: 'r1', family_id: 'F1', attachments: [{ fileID: 'cloud://f1', thumb: '' }] }, { _id: 'r2', family_id: 'F2', attachments: [{ fileID: 'cloud://f2', thumb: '' }] }]
    DB_INST.data.foods = [{ _id: 'fo1', family_id: 'F1', name: 'x' }, { _id: 'fo2', family_id: 'F2', name: 'y' }]
    const r = await fn.main({ action: 'clear', family_name: '南山有乔木' })
    assert(r.ok === true, 'clear 应成功')
    assert(DB_INST.data.pets.length === 1 && DB_INST.data.pets[0].family_id === 'F2', 'F1 pets 删尽，F2 留')
    assert(DB_INST.data.records.length === 1 && DB_INST.data.records[0].family_id === 'F2', 'F1 records 删尽，F2 留')
    assert(DB_INST.data.foods.length === 1 && DB_INST.data.foods[0].family_id === 'F2', 'F1 foods 删尽，F2 留')
    assert(DELETED.has('cloud://f1') && DELETED.has('cloud://av1'), 'F1 的附件+头像文件应删')
    assert(!DELETED.has('cloud://f2') && !DELETED.has('cloud://av2'), 'F2 的文件绝不能删')
    assert(DB_INST.data.families.find((f) => f._id === 'F1').storage_bytes === 0, 'F1 storage_bytes 归零')
  })

  // 5. import 正常：拼对 fileID、写 pets/records/foods、storage_bytes 回填
  await run('import: 拼 fileID + 写库 + 回填配额', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '南山有乔木', [{ openid: 'uA', role: 'admin' }])
    const r = await fn.main({ action: 'import', family_name: '南山有乔木' })
    assert(r.ok === true, 'import 应成功，实际 ' + JSON.stringify(r))
    assert((DB_INST.data.pets || []).length === 2, '应写 2 宠物')
    assert((DB_INST.data.records || []).length === 2, '应写 2 记录')
    assert((DB_INST.data.foods || []).length === 1, '应写 1 主粮')
    const rec = DB_INST.data.records.find((x) => x._id === 'imp_h_0')
    assert(rec.attachments[0].fileID === PREFIX + 'att/imp_h_0/0.pdf', 'fileID 应拼成 prefix+att/imp_h_0/0.pdf，实际 ' + rec.attachments[0].fileID)
    assert(rec.att_count === 1, 'att_count=1')
    assert(!('key_name' in rec.attachments[0]), 'key_name 应被清掉')
    assert(rec.imported === true, '应打 imported 标记')
    const dog = DB_INST.data.pets.find((p) => p.name === '示例狗')
    assert(dog.neutered === true && dog.price_base === 0, '狗 绝育true 身价0')
    assert(DB_INST.data.families[0].storage_bytes === 1000, 'storage_bytes 回填 1000')
    assert(UPLOADED.size >= 1 && [...DELETED].some((x) => x.includes('_probe')), '探针应上传后删除')
  })

  // 5b. 幂等守卫：家庭已有 pets/records 时再 import → NOT_EMPTY 拒，不写脏数据
  await run('import: 非空家庭再导 → NOT_EMPTY 拒', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '南山有乔木', [{ openid: 'uA', role: 'admin' }])
    DB_INST.data.pets = [{ _id: 'existing', family_id: 'F1', name: '已有猫' }]
    const r = await fn.main({ action: 'import', family_name: '南山有乔木' })
    assert(r.ok === false && r.code === 'NOT_EMPTY', '已有数据应拒 NOT_EMPTY，实际 ' + JSON.stringify(r))
    assert((DB_INST.data.records || []).length === 0, '拒后不写 records')
  })

  // 6. import 坏链中止：附件未上传 → ATT_MISSING，不写库
  await run('import: 附件坏链 → ATT_MISSING 中止不写库', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '南山有乔木', [{ openid: 'uA', role: 'admin' }])
    MISSING_FILEIDS.add(PREFIX + 'att/imp_h_0/0.pdf') // 模拟该附件没传上去
    const r = await fn.main({ action: 'import', family_name: '南山有乔木' })
    assert(r.ok === false && r.code === 'ATT_MISSING', '应 ATT_MISSING，实际 ' + JSON.stringify(r))
    assert((DB_INST.data.pets || []).length === 0 && (DB_INST.data.records || []).length === 0, '中止时不应写任何库')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
