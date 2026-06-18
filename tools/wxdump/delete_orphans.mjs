// 只删 4 条「孤儿」(无 family_id 的早期测试残留)。安全三重保险:
//  ① 目标是 4 个写死的精确 _id,绝无 where 批量;
//  ② 删前逐条 get 核验「确实无 family_id」,任一有 family_id 立即中止全部(防误删真家庭数据);
//  ③ 删前把 4 条完整内容备份到 out/orphans_backup_<ts>.json(gitignore,可恢复)。
// 跑法:node tools/wxdump/delete_orphans.mjs   (读 config.local.json,不回显 token)
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.local.json'), 'utf8'))

// 4 个孤儿(本会话 dump 锁定,均无 family_id):1 个测试宠 + 3 条记录
const TARGETS = [
  { coll: 'pets', id: 'f2dd55436a258f580187f28c3ec91a92' },
  { coll: 'records', id: '881bf3f16a258f580048189932a4d54a' },
  { coll: 'records', id: '881bf3f16a259ed3004998f1684b8cf4' },
  { coll: 'records', id: 'f2dd55436a25b042018f8c7627ba2ebd' },
]

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
  // ① 逐条 get + 守卫:确认存在且无 family_id
  const backup = []
  for (const t of TARGETS) {
    const rows = await query(tk, `db.collection("${t.coll}").where({_id:"${t.id}"}).limit(1).get()`)
    if (!rows.length) { console.log(`⚠ ${t.coll}/${t.id} 已不存在,跳过`); continue }
    const doc = rows[0]
    if (doc.family_id) throw new Error(`✗ 中止!${t.coll}/${t.id} 竟有 family_id=${doc.family_id}(不是孤儿),为防误删真数据全部中止`)
    backup.push({ coll: t.coll, doc })
  }
  // ③ 备份(可恢复)
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const bf = path.join(DIR, 'out', `orphans_backup_${ts}.json`)
  fs.mkdirSync(path.join(DIR, 'out'), { recursive: true })
  fs.writeFileSync(bf, JSON.stringify(backup, null, 1))
  console.log(`✓ 已备份 ${backup.length} 条 → out/${path.basename(bf)}(gitignore,可恢复)`)
  // ② 逐条精确删
  let n = 0
  for (const t of TARGETS) {
    const d = await del(tk, `db.collection("${t.coll}").where({_id:"${t.id}"}).remove()`)
    console.log(`  删 ${t.coll}/${t.id}: deleted=${d}`)
    n += d || 0
  }
  console.log(`完成,共删 ${n} 条。家庭数据未触碰(守卫已确认无 family_id 才删)。`)
})().catch((e) => { console.error('' + e.message); process.exit(1) })
