// saveRecord 云函数集成测试（轮4 录入防错别字，见 ADR-015）：mock wx-server-sdk，跑真实 index.js，
// 断言 意图驱动建档 / 错别字模糊 snap / 歧义与无匹配拒以 PET_UNKNOWN 且零写入 / 体重回写。跑法：node tests/saveRecord.cloudfn.test.js
const Module = require('module')
const path = require('path')

function clone(o) { return JSON.parse(JSON.stringify(o)) }
const CMD = { gt: (n) => ({ __op: 'gt', v: n }) } // db.command.gt（ADR-025 weight_spark 查询用）
function matchRow(row, where) {
  return Object.entries(where || {}).every(([k, v]) => {
    if (v && typeof v === 'object' && v.__op === 'gt') return row[k] > v.v
    return row[k] === v
  })
}
let SEQ = 0
class Coll {
  constructor(db, name) { this.db = db; this.name = name; this._where = null; this._docId = undefined; this._order = null; this._limit = undefined }
  rows() { return this.db.data[this.name] || (this.db.data[this.name] = []) }
  where(c) { this._where = c; return this }
  field() { return this }
  orderBy(field, dir) { this._order = { field, dir: dir || 'asc' }; return this }
  limit(n) { this._limit = n; return this }
  doc(id) { this._docId = id; return this }
  async get() {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) throw new Error('nf'); return { data: clone(d) } }
    let out = this.rows().filter((r) => matchRow(r, this._where))
    if (this._order) { const { field, dir } = this._order; out = out.slice().sort((a, b) => { const x = a[field], y = b[field]; const c = x < y ? -1 : x > y ? 1 : 0; return dir === 'desc' ? -c : c }) }
    if (this._limit !== undefined) out = out.slice(0, this._limit)
    return { data: out.map(clone) }
  }
  async update({ data }) {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) return { stats: { updated: 0 } }; Object.assign(d, data); return { stats: { updated: 1 } } }
    let n = 0; for (const r of this.rows().filter((x) => matchRow(x, this._where))) { Object.assign(r, data); n++ } return { stats: { updated: n } }
  }
  async add({ data }) { const doc = clone(data); doc._id = data._id || 'id_' + ++SEQ; this.rows().push(doc); return { _id: doc._id } }
}
class DB { constructor() { this.data = {} } get command() { return CMD } collection(n) { return new Coll(this, n) } createCollection() { return Promise.resolve() } }

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
  await run('歧义: 示例丙 vs [示例甲,示例乙] → PET_UNKNOWN 零写入', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例甲', '示例乙'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例丙', time: '2026-06-11', event_type: '体重', weight: 3 } })
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

  // 6b. weight_spark 维护（ADR-025 方案 b）：连续落体重记录 → pets.weight_spark 按 time 升序累积
  await run('weight_spark: 体重记录维护趋势点（不论录入顺序按 time 升序）', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    await fn.main({ family_id: 'F1', record: { pet: '示例猫', time: '2026-03-01', event_type: '体重', weight: 4.8 } })
    await fn.main({ family_id: 'F1', record: { pet: '示例猫', time: '2026-01-01', event_type: '体重', weight: 4.2 } })
    await fn.main({ family_id: 'F1', record: { pet: '示例猫', time: '2026-02-01', event_type: '体重', weight: 4.5 } })
    const sp = pets().find((p) => p.name === '示例猫').weight_spark
    assert(Array.isArray(sp) && sp.join(',') === '4.2,4.5,4.8', '趋势点按 time 升序累积')
  })

  // 6c. weight_spark：建档带体重 → 初始化单点
  await run('weight_spark: 建档带体重初始化单点', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    await fn.main({ family_id: 'F1', record: { pet: '阿狗', new_pet: true, species: 'dog', time: '2026-06-11', event_type: '体重', weight: 2.1 } })
    const p = pets().find((x) => x.name === '阿狗')
    assert(p && Array.isArray(p.weight_spark) && p.weight_spark.join(',') === '2.1', '建档 weight_spark=[体重]')
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
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例甲', '示例乙'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'reminder', pet: '示例丁', rem_title: '体外驱虫', rem_type: '驱虫', rem_date: '2026-07-15' } })
    assert(r.ok === false && r.code === 'PET_UNKNOWN', '提醒错别字应拒')
    assert((DB_INST.data.reminders || []).length === 0, 'reminders 零写入')
  })

  // 7e. reminder pet 在库 → 正常落库
  await run('reminder: 在库宠物正常设提醒', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例甲'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'reminder', pet: '示例甲', rem_title: '疫苗', rem_type: '疫苗', rem_date: '2026-07-01' } })
    assert(r.ok === true && (DB_INST.data.reminders || [])[0].pet === '示例甲', '提醒落库')
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

  // 10. 养护(ADR-024): event_type=养护 入第 8 桶 + params 落库
  await run('养护: 第8桶 + params 落库', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例龟'])
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例龟', time: '2026-06-11', event_type: '养护', desc: '环境', params: { temp: 28, humidity: 60 } } })
    assert(r.ok === true && recs().length === 1, '养护记录落库')
    assert(recs()[0].event_type === '养护', 'event_type=养护 不被改其它')
    assert(recs()[0].params && recs()[0].params.temp === 28 && recs()[0].params.humidity === 60, 'params 正确落库')
  })

  // 11. params sanitize: 非法值 / 超界键剔除,非对象不写
  await run('params sanitize: 剔非法 + 缺省不写', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例鱼'])
    const longKey = 'k'.repeat(20)
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例鱼', event_type: '养护', desc: 'x', params: { ph: 7.2, bad: {}, [longKey]: 1, note: 'ok', huge: 'h'.repeat(40) } } })
    assert(r.ok === true, '落库成功')
    const p = recs()[0].params
    assert(p && p.ph === 7.2 && p.note === 'ok', '合法 number / 短串保留')
    assert(!('bad' in p) && !(longKey in p) && !('huge' in p), '对象值 / 超长键 / 超长串剔除')
    // 非养护 + 无 params → 不落 params 字段
    const r2 = await fn.main({ family_id: 'F1', record: { pet: '示例鱼', event_type: '症状', desc: 'y' } })
    assert(r2.ok === true && !('params' in recs()[1]), '无 params 不落字段')
  })

  // 11b. params event_type 门控(review #9): 非养护记录即便带合法 params 也不落（防串到症状/就医记录）
  await run('params 门控: 非养护带 params 不落', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例鱼', event_type: '症状', desc: '吐', params: { ph: 7.2 } } })
    assert(r.ok === true && !('params' in recs()[0]), '症状记录的 params 被门控丢弃')
  })

  // 11c. sanitize 键数 ≤8 截断边界(review #9): 传 10 键只留 8
  await run('params sanitize: 键数 ≤8 截断', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const big = {}
    for (let i = 0; i < 10; i++) big['k' + i] = i + 1
    const r = await fn.main({ family_id: 'F1', record: { pet: '示例鱼', event_type: '养护', desc: 'x', params: big } })
    assert(r.ok === true && Object.keys(recs()[0].params).length === 8, '只保留前 8 键')
  })

  // 12. reminder 养护类型(ADR-024): 不被落「其它」
  await run('reminder: 养护类型保留', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例龟'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'reminder', pet: '示例龟', rem_type: '养护', rem_title: '换 UVB 灯管', rem_date: '2026-12-01', rem_repeat_days: 182 } })
    assert(r.ok === true, '提醒落库')
    assert((DB_INST.data.reminders || [])[0].type === '养护', 'rem_type=养护 保留')
  })

  // ===== ADR-029 Round 1：多宠同事件批量 fan-out =====

  // 13. 批量正常: pets 多只 → 各存一条同内容, count + ids
  await run('批量: pets 两只 → 各存一条', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'record', pet: '示例猫', pets: ['示例猫', '示例狗'], time: '2026-06-11', event_type: '驱虫', desc: '体外驱虫' } })
    assert(r.ok === true && r.count === 2 && r.ids.length === 2, 'count=2 + ids 两个')
    assert(recs().length === 2, '落 2 条')
    assert(recs().some((x) => x.pet === '示例猫' && x.desc === '体外驱虫') && recs().some((x) => x.pet === '示例狗' && x.desc === '体外驱虫'), '两条分属两只、内容一致')
    assert(pets().length === 2, '不建档')
  })

  // 14. 批量含不存在 → 整批拒 PET_UNKNOWN 零写入(沿用 ADR-015 红线)
  await run('批量: 含不存在宠物 → 整批拒零写入', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'record', pets: ['示例猫', '幽灵', '示例狗'], time: '2026-06-11', event_type: '驱虫', desc: 'x' } })
    assert(r.ok === false && r.code === 'PET_UNKNOWN', '应拒 PET_UNKNOWN')
    assert(Array.isArray(r.missing) && r.missing.length === 1 && r.missing[0] === '幽灵', 'missing 仅列幽灵')
    assert(recs().length === 0, '整批零写入(不部分落)')
  })

  // 15. 批量去重: pets 含重名 → 只写 unique 一条/只
  await run('批量: pets 重复名去重', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'record', pets: ['示例猫', '示例猫 ', '示例狗'], time: '2026-06-11', event_type: '疫苗', desc: 'y' } })
    assert(r.ok === true && r.count === 2, 'trim+去重后 count=2')
    assert(recs().filter((x) => x.pet === '示例猫').length === 1, '示例猫只一条')
  })

  // 16. 批量体重: 每只各自回写 latest_weight + spark
  await run('批量: 体重各自回写', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    await fn.main({ family_id: 'F1', record: { kind: 'record', pets: ['示例猫', '示例狗'], time: '2026-06-11', event_type: '体重', weight: 4.5, desc: '集体称重' } })
    const c = pets().find((p) => p.name === '示例猫'); const d = pets().find((p) => p.name === '示例狗')
    assert(c.latest_weight === 4.5 && c.latest_weight_date === '2026-06-11', '示例猫体重回写')
    assert(d.latest_weight === 4.5 && d.latest_weight_date === '2026-06-11', '示例狗体重回写')
    assert(c.weight_spark.join(',') === '4.5' && d.weight_spark.join(',') === '4.5', '两只各自 spark')
  })

  // 17. 批量不落 params(养护参数物种特定,多只跨物种语义弱 → 一律不写,ADR-029)
  await run('批量: event_type=养护 也不落 params', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例龟', '示例鱼'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'record', pets: ['示例龟', '示例鱼'], time: '2026-06-11', event_type: '养护', desc: '环境', params: { temp: 28 } } })
    assert(r.ok === true && r.count === 2, '落 2 条')
    assert(recs().every((x) => !('params' in x)), '批量记录均不带 params')
  })

  // 18. 批量空名单 → INVALID(防全空数组误触发)
  await run('批量: 去空后为空 → INVALID', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'record', pets: ['', '  '], time: '2026-06-11', event_type: '驱虫', desc: 'x' } })
    assert(r.ok === false && r.code === 'INVALID', '空名单拒 INVALID')
    assert(recs().length === 0, '零写入')
  })

  // 19. 隔离不回归: 批量也走 assertMember(非成员拒、零写入)
  await run('批量: 非成员拒零写入', async () => {
    CUR_OPENID = 'uB'; seed('F1', 'uA', ['示例猫', '示例狗'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'record', pets: ['示例猫', '示例狗'], event_type: '驱虫', desc: 'x' } })
    assert(r.ok === false && recs().length === 0, '非成员批量应拒、零写入')
  })

  // ===== ADR-030 Round 2：多事件拆条 kind=multi =====

  // 20. multi 多条不同内容 → 各存一条, saved/count
  await run('multi: 两条不同内容 → 各存一条', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'multi', records: [
      { pet: '示例猫', time: '2026-06-11', event_type: '症状', desc: '呕吐' },
      { pet: '示例狗', time: '2026-06-11', event_type: '症状', desc: '腹泻' },
    ] } })
    assert(r.ok === true && r.kind === 'multi' && r.saved === 2 && r.count === 2, 'saved=2 count=2')
    assert(recs().length === 2, '落 2 条')
    assert(recs().some((x) => x.pet === '示例猫' && x.desc === '呕吐') && recs().some((x) => x.pet === '示例狗' && x.desc === '腹泻'), '两条内容各异')
  })

  // 21. multi 某条 pet 不在库 → 只该条失败, 其它照常(部分成功,不整批拒)
  await run('multi: 某条不在库只拒该条、其它照存', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'multi', records: [
      { pet: '示例猫', time: '2026-06-11', event_type: '症状', desc: '呕吐' },
      { pet: '幽灵', time: '2026-06-11', event_type: '症状', desc: '拉稀' },
    ] } })
    assert(r.ok === true && r.saved === 1 && r.count === 2, '部分成功 saved=1/2')
    assert(recs().length === 1 && recs()[0].pet === '示例猫', '只落在库那条')
    assert(r.results.length === 2 && r.results[0].pet === '示例猫' && r.results[1].pet === '幽灵', 'results 与入参严格同序同长（前端按 index 留失败卡的契约）')
    assert(r.results[0].ok === true && r.results[1].ok === false && r.results[1].code === 'PET_UNKNOWN', '在库条 ok、幽灵条 PET_UNKNOWN')
  })

  // 21b. multi 不建档（ADR-030）：0 宠家庭跑 multi → 全 PET_UNKNOWN、零写入、不建宠（与单条 0 宠首录放行建档相反）
  await run('multi: 0 宠不建档（allowCreate=false）', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', [])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'multi', records: [
      { pet: '小白', species: 'cat', event_type: '症状', desc: 'x' }, { pet: '小黑', species: 'dog', event_type: '症状', desc: 'y' },
    ] } })
    assert(r.ok === false && r.saved === 0, '全 PET_UNKNOWN saved=0')
    assert(r.results.every((x) => x.code === 'PET_UNKNOWN'), '每条 PET_UNKNOWN')
    assert(recs().length === 0 && pets().length === 0, 'multi 零写入、不建宠')
  })

  // 22. multi 体重各自回写
  await run('multi: 体重各自回写到各宠', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫', '示例狗'])
    await fn.main({ family_id: 'F1', record: { kind: 'multi', records: [
      { pet: '示例猫', time: '2026-06-11', event_type: '体重', weight: 4.5 },
      { pet: '示例狗', time: '2026-06-11', event_type: '体重', weight: 9.2 },
    ] } })
    const c = pets().find((p) => p.name === '示例猫'); const d = pets().find((p) => p.name === '示例狗')
    assert(c.latest_weight === 4.5 && d.latest_weight === 9.2, '两宠各自体重回写')
  })

  // 23. multi 全条不在库 → saved=0 ok:false
  await run('multi: 全不在库 saved=0', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'multi', records: [
      { pet: '幽灵甲', event_type: '症状', desc: 'x' }, { pet: '幽灵乙', event_type: '症状', desc: 'y' },
    ] } })
    assert(r.ok === false && r.saved === 0, '全失败 ok:false saved=0')
    assert(recs().length === 0, '零写入')
  })

  // 24. multi 空 records → INVALID
  await run('multi: 空 records → INVALID', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u', ['示例猫'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'multi', records: [] } })
    assert(r.ok === false && r.code === 'INVALID', '空 records 拒 INVALID')
  })

  // 25. multi 隔离: 非成员拒(assertMember 在 saveMulti 之前)
  await run('multi: 非成员拒零写入', async () => {
    CUR_OPENID = 'uB'; seed('F1', 'uA', ['示例猫', '示例狗'])
    const r = await fn.main({ family_id: 'F1', record: { kind: 'multi', records: [{ pet: '示例猫', event_type: '症状', desc: 'x' }] } })
    assert(r.ok === false && r.code === 'NOT_MEMBER' && recs().length === 0, '非成员 multi 应拒、零写入')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
