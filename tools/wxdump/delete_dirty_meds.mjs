// 只删 meds 集合里【缺 family_id】的孤儿条（family_id 强制前的遗留：所有 meds 查询都 where({family_id})、
// 无 family_id 的行对任何家庭都不可见，永久死数据）。对齐 delete_dirty_users.mjs 的安全三重保险：
//  ① 目标 _id 从 live 查询自动 derive（缺 family_id 者），加 >5 条上限保险（异常多则中止人工核）；
//  ② 删前逐条 get 核验「确实缺 family_id」，任一竟有 family_id 立即中止全部（防误删在用药品）；
//  ③ 删前把目标完整内容备份到 out/dirty_meds_backup_<ts>.json（gitignore，可恢复）。
// 跑法：node tools/wxdump/delete_dirty_meds.mjs          （dry-run，只报不删）
//       node tools/wxdump/delete_dirty_meds.mjs --apply  （真删）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.local.json'), 'utf8'))
const APPLY = process.argv.includes('--apply')

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
  const tk = await token()
  // live 查全量 meds，derive 缺 family_id 的孤儿
  const all = await query(tk, 'db.collection("meds").limit(100).get()')
  const TARGETS = all.filter((m) => !m.family_id).map((m) => m._id)
  if (!TARGETS.length) { console.log('无缺 family_id 的孤儿 meds，无需删。'); return }
  if (TARGETS.length > 5) throw new Error(`孤儿 meds ${TARGETS.length} 条 > 5，异常多，中止人工核。`)

  console.log(`待删 ${TARGETS.length} 条孤儿 meds（仅显名，不回显 openid/原话）：`)
  for (const m of all.filter((x) => !x.family_id)) console.log(`  meds/${m._id}  name="${m.name || ''}"  effect="${m.effect || ''}"`)

  if (!APPLY) { console.log('\n[dry-run] 未删库。确认无误后加 --apply 真删。'); return }

  // ② 守卫：删前逐条 get 确认确实缺 family_id
  const backup = []
  for (const id of TARGETS) {
    const rows = await query(tk, `db.collection("meds").where({_id:"${id}"}).limit(1).get()`)
    if (!rows.length) { console.log(`⚠ meds/${id} 已不存在，跳过`); continue }
    if (rows[0].family_id) throw new Error(`✗ 中止！meds/${id} 竟有 family_id（不是孤儿），为防误删在用药品全部中止`)
    backup.push(rows[0])
  }
  // ③ 备份
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const bf = path.join(DIR, 'out', `dirty_meds_backup_${ts}.json`)
  fs.writeFileSync(bf, JSON.stringify(backup, null, 1))
  console.log(`✓ 已备份 ${backup.length} 条 → out/${path.basename(bf)}（gitignore，可恢复）`)
  // ① 精确删
  let n = 0
  for (const id of TARGETS) {
    const d = await del(tk, `db.collection("meds").where({_id:"${id}"}).remove()`)
    console.log(`  删 meds/${id}: deleted=${d}`)
    n += d || 0
  }
  console.log(`完成，共删 ${n} 条孤儿 meds（守卫已确认缺 family_id 才删；在用药品未触碰）。`)
})().catch((e) => { console.error('' + e.message); process.exit(1) })
