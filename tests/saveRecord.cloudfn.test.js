// saveRecord 云函数集成测试（轮4 录入防错别字，见 ADR-015）：mock wx-server-sdk，跑真实 index.js，
// 断言 意图驱动建档 / 错别字模糊 snap / 歧义与无匹配拒以 PET_UNKNOWN 且零写入 / 体重回写。跑法：node tests/saveRecord.cloudfn.test.js
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
  async add({ data }) { const doc = clone(data); doc._id = data._id || 'id_' + ++SEQ; this.rows().push(doc); return { _id: doc._id } }
}
class DB { constructor() { this.data = {} } collection(n) { return new Coll(this, n) } createCollection() { return Promise.resolve() } }

let DB_INST = new DB()
let CUR_OPENID = ''
const fakeCloud = { init() {}, DYNAMIC_CURRENT_ENV: 'env', database: () => DB_INST, getWXContext: () => ({ OPENID: CUR_OPENID }) }
const origLoad = Module._load
Module._load = function (request) { if (request === 'wx-server-sdk') return fakeCloud; return origLoad.apply(this, arguments) }
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'saveRecord', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function reset() { DB_INST.data = {}; CUR_OPENID = '' }
function seed(fid, openid, petNames) {
  DB_INST.data.family_members = [{ family_id: fid, openid, role: 'admin' }]
  DB_INST.data.pets = (petNames || []).map((n, i) => ({ _id: 'p' + i, family_id: fid, name: n, latest_weight: null, latest_weight_date: '' }))
}
const recs = () => DB_INST.data.records || []
const pets = () => DB_INST.data.pets || []
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

