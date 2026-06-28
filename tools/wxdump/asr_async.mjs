// 探针：服务端 wxa/servicemarket 显式异步（async:true）invoke → 取回 request_id → servicemarketretrieve。
// 验「异步是否绕过同步 invoke 时的 9301002」+「异步结果是否可取（=服务其实活的、只是异步）」。
// AppSecret 运行时从 config.local.json（gitignore）读，绝不入脚本/输出。
// 跑法：node tools/wxdump/asr_async.mjs [本地wav]
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.local.json'), 'utf8'))
const SERVICE = 'wxa8386175898e12c9'
const API = 'SentenceASR'
const LOCAL = process.argv[2] || '/tmp/asr_probe.wav'

async function token() {
  const r = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credential', appid: cfg.appid, secret: cfg.secret, force_refresh: false }),
  }).then((x) => x.json())
  if (!r.access_token) throw new Error(`换 token 失败 ${r.errcode} ${r.errmsg}`)
  return r.access_token
}
const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((x) => x.json())

;(async () => {
  const buf = fs.readFileSync(LOCAL)
  const tk = await token()
  const key = Date.now()
  const inv = await post(`https://api.weixin.qq.com/wxa/servicemarket?access_token=${tk}`, {
    service: SERVICE, api: API, client_msg_id: key, async: true,
    data: { Action: 'SentenceRecognitionWX', EngSerViceType: '16k_zh', VoiceFormat: 'wav', UsrAudioKey: key, SourceType: 1, Data: buf.toString('base64'), DataLen: buf.length },
  })
  console.log('async invoke →', JSON.stringify(inv))
  const reqId = inv.request_id || inv.requestId
  if (inv.errcode || !reqId) { console.log('未拿到 request_id，异步 invoke 本身就失败，停。'); return }

  // 多次 retrieve（网络往返自带间隔；errcode 9301013=结果未就绪则续取）
  for (let i = 0; i < 6; i++) {
    const r = await post(`https://api.weixin.qq.com/wxa/servicemarketretrieve?access_token=${tk}`, { request_id: reqId })
    console.log(`retrieve #${i} →`, JSON.stringify(r))
    if (r && typeof r.data === 'string' && r.data) { try { console.log('  ↳ 内层 data：', JSON.stringify(JSON.parse(r.data))) } catch (_) {} }
    if (!r.errcode && r.data) break // 取到结果
    if (r.errcode && r.errcode !== 9301013) break // 非「未就绪」的硬错，停
  }
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1) })
