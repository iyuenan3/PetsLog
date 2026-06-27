// 只删 users 集合里【缺 _openid】的脏条（2026-06-09 _openid-fix 前的测试残留，无法被 where({_openid}) join、永久孤儿）。
// 安全三重保险（对齐 delete_orphans.mjs）：
//  ① 目标 _id 从 out/users.json 自动 derive（缺 _openid 者），加 >5 条上限保险（异常多则中止人工核）；
//  ② 删前逐条 get 核验「确实缺 _openid」，任一竟有 _openid 立即中止全部（防误删真档案）；
//  ③ 删前把目标完整内容备份到 out/dirty_users_backup_<ts>.json（gitignore，可恢复）。
// 跑法：node tools/wxdump/delete_dirty_users.mjs   (读 config.local.json，不回显 token)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.local.json'), 'utf8'))
const users = JSON.parse(fs.readFileSync(path.join(DIR, 'out', 'users.json'), 'utf8'))
const TARGETS = users.filter((u) => !u._openid).map((u) => u._id)

async function token() {
  const r = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${cfg.appid}&secret=${cfg.secret}`).then((x) => x.json())
  if (!r.access_token) throw new Error(`换 token 失败 ${r.errcode} ${r.errmsg}`)
  return r.access_token
}
async function query(tk, q) {
  const r = await fetch(`https://api.weixin.qq.com/tcb/databasequery?access_token=${tk}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ env: cfg.env, query: q }) }).then((x) => x.json())
  if (r.errcode) throw new Error(`query 失败 ${r.errcode} ${r.errmsg}`)
  return (r.data || []).map((s) => JSON.parse(s))
}
async function del(tk, q) {
  const r = await fetch(`https://api.weixin.qq.com/tcb/databasedelete?access_token=${tk}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ env: cfg.env, query: q }) }).then((x) => x.json())
  if (r.errcode) throw new Error(`delete 失败 ${r.errcode} ${r.errmsg}`)
  return r.deleted
}

;(async () => {
  if (!TARGETS.length) { console.log('无缺 _openid 的脏条，无需删'); return }
  if (TARGETS.length > 5) throw new Error(`缺 _openid 脏条 ${TARGETS.length} 条 > 5，异常多，中止人工核（防 dump 异常导致误删）`)
  const tk = await token()
  // ② 逐条 get + 守卫：确认存在且缺 _openid
  const backup = []
  for (const id of TARGETS) {
    const rows = await query(tk, `db.collection("users").where({_id:"${id}"}).limit(1).get()`)
    if (!rows.length) { console.log(`⚠ users/${id} 已不存在，跳过`); continue }
    const doc = rows[0]
    if (doc._openid) throw new Error(`✗ 中止！users/${id} 竟有 _openid（不是脏条），为防误删真档案全部中止`)
    backup.push(doc)
  }
  // ③ 备份（可恢复）
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const bf = path.join(DIR, 'out', `dirty_users_backup_${ts}.json`)
  fs.writeFileSync(bf, JSON.stringify(backup, null, 1))
  console.log(`✓ 已备份 ${backup.length} 条 → out/${path.basename(bf)}（gitignore，可恢复）`)
  // ① 逐条精确删
  let n = 0
  for (const id of TARGETS) {
    const d = await del(tk, `db.collection("users").where({_id:"${id}"}).remove()`)
    console.log(`  删 users/${id}: deleted=${d}`)
    n += d || 0
  }
  console.log(`完成，共删 ${n} 条脏 users 文档（守卫已确认缺 _openid 才删；现役成员真档案未触碰）。`)
})().catch((e) => { console.error('' + e.message); process.exit(1) })
