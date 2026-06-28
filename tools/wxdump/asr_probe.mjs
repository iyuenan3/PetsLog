// 探针：验证微信服务市场「语音识别 · 一句话识别」服务端网关 wxa/servicemarket。
//   token → 传云存储 → 取临时 URL → 【recognize 矩阵：多种 payload 试到通】→ 清理。
// 不进 UI / 云函数，纯服务端打通看真 Result（对比上次客户端 invokeService 的 opaque 空）。
// AppSecret 运行时从 config.local.json（gitignore）读，绝不入脚本/输出。
// 跑法：node tools/wxdump/asr_probe.mjs [本地wav]
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const DIR = path.dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(fs.readFileSync(path.join(DIR, 'config.local.json'), 'utf8'))

const SERVICE = 'wxa8386175898e12c9'
const API = 'SentenceASR'
const LOCAL = process.argv[2] || '/tmp/asr_probe.wav'
const CLOUD_PATH = `asr-probe/probe_${Date.now()}.wav`

async function token() {
  const r = await fetch('https://api.weixin.qq.com/cgi-bin/stable_token', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credential', appid: cfg.appid, secret: cfg.secret, force_refresh: false }),
  }).then((x) => x.json())
  if (!r.access_token) throw new Error(`换 token 失败 ${r.errcode} ${r.errmsg}`)
  return r.access_token
}

async function upload(tk, localPath, cloudPath) {
  const up = await fetch(`https://api.weixin.qq.com/tcb/uploadfile?access_token=${tk}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ env: cfg.env, path: cloudPath }),
  }).then((x) => x.json())
  if (up.errcode) throw new Error(`uploadfile 申请失败 ${up.errcode} ${up.errmsg}`)
  const buf = fs.readFileSync(localPath)
  const form = new FormData()
  form.append('key', cloudPath)
  form.append('Signature', up.authorization)
  form.append('x-cos-security-token', up.token)
  form.append('x-cos-meta-fileid', up.cos_file_id)
  form.append('file', new Blob([buf]), 'audio.wav')
  const cos = await fetch(up.url, { method: 'POST', body: form })
  if (cos.status !== 204 && cos.status !== 200) throw new Error(`COS 上传失败 status=${cos.status}`)
  return up.file_id
}

async function tempUrl(tk, fileId) {
  const r = await fetch(`https://api.weixin.qq.com/tcb/batchdownloadfile?access_token=${tk}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ env: cfg.env, file_list: [{ fileid: fileId, max_age: 7200 }] }),
  }).then((x) => x.json())
  if (r.errcode) throw new Error(`batchdownloadfile 失败 ${r.errcode} ${r.errmsg}`)
  const f = (r.file_list || [])[0]
  if (!f || f.status !== 0 || !f.download_url) throw new Error(`取临时 URL 失败 ${JSON.stringify(f)}`)
  return f.download_url
}

async function callGateway(tk, data) {
  const key = data.UsrAudioKey
  const body = { service: SERVICE, api: API, data, client_msg_id: key }
  const r = await fetch(`https://api.weixin.qq.com/wxa/servicemarket?access_token=${tk}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then((x) => x.json())
  return r
}

function show(label, r) {
  let inner = ''
  if (r && typeof r.data === 'string' && r.data) { try { inner = ' ↳ ' + JSON.stringify(JSON.parse(r.data)) } catch (_) { inner = ' ↳raw ' + r.data.slice(0, 200) } }
  else if (r && r.data && typeof r.data === 'object') inner = ' ↳ ' + JSON.stringify(r.data)
  console.log(`【${label}】 errcode=${r.errcode ?? 0} ${r.errcode ? r.errmsg.split('request id')[0].trim() : ''}${inner}`)
}

async function cleanup(tk, fileId) {
  return fetch(`https://api.weixin.qq.com/tcb/batchdeletefile?access_token=${tk}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ env: cfg.env, fileid_list: [fileId] }),
  }).then((x) => x.json())
}

;(async () => {
  if (!fs.existsSync(LOCAL)) throw new Error(`本地音频不存在：${LOCAL}`)
  const buf = fs.readFileSync(LOCAL)
  const tk = await token()
  console.log(`service=${SERVICE} api=${API} 音频=${LOCAL} (${buf.length}B)`)
  const fileId = await upload(tk, LOCAL, CLOUD_PATH)
  const url = await tempUrl(tk, fileId)
  // 验临时 URL 公网可达（ASR 后端要能下载）
  try { const h = await fetch(url, { method: 'HEAD' }); console.log(`临时URL HEAD=${h.status} ct=${h.headers.get('content-type')} len=${h.headers.get('content-length')}`) } catch (e) { console.log('HEAD 失败', e.message) }

  const base = { Action: 'SentenceRecognitionWX', EngSerViceType: '16k_zh', VoiceFormat: 'wav' }
  // 数字 key（对齐可跑样例；每发 +i 避免同毫秒撞值/幂等命中历史失败）
  let i = 0
  const numKey = () => Date.now() + i++
  // 头号隔离：base64 直传（SourceType=1，绕开上游回源拉 URL）+ 数字 key
  show('base64+数字key', await callGateway(tk, { ...base, UsrAudioKey: numKey(), SourceType: 1, Data: buf.toString('base64'), DataLen: buf.length }))
  // 对照：URL 原文（不 encode）+ 数字 key（看 key 类型单独是否改变结果）
  show('URL原文+数字key', await callGateway(tk, { ...base, UsrAudioKey: numKey(), SourceType: 0, Url: url }))

  const del = await cleanup(tk, fileId)
  console.log(`清理：${del.errcode ? 'errcode ' + del.errcode : 'ok'}`)
})().catch((e) => { console.error('✗ ' + e.message); process.exit(1) })
