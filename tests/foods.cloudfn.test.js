// foods 云函数集成测试（ADR-027 多宠化主粮台账）：mock wx-server-sdk，跑真实 list/add/update/delete/backfill_foods，
// 断言 add 校验（species/brand）、current 排他作用域 (family,species,pet)、取消在喂补换粮日、family 隔离、迁移拆 name。
// 跑法：node tests/foods.cloudfn.test.js
const Module = require('module')
const path = require('path')

function clone(o) { return JSON.parse(JSON.stringify(o)) }
// where 匹配：支持 db.command.neq（clearOtherCurrent 的 _id: _.neq(exceptId)）+ 其余精确等值（含 pet:'' 精确匹配空作用域）
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
function seedFamily(fid, openid, role) {
  DB_INST.data.family_members = DB_INST.data.family_members || []
  DB_INST.data.family_members.push({ family_id: fid, openid, role: role || 'admin' })
}
function foodsOf(fid) { return (DB_INST.data.foods || []).filter((f) => f.family_id === fid) }
// 直接造旧迁移条（仅 name、无 brand），绕过 add 校验，模拟 ADR-014 历史库
function seedLegacy(fid, name) {
  DB_INST.data.foods = DB_INST.data.foods || []
  const doc = { _id: 'leg_' + ++SEQ, family_id: fid, name, current: false }
  DB_INST.data.foods.push(doc)
  return doc._id
}
const todayCN = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10)
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

