// meds 云函数集成测试：mock wx-server-sdk，跑真实 list/add/update/delete。
// 断言 add 落 raw（当时原话 provenance）、update 只改 name/effect/quantity/expire_date（raw 只读不动）、
// 补填/清空过期日、数量可 0、空名拒、family 隔离（越权改/删他家拒且零改动）、非成员拒。
// 跑法：node tests/meds.cloudfn.test.js
const Module = require('module')
const path = require('path')

function clone(o) { return JSON.parse(JSON.stringify(o)) }
function matchRow(row, where) {
  return Object.entries(where || {}).every(([k, v]) => {
    if (v === undefined) return true
    return row[k] === v
  })
}
function applyUpdate(doc, data) { for (const [k, v] of Object.entries(data)) doc[k] = v }
let SEQ = 0
class Coll {
  constructor(db, name) { this.db = db; this.name = name; this._where = null; this._docId = undefined; this._order = null }
  rows() { return this.db.data[this.name] || (this.db.data[this.name] = []) }
  where(c) { this._where = c; return this }
  field() { return this }
  orderBy(field, dir) { this._order = { field, dir: dir || 'asc' }; return this }
  limit() { return this }
  doc(id) { this._docId = id; return this }
  async get() {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) throw new Error('nf'); return { data: clone(d) } }
    let out = this.rows().filter((r) => matchRow(r, this._where))
    if (this._order) { const { field, dir } = this._order; out = out.slice().sort((a, b) => { const x = a[field], y = b[field]; const c = x < y ? -1 : x > y ? 1 : 0; return dir === 'desc' ? -c : c }) }
    return { data: out.map(clone) }
  }
  async update({ data }) {
    if (this._docId !== undefined) { const d = this.rows().find((r) => r._id === this._docId); if (!d) return { stats: { updated: 0 } }; applyUpdate(d, data); return { stats: { updated: 1 } } }
    let n = 0; for (const r of this.rows().filter((x) => matchRow(x, this._where))) { applyUpdate(r, data); n++ } return { stats: { updated: n } }
  }
  async remove() { const i = this.rows().findIndex((r) => r._id === this._docId); if (i >= 0) this.rows().splice(i, 1); return { stats: { removed: 1 } } }
  async add({ data }) { const doc = clone(data); doc._id = data._id || 'id_' + ++SEQ; this.rows().push(doc); return { _id: doc._id } }
}
class DB { constructor() { this.data = {} } collection(n) { return new Coll(this, n) } createCollection() { return Promise.resolve() } }

let DB_INST = new DB()
let CUR_OPENID = ''
const fakeCloud = { init() {}, DYNAMIC_CURRENT_ENV: 'env', database: () => DB_INST, getWXContext: () => ({ OPENID: CUR_OPENID }) }
const origLoad = Module._load
Module._load = function (request) { if (request === 'wx-server-sdk') return fakeCloud; return origLoad.apply(this, arguments) }
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'meds', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function reset() { DB_INST.data = {}; CUR_OPENID = '' }
function seedFamily(fid, openid, role) {
  DB_INST.data.family_members = DB_INST.data.family_members || []
  DB_INST.data.family_members.push({ family_id: fid, openid, role: role || 'admin' })
}
function medsOf(fid) { return (DB_INST.data.meds || []).filter((m) => m.family_id === fid) }
// 直接造一条药品（绕 add），便于测 update/delete
function seedMed(fid, m) {
  DB_INST.data.meds = DB_INST.data.meds || []
  const doc = Object.assign({ _id: 'med_' + ++SEQ, family_id: fid, name: '海乐妙', effect: '驱虫', quantity: 1, expire_date: '', raw: '买了盒海乐妙驱虫' }, m)
  DB_INST.data.meds.push(doc)
  return doc._id
}
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

