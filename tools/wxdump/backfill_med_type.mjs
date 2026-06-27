// 存量药品类型回填（ADR-035）：给 meds 集合里【有 family_id 但缺合法 type】的行补 type（按 effect 关键词推断）。
// 为何走 wxdump 直更而非云函数 backfill_type：目标行（海乐妙）在测试家庭，跑脚本者非该家管理员、云函数 admin 守卫挡住；
// 服务端 admin HTTP API（tcb/databaseupdate）绕过家庭鉴权，是这一行的最干净回填路径。
// 安全：① 仅改有 family_id 且 type 不在枚举的行（不碰 orphan 无 family_id 行 / 已分类行）；
//       ② >20 条上限保险（异常多中止人工核）；③ 改前备份目标到 out/med_type_backup_<ts>.json（gitignore）。
// inferMedType 与 cloudfunctions/meds/index.js 同款。
// 跑法：node tools/wxdump/backfill_med_type.mjs          （dry-run，只报不改）
//       node tools/wxdump/backfill_med_type.mjs --apply  （真改）
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.local.json'), 'utf8'))
const APPLY = process.argv.includes('--apply')
const MED_TYPES = ['用药', '疫苗', '驱虫', '养护', '其它']
function inferMedType(effect) {
  const e = String(effect || '')
  if (e.includes('驱虫')) return '驱虫'
  if (e.includes('疫苗')) return '疫苗'
  if (e.includes('养护') || e.includes('护理') || e.includes('保健')) return '养护'
  return '用药'
}

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
async function upd(tk, q) {
  const r = await fetch(`https://api.weixin.qq.com/tcb/databaseupdate?access_token=${tk}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ env: cfg.env, query: q }) }).then((x) => x.json())
  if (r.errcode) throw new Error(`update 失败 ${r.errcode} ${r.errmsg}`)
  return r.modified ?? r.matched ?? 0 // tcb/databaseupdate 返 matched/modified（非 delete 的 deleted）
}

;(async () => {
  const tk = await token()
  const all = await query(tk, 'db.collection("meds").limit(100).get()')
  const targets = all.filter((m) => m.family_id && !MED_TYPES.includes(m.type))
  if (!targets.length) { console.log('无【有 family_id 且缺合法 type】的药品行，无需回填。'); return }
  if (targets.length > 20) throw new Error(`目标 ${targets.length} 条 > 20，异常多，中止人工核。`)

  console.log(`待回填 ${targets.length} 条（仅显类型，不回显原话 / openid）：`)
  for (const m of targets) console.log(`  meds/${m._id}  effect="${m.effect || ''}"  → type=${inferMedType(m.effect)}`)

  if (!APPLY) { console.log('\n[dry-run] 未改库。确认无误后加 --apply 真跑。'); return }

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  fs.writeFileSync(path.join(DIR, 'out', `med_type_backup_${ts}.json`), JSON.stringify(targets, null, 1))
  console.log(`\n✓ 已备份 ${targets.length} 条 → out/med_type_backup_${ts}.json（gitignore，可恢复）`)
  let n = 0
  for (const m of targets) {
    const t = inferMedType(m.effect)
    const u = await upd(tk, `db.collection("meds").where({_id:"${m._id}"}).update({data:{type:"${t}",updated_at:${Date.now()}}})`)
    console.log(`  改 meds/${m._id} → type=${t}: updated=${u}`)
    n += u || 0
  }
  console.log(`完成，共回填 ${n} 条（只补缺合法 type 的行，已分类 / orphan 未触碰）。`)
})().catch((e) => { console.error('' + e.message); process.exit(1) })
