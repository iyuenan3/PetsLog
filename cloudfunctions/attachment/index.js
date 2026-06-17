const cloud = require('wx-server-sdk')
const https = require('https')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 健康记录附件（见 ADR-011）。action: register | remove | deleteRecord
// 安全核心：客户端传入的 fileID / record_id 一律不可信。删除 / 读取能力绝不能被客户端参数直接驱动，
// 否则任一成员可传别家 fileID 借本函数删 / 读别家文件（对抗评审 high）。两道闸：
//   ① record_id 必须经 getOwnedRecord 证明属本家庭；
//   ② 每个 fileID 必须落在 att/<record_id>/ 上传路径下（见 src/attachments.js），把文件归属锚定到已验证的记录。
// 在两道闸都过之前，绝不调用 deleteFiles（防回滚路径删掉受害者文件）。
const TYPES = ['image', 'video', 'pdf']
const PER_RECORD_MAX = 9 // 单条记录附件数上限
const FAMILY_BYTES_MAX = 1024 * 1024 * 1024 // 家庭总存储 ≤1GB
const DAILY_BYTES_MAX = 200 * 1024 * 1024 // 速度护栏 ≤200MB/天/家庭
// 单文件上限（服务端按真实体积复核；图片端侧已压缩、视频走 compressed ≤30s、PDF 压不了只能限体积）
const FILE_BYTES_MAX = { image: 10 * 1024 * 1024, video: 30 * 1024 * 1024, pdf: 10 * 1024 * 1024 }

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

let dbReady = false
async function ensureCollections() {
  if (dbReady) return
  try {
    await db.createCollection('att_log') // 日上传量流水（family_id + day，复用 parse_log 限流模式）
  } catch (e) {
    /* 已存在忽略 */
  }
  dbReady = true
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const familyId = event && event.family_id
  const action = (event && event.action) || ''
  try {
    await assertMember(OPENID, familyId)
  } catch (e) {
    return { ok: false, code: e.code || 'AUTH', msg: e.msg || '无权限' }
  }
  await ensureCollections()
  try {
    if (action === 'register') return await register(familyId, event)
    if (action === 'remove') return await removeOne(familyId, event)
    if (action === 'deleteRecord') return await deleteRecord(familyId, event)
    return { ok: false, msg: 'unknown action: ' + action }
  } catch (e) {
    return { ok: false, code: e.code || 'ERR', msg: e.msg || String((e && e.message) || e) }
  }
}

// 取家庭内记录，防跨家庭操作（record_id 由客户端传入、可伪造）
async function getOwnedRecord(familyId, id) {
  if (!id) throw { code: 'NO_ID', msg: '缺少记录 id' }
  const r = await db.collection('records').doc(id).get().catch(() => null)
  if (!r || !r.data || r.data.family_id !== familyId) throw { code: 'NOT_FOUND', msg: '记录不存在' }
  return r.data
}

// 云存储真实体积：getTempFileURL 拿 CDN 地址后 HEAD 读 content-length。
// 任一文件取不到体积按失败处理（宁可拒绝，不放过配额）。
function headSize(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'HEAD', timeout: 5000 },
      (res) => {
        res.resume()
        const len = Number(res.headers['content-length'])
        if (res.statusCode >= 200 && res.statusCode < 300 && Number.isFinite(len)) resolve(len)
        else reject(new Error(`head ${res.statusCode} len=${res.headers['content-length']}`))
      }
    )
    req.on('timeout', () => req.destroy(new Error('head timeout')))
    req.on('error', reject)
    req.end()
  })
}

// 并行 HEAD（最多 18 个文件）：串行会把耗时叠到 18×超时，逼近 / 超过云函数超时被硬杀（评审 medium）。
async function realSizes(fileIDs) {
  const res = await cloud.getTempFileURL({ fileList: fileIDs }) // 单次上限 50；附件场景一次 ≤9*2，单批足够
  const sizes = {}
  await Promise.all(
    res.fileList.map(async (f) => {
      if (f.status !== 0 || !f.tempFileURL) throw { code: 'FILE_GONE', msg: '附件文件读取失败' }
      sizes[f.fileID] = await headSize(f.tempFileURL)
    })
  )
  return sizes
}

async function deleteFiles(fileIDs) {
  const ids = fileIDs.filter(Boolean)
  for (let i = 0; i < ids.length; i += 50) {
    await cloud.deleteFile({ fileList: ids.slice(i, i + 50) }).catch(() => {}) // 清理尽力而为，失败不阻断主流程
  }
}

