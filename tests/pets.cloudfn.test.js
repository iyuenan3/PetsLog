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
  async remove() {
    if (this._docId !== undefined) { const i = this.rows().findIndex((r) => r._id === this._docId); if (i >= 0) this.rows().splice(i, 1); return { stats: { removed: 1 } } }
    // where().remove() 批量删（对齐真 tcb）：使「删宠保留」用例对任何形态的级联删都敏感，不止 doc(id) 形态
    const before = this.rows().length; this.db.data[this.name] = this.rows().filter((r) => !matchRow(r, this._where)); return { stats: { removed: before - this.db.data[this.name].length } }
  }
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
const foodsOf = (fid) => (DB_INST.data.foods || []).filter((f) => f.family_id === fid)
const recsOf = (fid) => (DB_INST.data.records || []).filter((r) => r.family_id === fid)
const remsOf = (fid) => (DB_INST.data.reminders || []).filter((r) => r.family_id === fid)
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

;(async () => {
  // 1. add: trim + 落库
  await run('add: 服务端 trim', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const r = await fn.main({ family_id: 'F1', action: 'add', pet: { name: ' 示例狗 ', species: 'dog' } })
    assert(r.ok === true && pets()[0].name === '示例狗', '尾空格被 trim')
  })

  // 2. add: 同名查重拒
  await run('add: 同名查重拒', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例狗' } })
    const r = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例狗 ' } })
    assert(r.ok === false, 'trim 后同名应拒')
    assert(pets().length === 1, '不产生重名档案')
  })

  // 3. update: 改名撞已有名拒
  await run('update: 改名撞已有名拒', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例狗' } })
    const b = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例猫' } })
    const r = await fn.main({ family_id: 'F1', action: 'update', id: b.id, pet: { name: '示例狗' } })
    assert(r.ok === false, '改名撞名应拒')
    assert(pets().filter((p) => p.name === '示例狗').length === 1, '仍只一只示例狗')
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

  // 5. 物种枚举白名单(ADR-023): 新物种原样保留 + 非法落 other（add + update 两路，守落库总闸不回归二元钳制）
  await run('物种枚举: 新物种保留 + 非法落 other', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const a = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例龟', species: 'reptile' } })
    assert(pets().find((p) => p._id === a.id).species === 'reptile', 'add reptile 原样保留（不被钳回 cat）')
    const b = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例怪', species: 'snake' } })
    assert(pets().find((p) => p._id === b.id).species === 'other', 'add 非法 species 落 other')
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { species: 'bird' } })
    assert(pets().find((p) => p._id === a.id).species === 'bird', 'update 改物种保留')
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { species: 'xyz' } })
    assert(pets().find((p) => p._id === a.id).species === 'other', 'update 非法 species 落 other')
  })

  // 6b. 性别枚举(ADR-025): male/female 保留，其余（含未填）落空串（add + update 两路）
  await run('性别枚举: male/female 保留 + 非法落空串', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const a = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例甲', gender: 'female' } })
    assert(pets().find((p) => p._id === a.id).gender === 'female', 'add female 保留')
    const b = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例乙', gender: 'X' } })
    assert(pets().find((p) => p._id === b.id).gender === '', 'add 非法性别落空串')
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { gender: 'male' } })
    assert(pets().find((p) => p._id === a.id).gender === 'male', 'update male 保留')
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { gender: 'zzz' } })
    assert(pets().find((p) => p._id === a.id).gender === '', 'update 非法性别落空串')
  })

  // 7. 改名级联（ADR-027，本 commit 新增）：foods.pet 单宠覆盖随改名迁移；物种默认（pet=''）不受波及。
  await run('改名级联: foods.pet 随改名迁移, 默认档不动', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const a = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例猫', species: 'cat' } })
    DB_INST.data.foods = [
      { _id: 'fo1', family_id: 'F1', pet: '示例猫', species: 'cat', brand: '处方粮', current: true }, // 单宠覆盖
      { _id: 'fo2', family_id: 'F1', pet: '', species: 'cat', brand: '默认粮', current: true }, // 物种默认
      { _id: 'fo3', family_id: 'F9', pet: '示例猫', species: 'cat', brand: '别家粮', current: true }, // 别家同名
    ]
    const r = await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { name: '咪咪' } })
    assert(r.ok === true, '改名成功')
    assert(foodsOf('F1').find((f) => f.brand === '处方粮').pet === '咪咪', '单宠覆盖 pet 迁到新名')
    assert(foodsOf('F1').find((f) => f.brand === '默认粮').pet === '', '物种默认 pet 仍为空（不被误改）')
    assert(foodsOf('F9').find((f) => f.brand === '别家粮').pet === '示例猫', '别家同名 food 不受波及（family 隔离）')
  })

  // 8. 物种变更级联（ADR-027 ⑥，本 commit 新增）：改 species 时该宠 foods.species 纠偏（保台账分组正确）。
  await run('物种级联: 改 species 同步 foods.species', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const a = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例宠', species: 'cat' } })
    DB_INST.data.foods = [{ _id: 'fo1', family_id: 'F1', pet: '示例宠', species: 'cat', brand: '某粮', current: true }]
    const r = await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { species: 'dog' } })
    assert(r.ok === true, '改物种成功')
    assert(foodsOf('F1').find((f) => f.brand === '某粮').species === 'dog', '该宠单宠覆盖 foods.species 同步为 dog')
    assert(foodsOf('F1').find((f) => f.brand === '某粮').pet === '示例宠', 'pet 不变')
  })

  // 9. 删宠级联边界（sweep 修复）：delete 级联清 reminders + foods 单宠覆盖（未来待办 / 当前状态、非病史）；
  // records（病史）有意保留；foods 物种默认（pet=''）+ 别家同名不受波及。
  await run('删宠级联: reminders+foods单宠覆盖 清 / records+默认档+别家 留 / 隔离', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const a = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例猫', species: 'cat' } })
    DB_INST.data.foods = [
      { _id: 'fo1', family_id: 'F1', pet: '示例猫', species: 'cat', brand: '处方粮', current: true }, // 该宠单宠覆盖 → 应删
      { _id: 'fo2', family_id: 'F1', pet: '', species: 'cat', brand: '默认粮', current: true }, // 物种默认 → 保留
      { _id: 'fo3', family_id: 'F9', pet: '示例猫', species: 'cat', brand: '别家粮', current: true }, // 别家同名 → 保留
    ]
    DB_INST.data.records = [{ _id: 're1', family_id: 'F1', pet: '示例猫', event_type: '体检', time: '2025-01-01 12:00' }]
    DB_INST.data.reminders = [
      { _id: 'rm1', family_id: 'F1', pet: '示例猫', title: '驱虫', repeat_days: 30 }, // 该宠提醒 → 应删
      { _id: 'rm2', family_id: 'F1', pet: '示例狗', title: '疫苗' }, // 同家别宠 → 保留
      { _id: 'rm3', family_id: 'F9', pet: '示例猫', title: '别家同名宠提醒' }, // 别家同名 → 保留（family 隔离）
    ]
    const r = await fn.main({ family_id: 'F1', action: 'delete', id: a.id })
    assert(r.ok === true, '删宠成功')
    assert(pets().length === 0, 'pet 文档已删')
    assert(!remsOf('F1').some((x) => x.pet === '示例猫'), '该宠 reminders 已级联删（不再幽灵循环）')
    assert(remsOf('F1').some((x) => x.pet === '示例狗'), '同家别宠 reminders 保留')
    assert(remsOf('F9').some((x) => x.pet === '示例猫'), '别家同名宠 reminders 保留（family 隔离）')
    assert(!foodsOf('F1').some((f) => f.pet === '示例猫'), '该宠 foods 单宠覆盖已级联删（不留孤儿台账）')
    assert(foodsOf('F1').some((f) => f.pet === '' && f.brand === '默认粮'), 'foods 物种默认（pet=空）保留')
    assert(foodsOf('F9').some((f) => f.pet === '示例猫'), '别家同名 foods 保留（family 隔离）')
    assert(recsOf('F1').some((r) => r.pet === '示例猫'), '该宠 records 有意保留（删档案≠删病史）')
  })

  // 9b. 头像 fileID 白名单（sweep 安全修复）：合法头像必落 /avatars/，注入他人 fileID（att/ 病历等）落空串。
  // 防换头像时服务端 admin cloud.deleteFile 被利用删任意文件（add + update 两路）。
  await run('头像白名单: /avatars/ 保留 / 非法 fileID 清空 / 空串放行', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const good = 'cloud://env.abc/avatars/123.png'
    const evil = 'cloud://env.abc/att/rec1/victim.jpg' // 别家病历附件 fileID
    const a = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例甲', avatar: good } })
    assert(pets().find((p) => p._id === a.id).avatar === good, 'add 合法 /avatars/ 头像原样保留')
    const b = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例乙', avatar: evil } })
    assert(pets().find((p) => p._id === b.id).avatar === '', 'add 注入 att/ fileID 被清空（不落库）')
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { avatar: evil } })
    assert(pets().find((p) => p._id === a.id).avatar === '', 'update 注入 att/ fileID 被清空')
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { avatar: good } })
    assert(pets().find((p) => p._id === a.id).avatar === good, 'update 合法 /avatars/ 头像保留')
  })

  // 6. 隔离: 非成员拒
  await run('隔离: 非成员拒', async () => {
    CUR_OPENID = 'uB'; seed('F1', 'uA')
    const r = await fn.main({ family_id: 'F1', action: 'add', pet: { name: 'X' } })
    assert(r.ok === false && pets().length === 0, '非成员应拒')
  })

  // 10. 乐观并发（ADR-033）：base_updated_at 版本校验。匹配过 / stale 拒不落库 / 无 base 向后兼容
  await run('乐观并发: 匹配 base 过 / stale base 拒不落库 / 无 base 兼容', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const a = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例猫', species: 'cat' } })
    const get = () => pets().find((p) => p._id === a.id)
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { note: 'v1' } }) // 确立 updated_at
    assert(typeof get().updated_at === 'number', 'update 后有 updated_at')
    // 匹配 base（= 当前 updated_at）→ 过
    const ok = await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { note: 'v2' }, base_updated_at: get().updated_at })
    assert(ok.ok === true && get().note === 'v2', '匹配 base 落库成功')
    // stale base（故意比当前小，免 Date.now() 同毫秒 flaky）→ CONFLICT 且不落库
    const conf = await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { note: 'v3' }, base_updated_at: get().updated_at - 99999 })
    assert(conf.ok === false && conf.code === 'CONFLICT', 'stale base 返 CONFLICT')
    assert(get().note === 'v2', 'CONFLICT 时不落库（note 仍 v2）')
    // 不带 base → 向后兼容（saveRecord 体重回写 / importNotion / 旧端）
    const compat = await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { note: 'v4' } })
    assert(compat.ok === true && get().note === 'v4', '不带 base 向后兼容照常落库')
  })

  // 11. 局部 patch（前端只发改过字段，ADR-033）：未传字段不被清空（依赖服务端 `if (!(k in p)) continue`）
  await run('局部 patch: 未传字段不被清空', async () => {
    CUR_OPENID = 'u'; seed('F1', 'u')
    const a = await fn.main({ family_id: 'F1', action: 'add', pet: { name: '示例猫', species: 'cat', breed: '英短', intro: '高冷' } })
    await fn.main({ family_id: 'F1', action: 'update', id: a.id, pet: { intro: '其实黏人' } })
    const p = pets().find((x) => x._id === a.id)
    assert(p.intro === '其实黏人', 'intro 更新')
    assert(p.breed === '英短', 'breed 未传不被清空')
    assert(p.name === '示例猫', 'name 未传不变')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
