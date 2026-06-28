// 探针：拿 invokeService 返回的 request_id 去 wxa/servicemarketretrieve 取异步结果。
// 验「客户端返 ok+data空+requestId」是不是异步取数模式（结果可取=服务没死），还是后端异常/超时。
// AppSecret 运行时从 config.local.json（gitignore）读，绝不入脚本/输出。
// 跑法：node tools/wxdump/asr_retrieve.mjs <request_id>
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.local.json'), 'utf8'))
const REQ = process.argv[2]
const SERVICE = 'wxa8386175898e12c9'
const API = 'SentenceASR'

async function token() {
  const r = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credential', appid: cfg.appid, secret: cfg.secret, force_refresh: false }),
  }).then((x) => x.json())
  if (!r.access_token) throw new Error(`换 token 失败 ${r.errcode} ${r.errmsg}`)
  return r.access_token
}

async function retrieve(tk, body) {
  const r = await fetch(`https://api.weixin.qq.com/wxa/servicemarketretrieve?access_token=${tk}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((x) => x.json())
  return r
}

;(async () => {
  if (!REQ) throw new Error('用法：node asr_retrieve.mjs <request_id>')
  const tk = await token()
  console.log(`request_id=${REQ}`)
  for (const body of [
    { request_id: REQ },
    { service: SERVICE, api: API, request_id: REQ },
  ]) {
    console.log(`\n=== body=${JSON.stringify(Object.keys(body))} ===`)
    const r = await retrieve(tk, body)
    console.log(JSON.stringify(r))
    if (r && typeof r.data === 'string' && r.data) {
      try { console.log('  ↳ 内层 data：', JSON.stringify(JSON.parse(r.data))) } catch (_) {}
    }
  }
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1) })