;(async () => {
  // 1. 已有宠物正常落库
  await run('已有宠物: 正常落库不建档', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例猫', time: '2026-06-11', event_type: '症状', desc: '呕吐' } })
    assert(r.ok === true && r.petCreated === false, '应成功且不建档')
    assert(recs().length === 1 && recs()[0].pet === '示例猫', '记录落库 pet 正确')
    assert(pets().length === 2, '宠物数不变')
  })

  // 2. 错别字(落库层) → 不静默 snap,拒 PET_UNKNOWN 并附 suggest(parse 层 snap 用户可见,落库层名字不在库属异常态)
  await run('错别字: 落库层不静默 snap, PET_UNKNOWN + suggest', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '示列猫', time: '2026-06-11', event_type: '症状', desc: '拉稀' } })
    assert(r.ok === false && r.code === 'PET_UNKNOWN', '应拒 PET_UNKNOWN')
    assert(r.suggest === '示例猫', 'suggest 给唯一近似名')
    assert(recs().length === 0 && pets().length === 2, '零写入不建档')
  })

  // 3. 歧义(两候选互距1) → PET_UNKNOWN 零写入
  await run('歧义: 小气 vs [小七,小葵] → PET_UNKNOWN 零写入', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['小七', '小葵'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '小气', time: '2026-06-11', event_type: '体重', weight: 3 } })
    assert(r.ok === false && r.code === 'PET_UNKNOWN', '应拒 PET_UNKNOWN')
    assert(Array.isArray(r.pets) && r.pets.length === 2, '附宠物名单供前端点选')
    assert(recs().length === 0, '不留孤儿记录')
    assert(pets().length === 2, '不建档')
  })

  // 4. 无任何近似 → PET_UNKNOWN
  await run('无近似: 球球 → PET_UNKNOWN', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '球球', time: '2026-06-11', event_type: '症状' } })
    assert(r.ok === false && r.code === 'PET_UNKNOWN', '应拒')
    assert(recs().length === 0 && pets().length === 1, '零写入')
  })

  // 5. 显式新增意图 → 建档(尊重 species)
  await run('new_pet=true: 建档', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '新宝', new_pet: true, species: 'dog', time: '2026-06-11', event_type: '体重', weight: 2.1 } })
    assert(r.ok === true && r.petCreated === true, '应建档')
    const p = pets().find((x) => x.name === '新宝')
    assert(p && p.species === 'dog' && p.latest_weight === 2.1, '新档 species/体重正确')
  })

  // 6. PET_UNKNOWN 后用户点选标准名重提交 → 正常落库 + 体重回写
  await run('PET_UNKNOWN 后选定重提交: 落库 + 体重回写', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    const r1 = await fn.main({ family_id: 'F1', record: { pet: '示列猫', time: '2026-06-11', event_type: '体重', weight: 4.5 } })
    assert(r1.ok === false && r1.code === 'PET_UNKNOWN', '首次应拒')
    const r2 = await fn.main({ family_id: 'F1', record: { pet: '示例猫', time: '2026-06-11', event_type: '体重', weight: 4.5 } })
    assert(r2.ok === true, '选定后应成功')
    const p = pets().find((x) => x.name === '示例猫')
    assert(p && p.latest_weight === 4.5 && p.latest_weight_date === '2026-06-11', 'latest_weight 回写到示例猫')
  })

  // 7. 简称包含 → 同样 PET_UNKNOWN + suggest(落库层不猜)
  await run('简称: 例猫 ⊂ 示例猫 → PET_UNKNOWN + suggest', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '旺财'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '例猫', time: '2026-06-11', event_type: '症状' } })
    assert(r.ok === false && r.code === 'PET_UNKNOWN' && r.suggest === '示例猫', '拒 + suggest 唯一候选')
  })

  // 7b. trim 对齐: 尾空格精确名照常通过
  await run('trim: 「示例猫 」尾空格精确命中', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例猫 ', time: '2026-06-11', event_type: '症状' } })
    assert(r.ok === true && recs()[0].pet === '示例猫', 'trim 后精确命中')
  })

  // 7c. 0 宠家庭首录 → 视同新增放行建档(否则首跑死端)
  await run('0 宠首录: 非显式意图也放行建档', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', [])
    const r = await fn.main({ family_id: 'F1', record: { pet: '小白', species: 'cat', time: '2026-06-11', event_type: '症状', weight: 4.2 } })
    assert(r.ok === true && r.petCreated === true, '0 宠应放行建档')
    assert(pets().length === 1 && pets()[0].name === '小白', '建出首只档案')
  })

  // 7d. reminder 错别字 → 同走 PET_UNKNOWN 零写入(防线覆盖提醒通道)
  await run('reminder: 错别字拒 PET_UNKNOWN 零写入', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['小七', '小葵'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'reminder', pet: '小淇', rem_title: '体外驱虫', rem_type: '驱虫', rem_date: '2026-07-15' } })
    assert(r.ok === false && r.code === 'PET_UNKNOWN', '提醒错别字应拒')
    assert((DB_INST.data.reminders || []).length === 0, 'reminders 零写入')
  })

  // 7e. reminder pet 在库 → 正常落库
  await run('reminder: 在库宠物正常设提醒', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['小七'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'reminder', pet: '小七', rem_title: '疫苗', rem_type: '疫苗', rem_date: '2026-07-01' } })
    assert(r.ok === true && (DB_INST.data.reminders || [])[0].pet === '小七', '提醒落库')
  })

  // 7f. emoji 名: 单 emoji 不互相误 snap(code point 护栏)
  await run('emoji 名: 🐶 不被 snap 到 🐱', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['🐱'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '🐶', time: '2026-06-11', event_type: '症状' } })
    assert(r.ok === false && r.code === 'PET_UNKNOWN' && !r.suggest, '单 emoji 名不近似, suggest 空')
  })

  // 7g. 事件时间到分: time 存到分 + created_at 由事件时间精确派生 + latest_weight_date 仍纯日期(ADR-018)
  await run('时间到分: time/created_at 到分, latest_weight_date 纯日期', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例猫', time: '2026-06-11 14:30', event_type: '体重', weight: 5 } })
    assert(r.ok === true && recs()[0].time === '2026-06-11 14:30', 'time 落库到分')
    assert(recs()[0].created_at === Date.parse('2026-06-11T14:30:00+08:00'), 'created_at 由事件时间精确派生(东八区)')
    const p = pets().find((x) => x.name === '示例猫')
    assert(p && p.latest_weight_date === '2026-06-11', 'latest_weight_date 仍纯日期(取日期段)')
  })

  // 7h. 仅日期(AI 未给时刻 / 旧数据) → created_at 落当日中午 12:00(延续历史导入约定)
  await run('仅日期: created_at 落中午12点', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例猫', time: '2026-06-11', event_type: '症状' } })
    assert(r.ok === true && recs()[0].time === '2026-06-11', '仅日期原样存')
    assert(recs()[0].created_at === Date.parse('2026-06-11T12:00:00+08:00'), '缺时刻 created_at = 当日中午')
  })

  // 8. pet 为空照常存(无宠记录,现状语义)
  await run('pet 空: 照常存不触发解析', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '', time: '2026-06-11', event_type: '其它', desc: 'x' } })
    assert(r.ok === true && recs().length === 1, '空 pet 不拦')
  })

  // 9. 非成员拒(隔离不回归)
  await run('隔离: 非成员拒', async () => {
    CUR_OPENID = 'uB'; seed('F1', 'uA', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例猫', event_type: '症状' } })
    assert(r.ok === false && recs().length === 0, '非成员应拒')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
