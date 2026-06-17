// attachment 云函数集成测试（见 ADR-011）：用内存 DB + mock 掉 wx-server-sdk / https，
// 让真实的 register / remove / deleteRecord 代码跑完整路径，断言安全闸 / 配额 / 回滚 / 并发降级 / 回归。
// 跑法：node tests/attachment.cloudfn.test.js  （不需要云环境，纯本地）
const Module = require('module')
const path = require('path')

// ---------- 内存 DB（忠实模拟 doc/where/skip/limit/orderBy/field/get/update/remove/add 与 _ 操作符）----------
function clone(o) {
  return JSON.parse(JSON.stringify(o))
}
function matchEl(el, cond) {
  if (cond && typeof cond === 'object' && !cond.__cmd) return Object.entries(cond).every(([k, v]) => el[k] === v)
  return el === cond
}
function matchRow(row, where) {
  return Object.entries(where || {}).every(([k, v]) => {
    if (v && typeof v === 'object' && v.__cmd === 'gt') return row[k] > v.n
    return row[k] === v
  })
}
function applyUpdate(doc, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && v.__cmd === 'push') doc[k] = (doc[k] || []).concat(v.v)
    else if (v && typeof v === 'object' && v.__cmd === 'inc') doc[k] = (Number(doc[k]) || 0) + v.n
    else if (v && typeof v === 'object' && v.__cmd === 'pull') doc[k] = (doc[k] || []).filter((el) => !matchEl(el, v.cond))
    else doc[k] = v
  }
}
const _ = {
  push: (v) => ({ __cmd: 'push', v }),
  pull: (cond) => ({ __cmd: 'pull', cond }),
  inc: (n) => ({ __cmd: 'inc', n }),
  gt: (n) => ({ __cmd: 'gt', n }),
}
let SEQ = 0
class Coll {
  constructor(db, name) {
    this.db = db
    this.name = name
    this._where = null
    this._skip = 0
    this._limit = Infinity
    this._order = null
    this._docId = undefined
  }
  rows() {
    return this.db.data[this.name] || (this.db.data[this.name] = [])
  }
  where(c) {
    this._where = c
    return this
  }
  skip(n) {
    this._skip = n
    return this
  }
  limit(n) {
    this._limit = n
    return this
  }
  field() {
    return this
  }
  orderBy(k, dir) {
    this._order = { k, dir }
    return this
  }
  doc(id) {
    this._docId = id
    return this
  }
  async get() {
    if (this._docId !== undefined) {
      const d = this.rows().find((r) => r._id === this._docId)
      if (!d) throw new Error('not found')
      return { data: clone(d) }
    }
    let rows = this.rows().filter((r) => matchRow(r, this._where))
    if (this._order) {
      const { k, dir } = this._order
      rows = rows.slice().sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (dir === 'desc' ? -1 : 1))
    }
    rows = rows.slice(this._skip, this._skip === 0 && this._limit === Infinity ? undefined : this._skip + this._limit)
    return { data: rows.map(clone) }
  }
  async update({ data }) {
    if (this._docId !== undefined) {
      const d = this.rows().find((r) => r._id === this._docId)
      if (!d) return { stats: { updated: 0 } }
      applyUpdate(d, data)
      return { stats: { updated: 1 } }
    }
    let n = 0
    for (const r of this.rows().filter((x) => matchRow(x, this._where))) {
      applyUpdate(r, data)
      n++
    }
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
    const doc = clone(data)
    doc._id = data._id || 'id_' + ++SEQ
    this.rows().push(doc)
    return { _id: doc._id }
  }
  async count() {
    return { total: this.rows().filter((r) => matchRow(r, this._where)).length }
  }
}
class DB {
  constructor() {
    this.data = {}
    this.command = _
  }
  collection(name) {
    return new Coll(this, name)
  }
  createCollection() {
    return Promise.resolve()
  }
}

// ---------- mock 云存储：getTempFileURL 返回带 fileID 的假 URL，deleteFile 记录被删 fileID ----------
let DB_INST = new DB()
let CUR_OPENID = ''
let SIZES = {} // fileID -> 真实体积（headSize 通过假 URL 读回）
const DELETED = new Set()
const fakeCloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'env',
  database: () => DB_INST,
  getWXContext: () => ({ OPENID: CUR_OPENID }),
  async getTempFileURL({ fileList }) {
    return { fileList: fileList.map((id) => ({ fileID: id, status: 0, tempFileURL: 'https://fake.test/' + encodeURIComponent(id) })) }
  },
  async deleteFile({ fileList }) {
    fileList.forEach((f) => DELETED.add(f))
    return { fileList: fileList.map((f) => ({ fileID: f, status: 0 })) }
  },
}

