// 微信云开发 live DB 只读导出（服务端 HTTP API：cgi-bin/token + tcb/databasequery）。
// 用途：把库内现况逐集合导出到 out/<coll>.json，供与 Notion 逐条核对。只读，不写库。
// 安全：AppSecret 只从 gitignore 的 config.local.json 读，绝不回显；token 不打印；out/ 已 gitignore。
// 直连：Node 全局 fetch(undici) 默认不走 http_proxy，天然直连（WeChat 端点在国内，直连可达）。
// 跑法：node tools/wxdump/dump.mjs   或   node tools/wxdump/dump.mjs pets,records,foods
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(DIR, 'out')
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.local.json'), 'utf8'))
const COLLS = (process.argv[2] || 'pets,records,foods').split(',').map((s) => s.trim()).filter(Boolean)
const PAGE = 100

if (!cfg.secret || /在这里填|AppSecret（/.test(cfg.secret)) {
  console.error('✗ 还没填 AppSecret：编辑 tools/wxdump/config.local.json 的 "secret" 字段（别贴给我）。')
  process.exit(2)
}

async function getToken() {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(cfg.appid)}&secret=${encodeURIComponent(cfg.secret)}`
  const r = await fetch(url).then((x) => x.json())
  if (!r.access_token) throw new Error(`换 token 失败 errcode=${r.errcode} errmsg=${r.errmsg}（40125=密钥错 / 40164=IP 未白名单 / 89503=需配 IP 白名单）`)
  return r.access_token
}

async function queryColl(token, coll) {
  const out = []
  let skip = 0
  for (;;) {
    const body = { env: cfg.env, query: `db.collection("${coll}").skip(${skip}).limit(${PAGE}).get()` }
    const r = await fetch(`https://api.weixin.qq.com/tcb/databasequery?access_token=${token}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((x) => x.json())
    if (r.errcode) throw new Error(`databasequery ${coll} 失败 errcode=${r.errcode} errmsg=${r.errmsg}`)
    const rows = (r.data || []).map((s) => JSON.parse(s))
    out.push(...rows)
    const total = (r.pager && (r.pager.Total ?? r.pager.total)) || 0
    if (rows.length < PAGE || out.length >= total) break
    skip += PAGE
  }
  return out
}

;(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  const token = await getToken()
  console.log('✓ access_token 取得（不回显）')
  for (const coll of COLLS) {
    const rows = await queryColl(token, coll)
    fs.writeFileSync(path.join(OUT, `${coll}.json`), JSON.stringify(rows, null, 1))
    // family_id 分布（确认是否只你一家、有无测试残留），不回显任何名字/内容
    const fams = {}
    for (const x of rows) { const f = x.family_id || '(无)'; fams[f] = (fams[f] || 0) + 1 }
    console.log(`✓ ${coll}: ${rows.length} 条 → out/${coll}.json   family_id 分布: ${JSON.stringify(fams)}`)
  }
  console.log('完成。out/ 已 gitignore，含真实数据仅本地。')
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1) })