// 北京时区当天（云函数为 UTC）
function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const z = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`
}

// 当日已用上传量：分页求和（单次 get 上限 1000，海量小文件下不分页会截断 → 日护栏被绕过，评审 low）
async function dailyUsedBytes(familyId, day) {
  let total = 0
  for (let skip = 0; ; skip += 100) {
    const r = await db.collection('att_log').where({ family_id: familyId, day }).skip(skip).limit(100).get()
    total += r.data.reduce((s, x) => s + (Number(x.bytes) || 0), 0)
    if (r.data.length < 100) break
  }
  return total
}

// 登记附件：客户端已 uploadFile 完，传 record_id + files[{fileID,thumb,type,name,size}]。
// 服务端复核通过才挂到记录；任何一步不过 → 删光本次上传的文件回滚。
async function register(familyId, event) {
  const files = Array.isArray(event.files) ? event.files : []
  const recordId = event.record_id

  // ===== 闸门（在此之前绝不 deleteFiles：传入 fileID 尚未证明归属，删了可能是受害者文件）=====
  if (!files.length) return { ok: false, code: 'EMPTY', msg: '没有附件' }
  if (!recordId) return { ok: false, code: 'NO_ID', msg: '缺少记录 id' }
  if (files.length > PER_RECORD_MAX) return { ok: false, code: 'TOO_MANY', msg: `一次最多 ${PER_RECORD_MAX} 个附件` }
  const seg = '/att/' + recordId + '/' // 合法上传路径前缀（src/attachments.js）；把 fileID 归属锚到本记录
  for (const f of files) {
    if (!f || !f.fileID || !TYPES.includes(f.type)) return { ok: false, code: 'BAD_FILE', msg: '附件参数不合法' }
    if (f.fileID.indexOf(seg) < 0 || (f.thumb && f.thumb.indexOf(seg) < 0)) {
      return { ok: false, code: 'BAD_PATH', msg: '附件路径非法' } // 不删：可能是别家 fileID
    }
  }
  let rec
  try {
    rec = await getOwnedRecord(familyId, recordId)
  } catch (e) {
    return { ok: false, code: e.code, msg: e.msg } // 不删：record_id 非本家庭，传入 fileID 不可信
  }

  // ===== 至此 record_id 属本家庭、全部 fileID 落在 att/<record_id>/ 下 → 这些文件可安全回滚删除 =====
  const uploaded = files.flatMap((f) => [f.fileID, f.thumb]).filter(Boolean)
  const fail = async (code, msg) => {
    await deleteFiles(uploaded)
    return { ok: false, code, msg }
  }

  const existing = Array.isArray(rec.attachments) ? rec.attachments : []
  if (existing.length + files.length > PER_RECORD_MAX) {
    return fail('TOO_MANY', `单条记录最多 ${PER_RECORD_MAX} 个附件（已有 ${existing.length} 个）`)
  }

  // 真实体积复核（主文件 + 缩略图都计入配额）
  let sizes
  try {
    sizes = await realSizes(uploaded)
  } catch (e) {
    return fail(e.code || 'SIZE_CHECK', e.msg || '附件体积校验失败')
  }
  let newBytes = 0
  for (const f of files) {
    const main = sizes[f.fileID]
    if (main > FILE_BYTES_MAX[f.type]) {
      return fail('FILE_TOO_BIG', `${f.type === 'pdf' ? 'PDF' : f.type === 'video' ? '视频' : '图片'}不能超过 ${Math.round(FILE_BYTES_MAX[f.type] / 1024 / 1024)}MB`)
    }
    f._bytes = main + (f.thumb ? sizes[f.thumb] : 0)
    f._size = main
    newBytes += f._bytes
  }

  // 家庭总量 + 当日速度护栏。check-then-inc 非完全原子，但 _.inc 原子使并发超额有界（共享免费档内测可接受，见 ADR-011 tradeoff）
  const fam = await db.collection('families').doc(familyId).get().catch(() => null)
  if (!fam || !fam.data) return fail('NO_FAMILY', '家庭不存在')
  const used = Number(fam.data.storage_bytes) || 0
  if (used + newBytes > FAMILY_BYTES_MAX) return fail('STORAGE_FULL', '家庭存储空间已满（上限 1GB），请先清理旧附件')
  const day = todayStr()
  const dayUsed = await dailyUsedBytes(familyId, day)
  if (dayUsed + newBytes > DAILY_BYTES_MAX) return fail('DAILY_LIMIT', '今日上传流量已达上限（200MB），明天再传吧')

  const now = Date.now()
  const items = files.map((f) => ({
    fileID: f.fileID,
    thumb: f.thumb || '',
    type: f.type,
    name: String(f.name || '').slice(0, 80),
    size: f._size, // 主文件真实体积（展示用）
    bytes: f._bytes, // 计入配额的总体积（主文件 + 缩略图），删除时按它回收
    uploaded_at: now,
  }))
  // 原子追加：_.push 而非整组覆盖，避免并发 register/remove 互相丢更新（last-write-wins 致孤儿文件 + 配额漂移，评审 high）
  const upd = await db.collection('records').doc(rec._id).update({
    data: { attachments: _.push(items), att_count: _.inc(items.length) },
  })
  // 体积复核期间记录被并发 deleteRecord 删掉 → update 命中已删文档为 no-op(updated:0)，回滚删文件、不计配额（评审 medium）
  if (!upd.stats || upd.stats.updated < 1) return fail('RECORD_GONE', '记录已被删除')
  await db.collection('families').doc(familyId).update({ data: { storage_bytes: _.inc(newBytes) } })
  await db.collection('att_log').add({ data: { family_id: familyId, day, bytes: newBytes, at: now } })
  return { ok: true, attachments: existing.concat(items), added_bytes: newBytes } // attachments 为乐观值，客户端 onShow 会重载校正
}

// 删单个附件：先写库摘除（原子 pull）再删文件 → 即便删文件失败也只剩存储孤儿，不留 DB 死链
async function removeOne(familyId, event) {
  const rec = await getOwnedRecord(familyId, event.record_id)
  const list = Array.isArray(rec.attachments) ? rec.attachments : []
  const target = list.find((a) => a.fileID === event.fileID)
  if (!target) return { ok: false, code: 'NOT_FOUND', msg: '附件不存在' }
  await db.collection('records').doc(rec._id).update({
    data: { attachments: _.pull({ fileID: event.fileID }), att_count: _.inc(-1) },
  })
  await db.collection('families').doc(familyId).update({ data: { storage_bytes: _.inc(-(Number(target.bytes) || 0)) } })
  await deleteFiles([target.fileID, target.thumb])
  return { ok: true, attachments: list.filter((a) => a.fileID !== event.fileID) }
}

// 删整条记录：先删文档 + 回收配额，文件放最后删（删文件失败只剩存储孤儿，不留 DB 死链）；并回写宠物最新体重
async function deleteRecord(familyId, event) {
  const rec = await getOwnedRecord(familyId, event.record_id)
  const list = Array.isArray(rec.attachments) ? rec.attachments : []
  const bytes = list.reduce((s, a) => s + (Number(a.bytes) || 0), 0)
  await db.collection('records').doc(rec._id).remove()
  if (bytes) await db.collection('families').doc(familyId).update({ data: { storage_bytes: _.inc(-bytes) } })
  await deleteFiles(list.flatMap((a) => [a.fileID, a.thumb]))
  await recomputeLatestWeight(familyId, rec) // 删的若是该宠最新体重记录，重算档案体重（与 saveRecord 写侧不变量对称，评审 medium 回归）
  if (rec.weight) await recomputeWeightSpark(familyId, rec.pet) // 方案 b（ADR-025）：删带体重记录后重算趋势点，防 weight_spark 留幽灵点
  return { ok: true }
}

// 删记录后维护 pets.weight_spark 不变量（方案 b，ADR-025）：删掉带体重的记录后从剩余记录重算近 12 点（与 saveRecord 写侧对称）。
async function recomputeWeightSpark(familyId, petName) {
  if (!petName) return
  const pr = await db.collection('pets').where({ family_id: familyId, name: petName }).limit(1).get().catch(() => ({ data: [] }))
  const p = pr.data[0]
  if (!p) return
  const wr = await db
    .collection('records')
    .where({ family_id: familyId, pet: petName, weight: _.gt(0) })
    .orderBy('time', 'desc')
    .limit(12)
    .get()
    .catch(() => ({ data: [] }))
  const spark = wr.data.map((x) => x.weight).reverse()
  await db.collection('pets').doc(p._id).update({ data: { weight_spark: spark } }).catch(() => {})
}

// 删记录后维护 pets.latest_weight 不变量：仅当删掉的正是该宠当前「最新体重」记录时，从剩余记录重算
async function recomputeLatestWeight(familyId, rec) {
  if (!rec || !rec.weight || !rec.pet) return
  const pr = await db.collection('pets').where({ family_id: familyId, name: rec.pet }).limit(1).get().catch(() => ({ data: [] }))
  const p = pr.data[0]
  if (!p || p.latest_weight_date !== rec.time) return // 删的不是最新体重记录，档案无需动
  const wr = await db
    .collection('records')
    .where({ family_id: familyId, pet: rec.pet, weight: _.gt(0) })
    .orderBy('time', 'desc')
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))
  const latest = wr.data[0]
  await db
    .collection('pets')
    .doc(p._id)
    .update({ data: latest ? { latest_weight: latest.weight, latest_weight_date: latest.time || '' } : { latest_weight: null, latest_weight_date: '' } })
    .catch(() => {})
}