// 拦截 require('wx-server-sdk')
const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return fakeCloud
  return origLoad.apply(this, arguments)
}
// 拦截 https.request（headSize 用它读 content-length）
const https = require('https')
https.request = function (opts, cb) {
  const id = decodeURIComponent((opts.path || '').replace(/^\//, '').split('?')[0])
  const size = SIZES[id]
  const res = { statusCode: size == null ? 404 : 200, headers: { 'content-length': String(size == null ? '' : size) }, resume() {}, on() {} }
  const req = { on: () => req, end: () => {}, destroy: () => {} }
  setImmediate(() => cb(res))
  return req
}

// 加载被测函数（在 mock 装好之后）
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'attachment', 'index.js'))

// ---------- 测试脚手架 ----------
let pass = 0
let fail = 0
function assert(cond, msg) {
  if (cond) {
    pass++
  } else {
    fail++
    console.log('  ❌ ' + msg)
  }
}
function reset() {
  // 原地清空：index.js 在加载时已 const db = cloud.database() 抓死实例，不能换实例（否则读写分叉）
  DB_INST.data = {}
  SIZES = {}
  DELETED.clear()
  CUR_OPENID = ''
}
function seedFamily(fid, openids, storage = 0) {
  DB_INST.data.families = DB_INST.data.families || []
  DB_INST.data.families.push({ _id: fid, name: 'f', owner: openids[0], storage_bytes: storage })
  DB_INST.data.family_members = DB_INST.data.family_members || []
  openids.forEach((o) => DB_INST.data.family_members.push({ family_id: fid, openid: o, role: o === openids[0] ? 'admin' : 'member' }))
}
function seedRecord(fid, rec) {
  DB_INST.data.records = DB_INST.data.records || []
  const doc = Object.assign({ _id: rec._id, family_id: fid, attachments: [], att_count: 0 }, rec)
  DB_INST.data.records.push(doc)
  return doc
}
function fileID(recId, name) {
  return `cloud://env.bkt/att/${recId}/${name}`
}
async function run(title, body) {
  reset()
  try {
    await body()
    console.log('✔ ' + title)
  } catch (e) {
    fail++
    console.log('✘ ' + title + ' — 抛异常: ' + (e && e.message))
  }
}

