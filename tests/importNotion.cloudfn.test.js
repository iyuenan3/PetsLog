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
    { _id: 'imp_h_0', pet: '示例猫', time: '2023-06-19', event_type: '就医', tag: '软骨病 ', desc: '复查', raw: '复查', weight: 4.2, hospital: '爱康', cost: 480, med: '钙片', attachments: [{ key_name: '0.pdf', type: 'pdf', name: '病历.pdf', size: 1000, bytes: 1000 }] },
    { _id: 'imp_d_0_0', pet: '示例狗', time: '2023-09-19', event_type: '驱虫', tag: '驱虫', desc: '猫驱虫', raw: '猫驱虫', weight: null, hospital: '', cost: null, med: '大宠爱', attachments: [] },
  ],
  foods: [{ name: '渴望', start_date: '2022-01-01', end_date: '', current: true, note: '' }],
}
let FAKE_PROFILES = [] // backfill_profile 的 mock profile_backfill.json（gitignore，测试期注入；reset 清空、各用例自设）

const origLoad = Module._load
Module._load = function (request, parent) {
  if (request === 'wx-server-sdk') return fakeCloud
  if (request === './data.json') return FAKE_DATA
  if (request === './profile_backfill.json') return FAKE_PROFILES
  return origLoad.apply(this, arguments)
}
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'importNotion', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function reset() { DB_INST.data = {}; DELETED.clear(); UPLOADED.clear(); MISSING_FILEIDS = new Set(); CUR_OPENID = ''; FAKE_PROFILES = [] }
function seedFamily(fid, name, members) {
  DB_INST.data.families = DB_INST.data.families || []
  DB_INST.data.families.push({ _id: fid, name, owner: members[0].openid, storage_bytes: 0 })
  DB_INST.data.family_members = DB_INST.data.family_members || []
  members.forEach((m) => DB_INST.data.family_members.push({ family_id: fid, openid: m.openid, role: m.role }))
}
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