;(async () => {
  // 1. add：落 raw（当时原话 provenance）
  await run('add: 落库带 raw', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', med: { name: '海乐妙', effect: '驱虫', quantity: 2, expire_date: '2027-03-01', raw: '买了盒海乐妙2支明年3月过期' } })
    assert(r.ok === true && r.id, 'add 成功返 id')
    const m = medsOf('F1')[0]
    assert(m && m.raw === '买了盒海乐妙2支明年3月过期', 'raw 落库')
    assert(m.quantity === 2 && m.expire_date === '2027-03-01', '其余字段落库')
  })

  // 2. add：缺 name 拒
  await run('add: 缺 name 拒', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', med: { effect: '驱虫' } })
    assert(r.ok === false, '缺 name 应拒')
    assert(medsOf('F1').length === 0, '零写入')
  })

  // 3. update：整体改 name/effect/quantity/expire_date
  await run('update: 全字段编辑', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const id = seedMed('F1', { name: '海乐妙', effect: '', quantity: 1, expire_date: '' })
    const r = await fn.main({ family_id: 'F1', action: 'update', id, med: { name: '海乐妙片', effect: '体内外驱虫', quantity: 3, expire_date: '2027-05-01' } })
    assert(r.ok === true, 'update 成功')
    const m = medsOf('F1')[0]
    assert(m.name === '海乐妙片' && m.effect === '体内外驱虫' && m.quantity === 3 && m.expire_date === '2027-05-01', '四字段已改')
  })

  // 4. update：仅补填过期日（测试人员核心诉求：「过期 未填」→ 补填）
  await run('update: 仅补填过期日（其余不动）', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const id = seedMed('F1', { name: '海乐妙', effect: '驱虫', quantity: 1, expire_date: '' })
    const r = await fn.main({ family_id: 'F1', action: 'update', id, med: { expire_date: '2027-03-01' } })
    assert(r.ok === true, 'update 成功')
    const m = medsOf('F1')[0]
    assert(m.expire_date === '2027-03-01', '过期日补上')
    assert(m.name === '海乐妙' && m.effect === '驱虫' && m.quantity === 1, '未传字段保持原值')
  })

  // 5. update：raw 是只读 provenance，不被 update 改动
  await run('update: raw 只读不被改', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const id = seedMed('F1', { raw: '原始原话' })
    // 即便恶意/误传 raw，也不该写入（云函数只取 name/effect/quantity/expire_date）
    const r = await fn.main({ family_id: 'F1', action: 'update', id, med: { name: '新名', raw: '篡改原话' } })
    assert(r.ok === true, 'update 成功')
    assert(medsOf('F1')[0].raw === '原始原话', 'raw 保持不变')
  })

  // 6. update：数量可设 0（用完）
  await run('update: 数量可 0', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const id = seedMed('F1', { quantity: 2 })
    const r = await fn.main({ family_id: 'F1', action: 'update', id, med: { quantity: 0 } })
    assert(r.ok === true && medsOf('F1')[0].quantity === 0, '数量落 0')
  })

  // 7. update：name 不可被清空（防台账空名）
  await run('update: 空 name 拒、不改动', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const id = seedMed('F1', { name: '海乐妙' })
    const r = await fn.main({ family_id: 'F1', action: 'update', id, med: { name: '   ' } })
    assert(r.ok === false, '空 name 应拒')
    assert(medsOf('F1')[0].name === '海乐妙', '原名不变')
  })

  // 8. update：清空过期日（误填可清）
  await run('update: 清空过期日', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const id = seedMed('F1', { expire_date: '2027-03-01' })
    const r = await fn.main({ family_id: 'F1', action: 'update', id, med: { expire_date: '' } })
    assert(r.ok === true && medsOf('F1')[0].expire_date === '', '过期日清空')
  })

  // 9. family 隔离：越权改他家药品 → not found、零改动
  await run('隔离: 越权 update 他家拒、零改动', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA'); seedFamily('F2', 'uB')
    const idB = seedMed('F2', { name: '他家药', quantity: 5 })
    // uA 是 F1 成员，但拿 F1 上下文去改 F2 的药 → assertMember(F1) 过，但 doc.family_id !== F1 → not found
    const r = await fn.main({ family_id: 'F1', action: 'update', id: idB, med: { name: '被篡改', quantity: 99 } })
    assert(r.ok === false, '越权改应拒')
    const m = (DB_INST.data.meds || []).find((x) => x._id === idB)
    assert(m.name === '他家药' && m.quantity === 5, 'F2 药品零改动')
  })

  // 10. delete：删本家药品
  await run('delete: 删本家药品', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const id = seedMed('F1', {})
    const r = await fn.main({ family_id: 'F1', action: 'delete', id })
    assert(r.ok === true && medsOf('F1').length === 0, '已删除')
  })

  // 11. delete：越权删他家 → not found、零删除
  await run('隔离: 越权 delete 他家拒、零删除', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA'); seedFamily('F2', 'uB')
    const idB = seedMed('F2', {})
    const r = await fn.main({ family_id: 'F1', action: 'delete', id: idB })
    assert(r.ok === false, '越权删应拒')
    assert((DB_INST.data.meds || []).some((x) => x._id === idB), 'F2 药品仍在')
  })

  // 12. 鉴权：非成员一律拒（update/delete 也走 assertMember）
  await run('鉴权: 非成员 update 拒', async () => {
    CUR_OPENID = 'stranger'; seedFamily('F1', 'uA')
    const id = seedMed('F1', {})
    const r = await fn.main({ family_id: 'F1', action: 'update', id, med: { name: 'x' } })
    assert(r.ok === false && (r.code === 'NOT_MEMBER' || r.code === 'AUTH'), '非成员拒')
    assert(medsOf('F1')[0].name === '海乐妙', '零改动')
  })

  // 13. list：按家庭隔离 + 过期日升序
  await run('list: 家庭隔离 + expire 升序', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA'); seedFamily('F2', 'uB')
    seedMed('F1', { name: 'A', expire_date: '2027-05-01' })
    seedMed('F1', { name: 'B', expire_date: '2027-01-01' })
    seedMed('F2', { name: 'C', expire_date: '2027-02-01' })
    const r = await fn.main({ family_id: 'F1', action: 'list' })
    assert(r.ok === true && r.data.length === 2, '只见本家 2 条')
    assert(r.data[0].name === 'B' && r.data[1].name === 'A', '按 expire 升序')
  })

  // ===== ADR-035 药品类型 =====
  // 14. add：落 type（显式给）
  await run('type: add 落库带 type', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', med: { name: '海乐妙', effect: '驱虫', type: '驱虫' } })
    assert(r.ok === true, 'add 成功')
    assert(medsOf('F1')[0].type === '驱虫', 'type 落库')
  })

  // 15. add：缺 type 默认「用药」（药品库存默认就是药，非提醒兜底「其它」）
  await run('type: add 缺 type 默认用药', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', med: { name: '消炎药' } })
    assert(r.ok === true && medsOf('F1')[0].type === '用药', '缺 type 默认用药')
  })

  // 16. add：非法 type 钳到「用药」
  await run('type: add 非法 type 钳用药', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', med: { name: 'x', type: '乱填' } })
    assert(r.ok === true && medsOf('F1')[0].type === '用药', '非法 type 归用药')
  })

  // 17. update：改 type（钳枚举），其余不动
  await run('type: update 改 type', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const id = seedMed('F1', { name: '海乐妙', type: '用药', effect: '驱虫' })
    const r = await fn.main({ family_id: 'F1', action: 'update', id, med: { type: '驱虫' } })
    assert(r.ok === true && medsOf('F1')[0].type === '驱虫', 'type 改成驱虫')
    assert(medsOf('F1')[0].name === '海乐妙', '未传字段不动')
  })

  // 18. update：非法 type 钳用药
  await run('type: update 非法 type 钳用药', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    const id = seedMed('F1', { type: '驱虫' })
    const r = await fn.main({ family_id: 'F1', action: 'update', id, med: { type: 'xxx' } })
    assert(r.ok === true && medsOf('F1')[0].type === '用药', '非法 type 归用药')
  })

  // 19. backfill_type：按 effect 关键词推断、仅补无 type 的行、家庭隔离
  // 注：seedMed 默认不写 type，故这些行天然无 type（除显式传 type 的「已分类」）
  await run('type: backfill_type 按 effect 推断 + 仅补缺 + 隔离', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA'); seedFamily('F2', 'uB')
    const idDeworm = seedMed('F1', { name: '海乐妙', effect: '体外驱虫' })
    const idVac = seedMed('F1', { name: '疫苗A', effect: '猫三联疫苗' })
    const idCare = seedMed('F1', { name: '益生菌', effect: '肠道保健' })
    const idOther = seedMed('F1', { name: '消炎药', effect: '消炎' })
    const idHasType = seedMed('F1', { name: '已分类', effect: '驱虫', type: '其它' }) // 已有合法 type → 不动
    const idF2 = seedMed('F2', { name: '他家', effect: '驱虫' })
    const r = await fn.main({ family_id: 'F1', action: 'backfill_type' })
    assert(r.ok === true && r.changed === 4, '只补本家 4 条无 type（已分类的不动）')
    const byId = (id) => DB_INST.data.meds.find((m) => m._id === id)
    assert(byId(idDeworm).type === '驱虫', '驱虫关键词→驱虫')
    assert(byId(idVac).type === '疫苗', '疫苗关键词→疫苗')
    assert(byId(idCare).type === '养护', '保健关键词→养护')
    assert(byId(idOther).type === '用药', '无关键词→用药')
    assert(byId(idHasType).type === '其它', '已有合法 type 不被覆盖（幂等）')
    assert(byId(idF2).type === undefined, '他家未被回填（隔离）')
  })

  // 20. backfill_type：幂等（再跑一次零改动）
  await run('type: backfill_type 幂等', async () => {
    CUR_OPENID = 'uA'; seedFamily('F1', 'uA')
    seedMed('F1', { effect: '驱虫' })
    await fn.main({ family_id: 'F1', action: 'backfill_type' })
    const r2 = await fn.main({ family_id: 'F1', action: 'backfill_type' })
    assert(r2.ok === true && r2.changed === 0, '二次回填零改动（已有 type）')
  })

  // 21. backfill_type：非 admin 拒（维护动作收敛管理员，对齐 backfill_foods）
  await run('type: backfill_type 非 admin 拒 NOT_ADMIN', async () => {
    CUR_OPENID = 'uM'; seedFamily('F1', 'uM', 'member')
    const id = seedMed('F1', { effect: '驱虫' })
    const r = await fn.main({ family_id: 'F1', action: 'backfill_type' })
    assert(r.ok === false && r.msg === 'NOT_ADMIN', '非 admin 应拒')
    assert(DB_INST.data.meds.find((m) => m._id === id).type === undefined, '拒后零改动（未回填）')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