;(async () => {
  // 1. happy path：自家成员给自家记录传 1 张图
  await run('happy: 自家记录传图 → 挂载 + 计配额 + 流水', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    seedRecord('F1', { _id: 'recA' })
    const fid = fileID('recA', 's1.jpg')
    const thumb = fileID('recA', 's1_t.jpg')
    SIZES[fid] = 2 * 1024 * 1024
    SIZES[thumb] = 50 * 1024
    const r = await fn.main({ family_id: 'F1', action: 'register', record_id: 'recA', files: [{ fileID: fid, thumb, type: 'image', name: '图片', size: SIZES[fid] }] })
    assert(r.ok === true, 'register 应成功，实际 ' + JSON.stringify(r))
    const rec = DB_INST.data.records[0]
    assert(rec.attachments.length === 1, '附件应挂 1 个')
    assert(rec.att_count === 1, 'att_count 应为 1')
    assert(rec.attachments[0].bytes === SIZES[fid] + SIZES[thumb], 'bytes 应含主+缩略')
    assert(DB_INST.data.families[0].storage_bytes === SIZES[fid] + SIZES[thumb], 'storage_bytes 应增对应字节')
    assert((DB_INST.data.att_log || []).length === 1, 'att_log 应写 1 条')
    assert(DELETED.size === 0, '成功路径不应删文件')
  })

  // 2. 安全：传别家 fileID + 自家 record → 路径不匹配 BAD_PATH，且【绝不删那个文件】
  await run('安全: 别家 fileID 挂自家记录 → BAD_PATH 且不删受害文件', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    seedRecord('F1', { _id: 'recA' })
    const victim = fileID('recVictim', 'private.pdf') // 别家记录路径下的文件
    SIZES[victim] = 1024
    const r = await fn.main({ family_id: 'F1', action: 'register', record_id: 'recA', files: [{ fileID: victim, type: 'pdf', name: 'x', size: 1024 }] })
    assert(r.ok === false && r.code === 'BAD_PATH', '应拒为 BAD_PATH，实际 ' + JSON.stringify(r))
    assert(!DELETED.has(victim), '绝不能删受害者文件（删除能力不可被客户端参数驱动）')
  })

  // 3. 安全：record_id 属别家 → NOT_FOUND 且不删传入的文件（即便路径前缀匹配该 record）
  await run('安全: record_id 属别家 → NOT_FOUND 且不删传入文件', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    seedFamily('F2', ['uB'])
    seedRecord('F2', { _id: 'recB' }) // 属于 F2
    const f = fileID('recB', 'x.jpg')
    SIZES[f] = 1024
    CUR_OPENID = 'uA' // A 不在 F2
    const r = await fn.main({ family_id: 'F2', action: 'register', record_id: 'recB', files: [{ fileID: f, type: 'image', name: 'x', size: 1024 }] })
    assert(r.ok === false && (r.code === 'NOT_MEMBER' || r.code === 'NOT_FOUND'), '应拒（非成员/记录不存在），实际 ' + JSON.stringify(r))
    assert(!DELETED.has(f), 'NOT_FOUND/非成员路径不删文件')
  })

  // 4. 配额：家庭总量超 1GB → STORAGE_FULL 且回滚删本次文件、storage_bytes 不变
  await run('配额: 超 1GB → STORAGE_FULL + 回滚删文件 + 计数不变', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'], 1024 * 1024 * 1024 - 1024) // 已用接近 1GB
    seedRecord('F1', { _id: 'recA' })
    const f = fileID('recA', 'big.jpg')
    const t = fileID('recA', 'big_t.jpg')
    SIZES[f] = 5 * 1024 * 1024
    SIZES[t] = 10 * 1024
    const before = DB_INST.data.families[0].storage_bytes
    const r = await fn.main({ family_id: 'F1', action: 'register', record_id: 'recA', files: [{ fileID: f, thumb: t, type: 'image', name: 'x', size: SIZES[f] }] })
    assert(r.ok === false && r.code === 'STORAGE_FULL', '应 STORAGE_FULL，实际 ' + JSON.stringify(r))
    assert(DELETED.has(f) && DELETED.has(t), '超限应回滚删主+缩略')
    assert(DB_INST.data.families[0].storage_bytes === before, '回滚后 storage_bytes 不变')
    assert(DB_INST.data.records[0].attachments.length === 0, '记录不应挂上')
  })

  // 5. 配额：单文件超 10MB（图）→ FILE_TOO_BIG + 回滚
  await run('配额: 单图 >10MB → FILE_TOO_BIG + 回滚', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    seedRecord('F1', { _id: 'recA' })
    const f = fileID('recA', 'huge.jpg')
    SIZES[f] = 11 * 1024 * 1024
    const r = await fn.main({ family_id: 'F1', action: 'register', record_id: 'recA', files: [{ fileID: f, type: 'image', name: 'x', size: SIZES[f] }] })
    assert(r.ok === false && r.code === 'FILE_TOO_BIG', '应 FILE_TOO_BIG，实际 ' + JSON.stringify(r))
    assert(DELETED.has(f), '超限文件应被回滚删除')
  })

  // 6. 单条 >9 → TOO_MANY（前置闸，不删）
  await run('上限: 一次传 >9 个 → TOO_MANY', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    seedRecord('F1', { _id: 'recA' })
    const files = Array.from({ length: 10 }, (_, i) => ({ fileID: fileID('recA', i + '.jpg'), type: 'image', name: 'x', size: 1 }))
    const r = await fn.main({ family_id: 'F1', action: 'register', record_id: 'recA', files })
    assert(r.ok === false && r.code === 'TOO_MANY', '应 TOO_MANY，实际 ' + JSON.stringify(r))
  })

  // 7. RECORD_GONE：体积复核期间记录被并发删除 → update no-op → 回滚删文件、不计配额
  await run('并发: 复核期间记录被删 → RECORD_GONE + 回滚', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    seedRecord('F1', { _id: 'recA' })
    const f = fileID('recA', 's.jpg')
    SIZES[f] = 1024
    // getTempFileURL 时把记录删掉，模拟复核期间并发 deleteRecord
    const origGet = fakeCloud.getTempFileURL
    fakeCloud.getTempFileURL = async (arg) => {
      DB_INST.data.records = []
      return origGet(arg)
    }
    const r = await fn.main({ family_id: 'F1', action: 'register', record_id: 'recA', files: [{ fileID: f, type: 'image', name: 'x', size: 1024 }] })
    fakeCloud.getTempFileURL = origGet
    assert(r.ok === false && r.code === 'RECORD_GONE', '应 RECORD_GONE，实际 ' + JSON.stringify(r))
    assert(DELETED.has(f), '记录已删应回滚删文件')
    assert((DB_INST.data.families[0].storage_bytes || 0) === 0, '不应计入配额')
  })

  // 8. removeOne：摘除 + pull + 计数回收 + 删文件
  await run('remove: 删单个附件 → pull + 回收配额 + 删文件', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'], 0)
    const f = fileID('recA', 's.jpg')
    const t = fileID('recA', 's_t.jpg')
    seedRecord('F1', { _id: 'recA', attachments: [{ fileID: f, thumb: t, type: 'image', name: 'x', size: 1000, bytes: 1200 }], att_count: 1 })
    DB_INST.data.families[0].storage_bytes = 1200
    const r = await fn.main({ family_id: 'F1', action: 'remove', record_id: 'recA', fileID: f })
    assert(r.ok === true, 'remove 应成功')
    assert(DB_INST.data.records[0].attachments.length === 0, '附件应被 pull 掉')
    assert(DB_INST.data.records[0].att_count === 0, 'att_count 回到 0')
    assert(DB_INST.data.families[0].storage_bytes === 0, 'storage_bytes 回收 1200')
    assert(DELETED.has(f) && DELETED.has(t), '主+缩略都应删')
  })

  // 9. deleteRecord：删记录 + 回收全部 bytes + 删全部文件
  await run('deleteRecord: 删记录 → 回收配额 + 删全部附件', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'], 5000)
    const f1 = fileID('recA', 'a.jpg')
    const f2 = fileID('recA', 'b.pdf')
    seedRecord('F1', {
      _id: 'recA',
      attachments: [
        { fileID: f1, thumb: '', type: 'image', name: 'a', size: 2000, bytes: 2000 },
        { fileID: f2, thumb: '', type: 'pdf', name: 'b', size: 3000, bytes: 3000 },
      ],
      att_count: 2,
    })
    const r = await fn.main({ family_id: 'F1', action: 'deleteRecord', record_id: 'recA' })
    assert(r.ok === true, 'deleteRecord 应成功')
    assert((DB_INST.data.records || []).length === 0, '记录应被删')
    assert(DB_INST.data.families[0].storage_bytes === 0, '应回收 5000 → 0')
    assert(DELETED.has(f1) && DELETED.has(f2), '两个附件都应删')
  })

  // 10. 回归：删掉「最新体重」记录 → pets.latest_weight 重算为上一条
  await run('回归: 删最新体重记录 → 档案体重重算为前值', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    DB_INST.data.pets = [{ _id: 'p1', family_id: 'F1', name: '示例猫', latest_weight: 4.5, latest_weight_date: '2026-06-09' }]
    seedRecord('F1', { _id: 'recOld', pet: '示例猫', time: '2026-06-01', weight: 4.2, event_type: '体重' })
    const newest = seedRecord('F1', { _id: 'recNew', pet: '示例猫', time: '2026-06-09', weight: 4.5, event_type: '体重' })
    const r = await fn.main({ family_id: 'F1', action: 'deleteRecord', record_id: 'recNew' })
    assert(r.ok === true, '应成功')
    const p = DB_INST.data.pets[0]
    assert(p.latest_weight === 4.2 && p.latest_weight_date === '2026-06-01', '档案体重应回退到 4.2/06-01，实际 ' + p.latest_weight + '/' + p.latest_weight_date)
  })

  // 11. 回归：删掉「非最新」体重记录 → 档案体重不动
  await run('回归: 删非最新体重记录 → 档案体重不变', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    DB_INST.data.pets = [{ _id: 'p1', family_id: 'F1', name: '示例猫', latest_weight: 4.5, latest_weight_date: '2026-06-09' }]
    seedRecord('F1', { _id: 'recOld', pet: '示例猫', time: '2026-06-01', weight: 4.2, event_type: '体重' })
    seedRecord('F1', { _id: 'recNew', pet: '示例猫', time: '2026-06-09', weight: 4.5, event_type: '体重' })
    await fn.main({ family_id: 'F1', action: 'deleteRecord', record_id: 'recOld' })
    const p = DB_INST.data.pets[0]
    assert(p.latest_weight === 4.5 && p.latest_weight_date === '2026-06-09', '删非最新不应动档案，实际 ' + p.latest_weight)
  })

  // 13. 回归（ADR-018 口径）：删带「到分 time」的最新体重记录 → latest_weight 重算 + latest_weight_date 落纯日期 + weight_spark 收缩
  // 防回潮根因：守卫曾拿纯日期 latest_weight_date 比含到分的 rec.time（恒不等→跳过重算）；回写曾把含到分 time 直灌（污染纯日期不变量）。
  // 3 条体重记录：删最新 → 重算到「次新」（需 orderBy('time','desc').limit(1) 真排序，no-op 排序会取错条）
  await run('回归: 删到分最新体重 → 重算到次新 + 纯日期 + spark 收缩', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    DB_INST.data.pets = [{ _id: 'p1', family_id: 'F1', name: '示例猫', latest_weight: 4.5, latest_weight_date: '2026-06-09', weight_spark: [4.2, 4.3, 4.5] }]
    seedRecord('F1', { _id: 'recOld', pet: '示例猫', time: '2026-06-01 09:00', weight: 4.2, event_type: '体重' })
    seedRecord('F1', { _id: 'recMid', pet: '示例猫', time: '2026-06-05 10:00', weight: 4.3, event_type: '体重' })
    seedRecord('F1', { _id: 'recNew', pet: '示例猫', time: '2026-06-09 14:30', weight: 4.5, event_type: '体重' })
    const r = await fn.main({ family_id: 'F1', action: 'deleteRecord', record_id: 'recNew' })
    assert(r.ok === true, '应成功')
    const p = DB_INST.data.pets[0]
    assert(p.latest_weight === 4.3, '删到分最新体重应重算到次新 4.3（需 orderBy desc 真排序），实际 ' + p.latest_weight)
    assert(p.latest_weight_date === '2026-06-05', 'latest_weight_date 应落纯日期 2026-06-05，实际 ' + p.latest_weight_date)
    assert(JSON.stringify(p.weight_spark) === '[4.2,4.3]', '删侧 weight_spark 应升序收缩为 [4.2,4.3]，实际 ' + JSON.stringify(p.weight_spark))
  })

  // 14. 回归：删「非最新」体重记录 → 档案标量不动 + weight_spark 仍正确收缩（写/删两侧对称）
  await run('回归: 删非最新体重 → 标量不动 + spark 收缩为 [4.5]', async () => {
    CUR_OPENID = 'uA'
    seedFamily('F1', ['uA'])
    DB_INST.data.pets = [{ _id: 'p1', family_id: 'F1', name: '示例猫', latest_weight: 4.5, latest_weight_date: '2026-06-09', weight_spark: [4.2, 4.5] }]
    seedRecord('F1', { _id: 'recOld', pet: '示例猫', time: '2026-06-01 09:00', weight: 4.2, event_type: '体重' })
    seedRecord('F1', { _id: 'recNew', pet: '示例猫', time: '2026-06-09 14:30', weight: 4.5, event_type: '体重' })
    await fn.main({ family_id: 'F1', action: 'deleteRecord', record_id: 'recOld' })
    const p = DB_INST.data.pets[0]
    assert(p.latest_weight === 4.5 && p.latest_weight_date === '2026-06-09', '删非最新不应动标量，实际 ' + p.latest_weight + '/' + p.latest_weight_date)
    assert(JSON.stringify(p.weight_spark) === '[4.5]', '删侧 weight_spark 应收缩为 [4.5]，实际 ' + JSON.stringify(p.weight_spark))
  })

  // 12. 鉴权：非成员调用直接 AUTH 拒
  await run('鉴权: 非家庭成员调用 → 拒', async () => {
    CUR_OPENID = 'stranger'
    seedFamily('F1', ['uA'])
    seedRecord('F1', { _id: 'recA' })
    const r = await fn.main({ family_id: 'F1', action: 'register', record_id: 'recA', files: [{ fileID: fileID('recA', 'x.jpg'), type: 'image', name: 'x', size: 1 }] })
    assert(r.ok === false && (r.code === 'NOT_MEMBER' || r.code === 'AUTH'), '非成员应被拒，实际 ' + JSON.stringify(r))
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