;(async () => {
  // 1a. add 校验：缺 species 拒
  await run('add 校验: 缺 species 拒', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', food: { brand: '皇家' } })
    assert(r.ok === false, '缺 species 应拒')
    assert(foodsOf('F1').length === 0, '零写入')
  })

  // 1b. add 校验：非法 species 拒
  await run('add 校验: 非法 species 拒', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', food: { species: 'dragon', brand: '皇家' } })
    assert(r.ok === false, '非法 species 应拒')
    assert(foodsOf('F1').length === 0, '零写入')
  })

  // 1c. add 校验：缺 brand 拒
  await run('add 校验: 缺 brand 拒', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: '  ' } })
    assert(r.ok === false, '空 brand 应拒')
    assert(foodsOf('F1').length === 0, '零写入')
  })

  // 1d. 合法 add：落库字段正确（含日期归一、pet 默认空、current 在喂清 end_date）
  await run('add 合法: 字段正确落库', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: '渴望', model: '六种鱼', start_date: '2022年1月1日', end_date: '2023-01-01', current: true, note: '过渡期混喂' } })
    assert(a.ok === true && a.id, 'add 应成功')
    const f = foodsOf('F1')[0]
    assert(f.species === 'cat' && f.brand === '渴望' && f.model === '六种鱼', 'species/brand/model 正确')
    assert(f.pet === '', 'pet 默认空（物种默认档）')
    assert(f.start_date === '2022-01-01', 'start_date 归一')
    assert(f.current === true && f.end_date === '', '在喂中 end_date 清空（不残留矛盾）')
    assert(f.note === '过渡期混喂', 'note 正确')
  })

  // 2. 作用域排他（关键回归）：猫默认 + 狗默认可并存（不互清）；同 (cat,'') 作用域再设在喂清旧那条
  await run('作用域排他: 猫默认/狗默认并存, 同作用域互清', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: '猫粮A', current: true } })
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'dog', brand: '狗粮A', current: true } })
    let fs = foodsOf('F1')
    // 旧家庭级逻辑会把狗在喂误清猫在喂；新版不该
    assert(fs.find((f) => f.brand === '猫粮A').current === true, '猫默认在喂保留')
    assert(fs.find((f) => f.brand === '狗粮A').current === true, '狗默认在喂保留（跨物种不互清）')
    assert(fs.filter((f) => f.current).length === 2, '两物种各 1 个在喂并存')
    // 同 (cat,'') 作用域内再设一条在喂 → 旧猫粮 A 被清
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: '猫粮B', current: true } })
    fs = foodsOf('F1')
    assert(fs.find((f) => f.brand === '猫粮B').current === true, '新猫粮 B 在喂')
    assert(fs.find((f) => f.brand === '猫粮A').current === false, '同作用域旧猫粮 A 被清')
    assert(fs.find((f) => f.brand === '狗粮A').current === true, '狗默认在喂不受波及')
  })

  // 3. 单宠覆盖：cat+pet=示例猫 在喂，不影响 cat 默认（pet=''）在喂（不同作用域）
  await run('单宠覆盖: cat/示例猫 与 cat/默认 不互清', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', pet: '', brand: '默认猫粮', current: true } })
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', pet: '示例猫', brand: '处方粮', current: true } })
    const fs = foodsOf('F1')
    assert(fs.find((f) => f.brand === '默认猫粮').current === true, 'cat 默认在喂保留')
    assert(fs.find((f) => f.brand === '处方粮').current === true && fs.find((f) => f.brand === '处方粮').pet === '示例猫', 'cat/示例猫 单宠覆盖在喂保留')
    assert(fs.filter((f) => f.current).length === 2, '两作用域各 1 个在喂并存')
  })

  // 3b. 单宠覆盖作用域内排他：同 (cat,示例猫) 再设在喂清旧那条，不碰 cat 默认
  await run('单宠覆盖: 同 (cat,示例猫) 作用域内互清, 不碰默认', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', pet: '', brand: '默认猫粮', current: true } })
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', pet: '示例猫', brand: '处方粮老', current: true } })
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', pet: '示例猫', brand: '处方粮新', current: true } })
    const fs = foodsOf('F1')
    assert(fs.find((f) => f.brand === '处方粮新').current === true, '示例猫新处方在喂')
    assert(fs.find((f) => f.brand === '处方粮老').current === false, '示例猫旧处方被清')
    assert(fs.find((f) => f.brand === '默认猫粮').current === true, 'cat 默认不受单宠作用域影响')
  })

  // 4. update 取消在喂（current:false）：end_date 空时自动补当天
  await run('update 取消在喂: end_date 空补当天', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: '在喂粮', start_date: '2024-01-01', current: true } })
    assert(foodsOf('F1')[0].current === true && foodsOf('F1')[0].end_date === '', '初始在喂无结束日')
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, food: { current: false } })
    const f = foodsOf('F1')[0]
    assert(f.current === false, '已取消在喂')
    assert(/^\d{4}-\d{2}-\d{2}$/.test(f.end_date), 'end_date 形如 YYYY-MM-DD')
    assert(f.end_date === todayCN(), 'end_date 补当天（东八区）')
  })

  // 4b. update 设在喂：清同作用域其它 + 清自身 end_date（不取消自身）
  await run('update 设在喂: 排他清其它 + 清自身 end_date', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: 'A', current: true } })
    const b = await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: 'B', start_date: '2023-01-01', end_date: '2023-06-01', current: false } })
    await fn.main({ family_id: 'F1', action: 'update', id: b.id, food: { current: true } })
    const fs = foodsOf('F1')
    assert(fs.find((f) => f.brand === 'B').current === true && fs.find((f) => f.brand === 'B').end_date === '', 'B 设在喂且 end_date 清空')
    assert(fs.find((f) => f.brand === 'A').current === false, '同作用域 A 被清')
    assert(fs.filter((f) => f.current).length === 1, '仍只 1 个在喂')
  })

  // 4c. update 取消在喂但显式给了 end_date：尊重传入值不覆盖为今天
  await run('update 取消在喂: 显式 end_date 不被覆盖', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: 'C', current: true } })
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, food: { current: false, end_date: '2025-03-15' } })
    assert(foodsOf('F1')[0].end_date === '2025-03-15', '显式结束日保留不被当天覆盖')
  })

  // 5a. backfill_foods dryRun：返 report 不改库
  await run('backfill dryRun: 返 report 不改库', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    seedLegacy('F1', '皇家（I27+F32）')
    seedLegacy('F1', '渴望')
    const r = await fn.main({ family_id: 'F1', action: 'backfill_foods', dryRun: true })
    assert(r.ok === true && r.dryRun === true, 'dryRun 标记')
    assert(r.scanned === 2 && r.changed === 0, 'scanned 2 / changed 0')
    assert(r.report.length === 2, 'report 含 2 条拆解')
    const fs = foodsOf('F1')
    assert(fs.every((f) => !f.brand && !f.species), '库未改（dryRun 无 brand/species 写入）')
  })

  // 5b. backfill_foods 真跑：拆 brand/model + species='cat'/pet=''；含全角括号、无括号
  await run('backfill 真跑: 拆 name → brand/model + cat/默认', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    seedLegacy('F1', '皇家（I27+F32）') // 全角括号 + model 含 +
    seedLegacy('F1', '渴望')            // 无括号 → 整串 brand、model 空
    seedLegacy('F1', 'ProPlan (成猫)')  // 半角括号
    const r = await fn.main({ family_id: 'F1', action: 'backfill_foods', dryRun: false })
    assert(r.ok === true && r.changed === 3, 'changed 3')
    const fs = foodsOf('F1')
    const royal = fs.find((f) => f.brand === '皇家')
    assert(royal && royal.model === 'I27+F32', '全角括号拆 brand=皇家 / model=I27+F32（容 +）')
    const kw = fs.find((f) => f.brand === '渴望')
    assert(kw && kw.model === '', '无括号 → 整串 brand、model 空')
    const pp = fs.find((f) => f.brand === 'ProPlan')
    assert(pp && pp.model === '成猫', '半角括号拆 brand=ProPlan / model=成猫')
    assert(fs.every((f) => f.species === 'cat' && f.pet === ''), '全部 species=cat / pet=空')
  })

  // 5c. backfill_foods 幂等：已有 brand 的条跳过
  await run('backfill 幂等: 已有 brand 跳过', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'dog', brand: '新粮', model: '幼犬' } }) // 已是新版有 brand
    seedLegacy('F1', '老牌（旧型）')
    const r = await fn.main({ family_id: 'F1', action: 'backfill_foods', dryRun: false })
    assert(r.scanned === 2 && r.changed === 1, 'scanned 2 但只迁 1（有 brand 的跳过）')
    const kept = foodsOf('F1').find((f) => f.brand === '新粮')
    assert(kept.species === 'dog' && kept.model === '幼犬', '已迁条不被改回 cat')
  })

  // 5d. backfill_foods 非 admin 拒（NOT_ADMIN）
  await run('backfill 非 admin 拒 NOT_ADMIN', async () => {
    CUR_OPENID = 'uM'; seedFamily('F1', 'uM', 'member')
    seedLegacy('F1', '随便（型）')
    const r = await fn.main({ family_id: 'F1', action: 'backfill_foods', dryRun: false })
    assert(r.ok === false && r.msg === 'NOT_ADMIN', '非 admin 应拒 NOT_ADMIN')
    assert(foodsOf('F1').every((f) => !f.brand), '库未被迁')
  })

  // 6a. delete：按 _id + family 校验删
  await run('delete: 归属内删除', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: '待删粮' } })
    const r = await fn.main({ family_id: 'F1', action: 'delete', id: a.id })
    assert(r.ok === true && foodsOf('F1').length === 0, 'delete 成功')
  })

  // 6b. delete + family 隔离：别家 id 删不动 + 非成员 list 拒
  await run('隔离: 跨家庭删不动 + 非成员拒', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const a = await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: 'X' } })
    // uB 自己的家庭 F2，拿 F1 的 food id 删
    CUR_OPENID = 'uB'; seedFamily('F2', 'uB')
    const r1 = await fn.main({ family_id: 'F2', action: 'delete', id: a.id })
    assert(r1.ok === false, '跨家庭删别家 food 应拒（not found）')
    assert(foodsOf('F1').length === 1, 'F1 的 food 仍在')
    // uB 非 F1 成员 → list 拒
    const r2 = await fn.main({ family_id: 'F1', action: 'list' })
    assert(r2.ok === false, '非成员 list 应拒')
  })

  // 7. list：在喂置顶 + family 隔离只见本家
  await run('list: 只见本家 foods', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    await fn.main({ family_id: 'F1', action: 'add', food: { species: 'cat', brand: '本家粮' } })
    DB_INST.data.foods.push({ _id: 'other', family_id: 'F9', species: 'dog', brand: '别家粮', current: false })
    const l = await fn.main({ family_id: 'F1', action: 'list' })
    assert(l.ok === true && l.data.length === 1 && l.data[0].brand === '本家粮', '只返回本家庭 foods')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