;(async () => {
  // 1. 家庭解析：admin 命中对名家庭
  await run('resolve: admin 命中「测试家」', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }])
    seedFamily('F2', '别的家', [{ openid: 'uA', role: 'admin' }])
    const r = await fn.main({ action: 'clear', family_name: '测试家' })
    assert(r.ok === true && r.family_id === 'F1', '应解析到 F1，实际 ' + JSON.stringify(r))
  })

  // 2. 非管理员拒
  await run('resolve: 非管理员 → 拒', async () => {
    CUR_OPENID = 'uB'
    seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }, { openid: 'uB', role: 'member' }])
    const r = await fn.main({ action: 'clear', family_name: '测试家' })
    assert(r.ok === false && (r.code === 'NOT_ADMIN' || r.code === 'NOT_FOUND'), '非管理员应被拒，实际 ' + JSON.stringify(r))
  })

  // 3. 错误家庭名拒
  await run('resolve: 家庭名不存在 → 拒', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }])
    const r = await fn.main({ action: 'clear', family_name: '不存在的家' })
    assert(r.ok === false && r.code === 'NOT_FOUND', '应 NOT_FOUND，实际 ' + JSON.stringify(r))
  })

  // 4. clear 只删目标家庭、删文件、归零 storage_bytes，别家不动
  await run('clear: 只清目标家庭 + 删文件 + 归零，别家不动', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }])
    seedFamily('F2', '别人家', [{ openid: 'uX', role: 'admin' }])
    DB_INST.data.families.find((f) => f._id === 'F1').storage_bytes = 5000
    DB_INST.data.pets = [{ _id: 'p1', family_id: 'F1', name: 'a', avatar: 'cloud://av1' }, { _id: 'p2', family_id: 'F2', name: 'b', avatar: 'cloud://av2' }]
    DB_INST.data.records = [{ _id: 'r1', family_id: 'F1', attachments: [{ fileID: 'cloud://f1', thumb: '' }] }, { _id: 'r2', family_id: 'F2', attachments: [{ fileID: 'cloud://f2', thumb: '' }] }]
    DB_INST.data.foods = [{ _id: 'fo1', family_id: 'F1', name: 'x' }, { _id: 'fo2', family_id: 'F2', name: 'y' }]
    const r = await fn.main({ action: 'clear', family_name: '测试家' })
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
    seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }])
    const r = await fn.main({ action: 'import', family_name: '测试家' })
    assert(r.ok === true, 'import 应成功，实际 ' + JSON.stringify(r))
    assert((DB_INST.data.pets || []).length === 2, '应写 2 宠物')
    assert((DB_INST.data.records || []).length === 2, '应写 2 记录')
    assert((DB_INST.data.foods || []).length === 1, '应写 1 主粮')
    const rec = DB_INST.data.records.find((x) => x._id === 'imp_h_0')
    assert(rec.attachments[0].fileID === PREFIX + 'att/imp_h_0/0.pdf', 'fileID 应拼成 prefix+att/imp_h_0/0.pdf，实际 ' + rec.attachments[0].fileID)
    assert(rec.att_count === 1, 'att_count=1')
    assert(rec.tag === '软骨病', 'tag 落库 trim（去首尾空格，免 course 精确匹配查空）')
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
    seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }])
    DB_INST.data.pets = [{ _id: 'existing', family_id: 'F1', name: '已有猫' }]
    const r = await fn.main({ action: 'import', family_name: '测试家' })
    assert(r.ok === false && r.code === 'NOT_EMPTY', '已有数据应拒 NOT_EMPTY，实际 ' + JSON.stringify(r))
    assert((DB_INST.data.records || []).length === 0, '拒后不写 records')
  })

  // 6. import 坏链中止：附件未上传 → ATT_MISSING，不写库
  await run('import: 附件坏链 → ATT_MISSING 中止不写库', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }])
    MISSING_FILEIDS.add(PREFIX + 'att/imp_h_0/0.pdf') // 模拟该附件没传上去
    const r = await fn.main({ action: 'import', family_name: '测试家' })
    assert(r.ok === false && r.code === 'ATT_MISSING', '应 ATT_MISSING，实际 ' + JSON.stringify(r))
    assert((DB_INST.data.pets || []).length === 0 && (DB_INST.data.records || []).length === 0, '中止时不应写任何库')
  })

  // 7. clean_tags（ADR-019 tag 治理）：dryRun 预览 / 真清非病程 tag / 留病程 / 别家不动 / 只动 tag / 幂等
  const seedCleanRecs = () => {
    DB_INST.data.records = [
      { _id: 'r1', family_id: 'F1', tag: '驱虫', raw: '原文1', desc: 'd1' },
      { _id: 'r2', family_id: 'F1', tag: '记录体重', raw: '原文2', desc: 'd2' },
      { _id: 'r3', family_id: 'F1', tag: '嗜酸性肉芽肿', raw: '原文3', desc: 'd3' },
      { _id: 'r4', family_id: 'F1', tag: '', raw: '原文4', desc: 'd4' },
      { _id: 'r5', family_id: 'F2', tag: '驱虫', raw: '别家', desc: 'dx' },
    ]
  }
  await run('clean_tags: dryRun 默认只预览不写', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }]); seedFamily('F2', '别家', [{ openid: 'uX', role: 'admin' }])
    seedCleanRecs()
    const r = await fn.main({ action: 'clean_tags', family_name: '测试家' })
    assert(r.ok === true && r.dryRun === true, '默认应 dryRun 预览')
    assert(r.matched === 2 && r.cleared === 0, 'dryRun 命中 2 不写，实际 ' + JSON.stringify({ m: r.matched, c: r.cleared }))
    assert(r.byTag['驱虫'] === 1 && r.byTag['记录体重'] === 1, 'byTag 计数对')
    assert(DB_INST.data.records.find((x) => x._id === 'r1').tag === '驱虫', 'dryRun 不改库')
  })
  await run('clean_tags: dryRun:false 清非病程 / 留病程 / 别家不动 / 只动 tag', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }]); seedFamily('F2', '别家', [{ openid: 'uX', role: 'admin' }])
    seedCleanRecs()
    const r = await fn.main({ action: 'clean_tags', family_name: '测试家', dryRun: false })
    assert(r.ok === true && r.dryRun === false && r.cleared === 2, '应真清 2 条，实际 ' + JSON.stringify({ d: r.dryRun, c: r.cleared }))
    const g = (id) => DB_INST.data.records.find((x) => x._id === id)
    assert(g('r1').tag === '' && g('r2').tag === '', '非病程 tag(驱虫/记录体重)清空')
    assert(g('r3').tag === '嗜酸性肉芽肿', '病程 tag 保留')
    assert(g('r5').tag === '驱虫', '别家 F2 绝不动')
    assert(g('r1').raw === '原文1' && g('r1').desc === 'd1', '只动 tag，raw/desc 一律不碰')
  })
  await run('clean_tags: 幂等，清完再跑 0 命中', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }])
    DB_INST.data.records = [{ _id: 'r1', family_id: 'F1', tag: '', raw: 'x' }, { _id: 'r3', family_id: 'F1', tag: '尿闭', raw: 'y' }]
    const r = await fn.main({ action: 'clean_tags', family_name: '测试家', dryRun: false })
    assert(r.matched === 0 && r.cleared === 0, '已无非病程 tag 应 0 命中，实际 ' + JSON.stringify({ m: r.matched, c: r.cleared }))
  })

  // backfill_profile（ADR-025 方案 b 回填）：gender/neutered 始终覆盖、intro 仅填空、weight_spark 升序末12、admin 鉴权
  await run('backfill_profile: gender/neutered 覆盖 + intro 仅填空 + weight_spark 升序', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }])
    DB_INST.data.pets = [
      { _id: 'p1', family_id: 'F1', name: '示例猫', intro: '', neutered: false },
      { _id: 'p2', family_id: 'F1', name: '示例狗', intro: '原有简介', neutered: false },
    ]
    DB_INST.data.records = [
      { _id: 'w1', family_id: 'F1', pet: '示例猫', time: '2023-01-01', weight: 4.0 },
      { _id: 'w2', family_id: 'F1', pet: '示例猫', time: '2023-06-01 10:00', weight: 4.5 }, // 含到分 time，验排序不踩坑
      { _id: 'w3', family_id: 'F1', pet: '示例猫', time: '2023-03-01', weight: 4.2 },
    ]
    FAKE_PROFILES = [
      { name: '示例猫', gender: 'female', neutered: true, intro: '软萌挑食' },
      { name: '示例狗', gender: 'male', neutered: true, intro: '不该覆盖' },
    ]
    const r = await fn.main({ action: 'backfill_profile', family_name: '测试家' })
    assert(r.ok === true && r.pets === 2 && r.updated === 2 && r.sparked === 1, '返回应 pets2/updated2/sparked1，实际 ' + JSON.stringify(r))
    const cat = DB_INST.data.pets.find((p) => p._id === 'p1')
    const dog = DB_INST.data.pets.find((p) => p._id === 'p2')
    assert(cat.gender === 'female' && cat.neutered === true, '示例猫 gender/neutered 应被覆盖')
    assert(cat.intro === '软萌挑食', '示例猫 intro 空 → 应填充，实际 ' + cat.intro)
    assert(JSON.stringify(cat.weight_spark) === '[4,4.2,4.5]', '示例猫 weight_spark 应升序末12 [4,4.2,4.5]，实际 ' + JSON.stringify(cat.weight_spark))
    assert(dog.gender === 'male' && dog.neutered === true, '示例狗 gender/neutered 应被覆盖')
    assert(dog.intro === '原有简介', '示例狗 intro 非空 → 不覆盖，实际 ' + dog.intro)
    assert(JSON.stringify(dog.weight_spark) === '[]', '示例狗 无体重记录 weight_spark 应 []')
  })

  // backfill_profile：非 admin → resolveFamily 拒（admin-only 维护红线）
  await run('backfill_profile: 非 admin 被拒', async () => {
    CUR_OPENID = 'uMember'
    seedFamily('F1', '测试家', [{ openid: 'uA', role: 'admin' }, { openid: 'uMember', role: 'member' }])
    DB_INST.data.pets = [{ _id: 'p1', family_id: 'F1', name: '示例猫', intro: '' }]
    FAKE_PROFILES = [{ name: '示例猫', gender: 'female', neutered: true }]
    const r = await fn.main({ action: 'backfill_profile', family_name: '测试家' })
    assert(r.ok === false, '非 admin 应被 resolveFamily 拒，实际 ' + JSON.stringify(r))
    assert(DB_INST.data.pets[0].gender === undefined, '被拒后不应写 gender')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
