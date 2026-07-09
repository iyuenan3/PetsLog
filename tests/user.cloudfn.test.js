// user 云函数集成测试（sweep 安全修复补测）：mock wx-server-sdk，跑真实 index.js。
// 重点断言头像 fileID 白名单 sanitizeAvatar（防注入他人 fileID 借换头像的 admin deleteFile 删任意文件）+ me/update 基本行为。
// 此前 user/ 零测试 → 剥掉 sanitizeAvatar 全套仍绿（假绿盲区），本文件堵上。跑法：node tests/user.cloudfn.test.js
const Module = require('module')
const path = require('path')

function clone(o) { return JSON.parse(JSON.stringify(o)) }
function matchRow(row, where) { return Object.entries(where || {}).every(([k, v]) => row[k] === v) }
let SEQ = 0
let DELETED = [] // 记录 cloud.deleteFile 被删的 fileID，验换头像删旧值 / 不误删
class Coll {
  constructor(db, name) { this.db = db; this.name = name; this._where = null; this._docId = undefined }
  rows() { return this.db.data[this.name] || (this.db.data[this.name] = []) }
  where(c) { this._where = c; return this }
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
const fakeCloud = {
  init() {},
  DYNAMIC_CURRENT_ENV: 'env',
  database: () => DB_INST,
  getWXContext: () => ({ OPENID: CUR_OPENID }),
  deleteFile: async ({ fileList }) => { DELETED.push(...(fileList || [])); return { fileList: [] } },
}
const origLoad = Module._load
Module._load = function (request) { if (request === 'wx-server-sdk') return fakeCloud; return origLoad.apply(this, arguments) }
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'user', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function reset() { DB_INST.data = {}; CUR_OPENID = ''; DELETED = [] }
const users = () => DB_INST.data.users || []
const meRow = (openid) => users().find((u) => u._openid === openid)
async function run(t, body) { reset(); try { await body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

const GOOD = 'cloud://env.abc/avatars/123.png'
const EVIL = 'cloud://env.abc/att/rec1/victim.jpg' // 别家病历附件 fileID

;(async () => {
  // 1. 头像白名单：合法 /avatars/ 保留 / 注入 att/ fileID 清空（add 新建路径）
  await run('头像白名单(add 路径): /avatars/ 留 / att/ 注入清空', async () => {
    CUR_OPENID = 'u1'
    await fn.main({ action: 'update', avatar: GOOD, nickname: '示例' })
    assert(meRow('u1').avatar === GOOD, '合法 /avatars/ 头像原样落库')
    reset()
    CUR_OPENID = 'u2'
    await fn.main({ action: 'update', avatar: EVIL })
    assert(meRow('u2').avatar === '', '注入 att/ fileID 被清空（不落库）')
  })

  // 2. 头像白名单：update 既有档路径同样校验
  await run('头像白名单(update 既有档): att/ 注入清空 / 合法保留', async () => {
    CUR_OPENID = 'u'
    await fn.main({ action: 'update', avatar: GOOD }) // 先建档 + 合法头像
    assert(meRow('u').avatar === GOOD, '初次合法头像落库')
    await fn.main({ action: 'update', avatar: EVIL }) // 再注入恶意
    assert(meRow('u').avatar === '', 'update 注入 att/ fileID 被清空')
    const before = DELETED.length
    await fn.main({ action: 'update', avatar: GOOD })
    assert(meRow('u').avatar === GOOD, 'update 换回合法头像保留')
    assert(before >= 0, 'sanity')
  })

  // 3. 换头像删旧值只删自己的旧头像（自有 fileID，可接受）；注入被清空后不拿受害者 fileID 当新值去删
  await run('换头像删旧值: 删自己旧头像 / 注入值从不进 patch 故不会被当旧值删他人', async () => {
    CUR_OPENID = 'u'
    await fn.main({ action: 'update', avatar: GOOD })
    const OLD = 'cloud://env.abc/avatars/old.png'
    meRow('u').avatar = OLD // 模拟库里已有旧头像
    const NEW = 'cloud://env.abc/avatars/new.png'
    DELETED = []
    await fn.main({ action: 'update', avatar: NEW })
    assert(meRow('u').avatar === NEW, '新头像落库')
    assert(DELETED.includes(OLD), '旧头像（自己的 /avatars/ 文件）被删（防孤儿）')
    // 注入路径：avatar=EVIL 被 sanitize 成 ''，旧值 NEW 会被删（自己的），但 EVIL 从不成为库内值 → 不会反过来删受害者
    DELETED = []
    await fn.main({ action: 'update', avatar: EVIL })
    assert(meRow('u').avatar === '', 'EVIL 注入落空串')
    assert(DELETED.includes(NEW) && !DELETED.includes(EVIL), '删的是自己旧头像 NEW、绝不删 EVIL 指向的受害者文件')
  })

  // 4. me: 只读自有档 + 空档兜底
  await run('me: 读自有 nickname/avatar + 空档兜底空串', async () => {
    CUR_OPENID = 'u'
    const empty = await fn.main({ action: 'me' })
    assert(empty.ok === true && empty.data.nickname === '' && empty.data.avatar === '', '无档返空串不报错')
    await fn.main({ action: 'update', nickname: '张三', avatar: GOOD })
    const r = await fn.main({ action: 'me' })
    assert(r.data.nickname === '张三' && r.data.avatar === GOOD, 'me 读回自有档')
  })

  // 5. update: nickname 截断 30 + 隔离（_openid 显式写，只动自有档）
  await run('update: nickname 截 30 + _openid 隔离', async () => {
    CUR_OPENID = 'uA'
    await fn.main({ action: 'update', nickname: '名'.repeat(50), avatar: GOOD })
    assert(meRow('uA').nickname.length === 30, 'nickname 截断 ≤30')
    assert(meRow('uA')._openid === 'uA', 'add 显式写 _openid（否则 where 查不回）')
    CUR_OPENID = 'uB'
    await fn.main({ action: 'update', nickname: 'B', avatar: GOOD })
    assert(users().length === 2 && meRow('uB')._openid === 'uB', '不同 openid 各自独立档，不串')
  })

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
  process.exit(fail ? 1 : 0)
})()
