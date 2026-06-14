const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 一次性历史数据导入（轮3，见 ADR-012/013/014）。action: clear | import
// 安全：按家庭名 + 调用者管理员身份解析 family_id（只动你 admin 的家庭）；data.json 与本函数一起部署到私有云端（gitignore 不入公开仓）。
// 附件：照片/PDF 已由 wxcloud storage:upload 预传到 COS key att/<recordId>/<name>；本函数探针拿 cloud:// 前缀拼成 fileID 并逐个验证。

async function resolveFamily(openid, familyName) {
  if (!familyName) throw { code: 'NO_NAME', msg: '缺少家庭名' }
  // 调用者所属家庭里名字匹配且本人是管理员的那个
  const ms = await db.collection('family_members').where({ openid, role: 'admin' }).get()
  const ids = ms.data.map((m) => m.family_id)
  if (!ids.length) throw { code: 'NOT_ADMIN', msg: '你不是任何家庭的管理员' }
  const fs = await db.collection('families').where({ _id: _.in(ids), name: familyName }).get()
  if (!fs.data.length) throw { code: 'NOT_FOUND', msg: `没找到你管理的家庭「${familyName}」` }
  if (fs.data.length > 1) throw { code: 'AMBIGUOUS', msg: `你有多个叫「${familyName}」的家庭，无法确定` }
  return fs.data[0]._id
}

async function deleteFiles(fileIDs) {
  const ids = fileIDs.filter(Boolean)
  for (let i = 0; i < ids.length; i += 50) {
    await cloud.deleteFile({ fileList: ids.slice(i, i + 50) }).catch(() => {})
  }
}

// 收集家庭名下全部云存储 fileID（records 附件分页 + 宠物头像），用于 clear 级联删
async function collectFileIDs(fid) {
  const ids = []
  for (let skip = 0; ; skip += 100) {
    const r = await db.collection('records').where({ family_id: fid }).field({ attachments: true }).skip(skip).limit(100).get().catch(() => ({ data: [] }))
    for (const rec of r.data) for (const a of rec.attachments || []) ids.push(a.fileID, a.thumb)
    if (r.data.length < 100) break
  }
  for (let skip = 0; ; skip += 100) {
    const ps = await db.collection('pets').where({ family_id: fid }).field({ avatar: true }).skip(skip).limit(100).get().catch(() => ({ data: [] }))
    for (const p of ps.data) ids.push(p.avatar)
    if (ps.data.length < 100) break
  }
  return ids.filter(Boolean)
}

async function removeAll(coll, fid) {
  let n = 0
  // 单次 remove 上限 100，循环删尽
  for (;;) {
    const r = await db.collection(coll).where({ family_id: fid }).limit(100).get().catch(() => ({ data: [] }))
    if (!r.data.length) break
    for (const d of r.data) {
      await db.collection(coll).doc(d._id).remove().catch(() => {})
      n++
    }
    if (r.data.length < 100) break
  }
  return n
}

// 清空家庭业务数据（保留家庭 + 成员），并删云存储文件、归零 storage_bytes
async function clear(fid) {
  await deleteFiles(await collectFileIDs(fid))
  const counts = {}
  // att_log 一并清（家庭隔离流水，对齐 cascadeDeleteFamily），否则 clear 后留孤儿行
  for (const c of ['records', 'pets', 'meds', 'reminders', 'foods', 'att_log']) counts[c] = await removeAll(c, fid)
  await db.collection('families').doc(fid).update({ data: { storage_bytes: 0 } }).catch(() => {})
  return counts
}

// 探针上传 1 字节 → 拿 cloud://<env>.<bucket>/ 前缀；删探针
async function fileIDPrefix() {
  const probeKey = 'att/_probe/' + Date.now() + '.txt'
  const up = await cloud.uploadFile({ cloudPath: probeKey, fileContent: Buffer.from('x') })
  const fid = up.fileID
  const prefix = fid.slice(0, fid.length - probeKey.length) // 去掉 key 部分，剩 cloud://env.bucket/
  await cloud.deleteFile({ fileList: [fid] }).catch(() => {})
  return prefix
}

// 批量验证 fileID 可解析（getTempFileURL status==0），返回坏链列表
async function verifyFileIDs(fileIDs) {
  const bad = []
  for (let i = 0; i < fileIDs.length; i += 50) {
    const batch = fileIDs.slice(i, i + 50)
    const res = await cloud.getTempFileURL({ fileList: batch })
    for (const f of res.fileList) if (f.status !== 0) bad.push(f.fileID)
  }
  return bad
}

async function importData(fid) {
  // 幂等护栏：import 非事务、records 用确定性 _id，未先 clear 直接重跑会写重复 pets + records 撞 dup _id 中途崩、留脏数据。
  // 入口强制目标家庭为空（pets + records 均无），否则要求先跑 clear。
  const pc = await db.collection('pets').where({ family_id: fid }).limit(1).get().catch(() => ({ data: [] }))
  const rc = await db.collection('records').where({ family_id: fid }).limit(1).get().catch(() => ({ data: [] }))
  if (pc.data.length || rc.data.length) return { ok: false, code: 'NOT_EMPTY', msg: '该家庭已有宠物 / 记录，请先跑 clear 再 import（防重复导入产生脏数据）' }

  // 克隆后再改：require 有缓存，直接改会污染缓存模块，同容器二次 import 读到被改过的数据（key_name 已删 → fileID 拼错）
  const data = JSON.parse(JSON.stringify(require('./data.json'))) // 与函数一起部署（gitignore 不入公开仓）
  const pets = data.pets || []
  const records = data.records || []
  const foods = data.foods || []
  const now = Date.now()

  // 1) 附件 fileID：前缀探针 + 拼接 + 验证（任一坏链中止，让用户重传，不写坏数据）
  const prefix = await fileIDPrefix()
  let totalBytes = 0
  const allFileIDs = []
  for (const r of records) {
    for (const a of r.attachments || []) {
      a.fileID = prefix + 'att/' + r._id + '/' + a.key_name
      a.thumb = ''
      a.uploaded_at = now
      delete a.key_name
      totalBytes += Number(a.bytes) || 0
      allFileIDs.push(a.fileID)
    }
  }
  if (allFileIDs.length) {
    const bad = await verifyFileIDs(allFileIDs)
    if (bad.length) return { ok: false, code: 'ATT_MISSING', msg: `${bad.length} 个附件未上传或不可解析，请先跑 storage:upload`, bad: bad.slice(0, 5) }
  }

  // 2) 写 pets。latest_weight 由 records 派生（正常 app 靠 saveRecord 回写，导入须自算，否则列表显「体重未记」）
  const lw = {} // name -> { weight, date }
  for (const r of records) {
    if (typeof r.weight !== 'number' || !(r.weight > 0)) continue
    const cur = lw[r.pet], rt = String(r.time || '')
    if (!cur || rt > cur.date) lw[r.pet] = { weight: r.weight, date: rt }
  }
  for (const p of pets) {
    const w = lw[p.name] || null
    await db.collection('pets').add({
      data: {
        family_id: fid,
        name: p.name,
        species: p.species === 'dog' ? 'dog' : 'cat',
        breed: p.breed || '',
        birthday: p.birthday || '',
        home_date: p.home_date || '',
        neutered: !!p.neutered,
        allergy: p.allergy || '',
        chronic: p.chronic || '',
        note: p.note || '',
        intro: p.intro || '',
        price_base: typeof p.price_base === 'number' ? p.price_base : null,
        avatar: '',
        latest_weight: w ? w.weight : null,
        latest_weight_date: w ? w.date : '',
        created_at: now,
      },
    })
  }

  // 3) 写 records（自定义 _id，便于附件 key 对应；attachments 已挂 fileID）
  for (const r of records) {
    const atts = r.attachments || []
    // created_at 由事件日期派生：主时间线缺省按 created_at 倒序，若全用 now 则历史记录同值乱序 + limit 50 截断不可见。
    // Notion 源数据日期均不带时间（全量核对确认 is_datetime=0），按约定缺时间默认中午 12:00。
    const ts = Date.parse((r.time || '') + 'T12:00:00+08:00')
    await db.collection('records').add({
      data: {
        _id: r._id,
        family_id: fid,
        pet: r.pet || '',
        time: r.time || '',
        event_type: r.event_type || '其它',
        weight: typeof r.weight === 'number' ? r.weight : null,
        med: r.med || null,
        hospital: r.hospital || '',
        cost: typeof r.cost === 'number' ? r.cost : null,
        tag: (r.tag || '').trim(), // trim 对齐 saveRecord/parseRecord（SPEC 落库 trim），免带空格 tag 让 course 精确匹配查空
        desc: r.desc || '',
        raw: r.raw || '',
        attachments: atts,
        att_count: atts.length,
        created_at: Number.isFinite(ts) ? ts : now,
        imported: true,
      },
    })
  }

  // 4) 写 foods（foods 是轮3 新集合，云端可能尚未创建 → 先建，幂等）
  await db.createCollection('foods').catch(() => {})
  for (const f of foods) {
    await db.collection('foods').add({
      data: {
        family_id: fid,
        name: f.name,
        start_date: f.start_date || '',
        end_date: f.end_date || '',
        current: !!f.current,
        note: f.note || '',
        created_at: now,
        updated_at: now,
      },
    })
  }

  // 5) 回填 storage_bytes（clear 已归零，这里设为本次附件总量）
  if (totalBytes) await db.collection('families').doc(fid).update({ data: { storage_bytes: _.inc(totalBytes) } }).catch(() => {})

  return { ok: true, pets: pets.length, records: records.length, foods: foods.length, attachments: allFileIDs.length, bytes: totalBytes }
}

// 续传：首轮 import 写完 pets/records 后在 foods 处崩（集合未建）。此动作只补 foods + storage_bytes，
// 不动已正确写入的 pets/records/附件，避免 clear 误删 staged 附件。一次性用，带 foods 非空护栏防重复。
async function importFoodsResume(fid) {
  await db.createCollection('foods').catch(() => {})
  const fc = await db.collection('foods').where({ family_id: fid }).limit(1).get().catch(() => ({ data: [] }))
  if (fc.data.length) return { ok: false, code: 'FOODS_NOT_EMPTY', msg: 'foods 已有数据，跳过以防重复写入' }
  const data = JSON.parse(JSON.stringify(require('./data.json')))
  const foods = data.foods || []
  const records = data.records || []
  const now = Date.now()
  for (const f of foods) {
    await db.collection('foods').add({
      data: {
        family_id: fid,
        name: f.name,
        start_date: f.start_date || '',
        end_date: f.end_date || '',
        current: !!f.current,
        note: f.note || '',
        created_at: now,
        updated_at: now,
      },
    })
  }
  // 回填 storage_bytes：首轮在写 foods 前崩，没跑到回填。只在当前为 0 时设，防重复累加。
  // 前提：本工具只用于「clear 后 import 中途崩」的续传，此时家庭 storage_bytes 必为 0（clear 已归零）；
  // 若未来家庭已有正常用量则不适用（会静默跳过回填），届时应走完整 clear + import。已于 2026-06-10 执行完毕。
  let totalBytes = 0
  for (const r of records) for (const a of r.attachments || []) totalBytes += Number(a.bytes) || 0
  const fam = await db.collection('families').doc(fid).get().catch(() => null)
  if (fam && fam.data && !fam.data.storage_bytes && totalBytes) {
    await db.collection('families').doc(fid).update({ data: { storage_bytes: totalBytes } }).catch(() => {})
  }
  return { ok: true, foods: foods.length, storage_bytes: totalBytes }
}

// 回填 pets.latest_weight：导入写 pets 时置 null（正常 app 靠 saveRecord 回写，导入绕过了），
// 列表页因此全显「体重未记」。按事件日期取每只宠最近一条带体重记录，回写 latest_weight + date。一次性，幂等可重跑。
async function backfillWeight(fid) {
  const pets = (await db.collection('pets').where({ family_id: fid }).limit(1000).get().catch(() => ({ data: [] }))).data
  let updated = 0
  for (const p of pets) {
    let latest = null
    for (let skip = 0; ; skip += 100) {
      const rs = (await db.collection('records').where({ family_id: fid, pet: p.name }).field({ weight: true, time: true, created_at: true }).skip(skip).limit(100).get().catch(() => ({ data: [] }))).data
      for (const r of rs) {
        if (typeof r.weight !== 'number' || !(r.weight > 0)) continue
        const rt = String(r.time || ''), lt = latest ? String(latest.time || '') : ''
        if (!latest || rt > lt || (rt === lt && (r.created_at || 0) > (latest.created_at || 0))) latest = r
      }
      if (rs.length < 100) break
    }
    if (latest) {
      await db.collection('pets').doc(p._id).update({ data: { latest_weight: latest.weight, latest_weight_date: latest.time || '' } }).catch(() => {})
      updated++
    }
  }
  return { ok: true, pets: pets.length, updated }
}

// 一次性修复（Notion 全量核对后）：① 删无日期记录（日期必填约定；含 CSV 空行脏数据 + Notion 源头漏填日期的，
// 后者经用户确认删除，见 2026-06-11 核对）；② 导入记录 created_at 统一改为 事件日期+12:00（缺时间默认中午）。
// 只动 imported:true 的记录，不碰用户真机自己记的。幂等可重跑。
async function fixTimes(fid) {
  const all = []
  for (let skip = 0; ; skip += 100) {
    const rs = (await db.collection('records').where({ family_id: fid, imported: true }).field({ time: true, pet: true, created_at: true }).skip(skip).limit(100).get().catch(() => ({ data: [] }))).data
    all.push(...rs)
    if (rs.length < 100) break
  }
  let updated = 0, removed = 0
  for (const r of all) {
    if (!r.time) {
      await db.collection('records').doc(r._id).remove().catch(() => {})
      removed++
      continue
    }
    const ts = Date.parse((r.time || '') + 'T12:00:00+08:00')
    if (Number.isFinite(ts) && r.created_at !== ts) {
      await db.collection('records').doc(r._id).update({ data: { created_at: ts } }).catch(() => {})
      updated++
    }
  }
  return { ok: true, scanned: all.length, updated, removed }
}

// 只读校验：导入后数据体检（计数 + created_at 是否全在 12:00 + 脏记录残留），不写任何数据
async function stats(fid) {
  const out = { pets: 0, records: 0, imported: 0, foods: 0, noon: 0, emptyTime: [], emptyPet: [], offNoon: [] }
  // count 全部兜底：集合不存在（如全新环境 foods 未建）抛 -502005，体检工具不该因此整体报错
  const cnt = async (coll, where) => (await db.collection(coll).where(where).count().catch(() => ({ total: 0 }))).total
  out.pets = await cnt('pets', { family_id: fid })
  out.foods = await cnt('foods', { family_id: fid })
  out.records = await cnt('records', { family_id: fid })
  out.imported = await cnt('records', { family_id: fid, imported: true })
  for (let skip = 0; ; skip += 100) {
    const rs = (await db.collection('records').where({ family_id: fid, imported: true }).field({ time: true, pet: true, created_at: true }).skip(skip).limit(100).get().catch(() => ({ data: [] }))).data
    for (const r of rs) {
      if (!r.time) out.emptyTime.push(r._id)
      if (!r.pet) out.emptyPet.push(r._id)
      // 12:00+08:00 = 04:00 UTC → 当日毫秒余 14400000
      if (r.created_at % 86400000 === 14400000) out.noon++
      else out.offNoon.push({ id: r._id, time: r.time, created_at: r.created_at })
    }
    if (rs.length < 100) break
  }
  out.offNoon = out.offNoon.slice(0, 5)
  return { ok: true, ...out }
}

// tag 轻量治理（ADR-019）：tag 收敛为「病程线」，清掉非病程 tag —— 与 event_type 重复的（驱虫 / 疫苗 / 记录体重）、
// 可归就医桶的（体检）、已有专用字段的里程碑（到家↔home_date / 绝育↔neutered）、无意义的（未知）。
// 只动 tag 字段置空，raw / desc / 记录本身一律不碰；幂等（清完再跑 0 命中）；可逆（data.json 保留原始 tag 为恢复源，故不清它）。
// 安全：默认 dryRun 预览只计数不写，须显式传 { dryRun: false } 才真改（先验尺再动手）。
const NON_COURSE_TAGS = ['驱虫', '疫苗', '体重', '记录体重', '体检', '到家', '绝育', '未知']
async function cleanTags(fid, dryRun) {
  const byTag = {}
  const ids = []
  // 先全量扫出命中再改：dryRun 不写、非 dryRun 也是 scan 完才 update，扫描期结果集不变，skip 分页稳定
  for (let skip = 0; ; skip += 100) {
    const rs = (await db.collection('records').where({ family_id: fid, tag: _.in(NON_COURSE_TAGS) }).field({ tag: true }).skip(skip).limit(100).get().catch(() => ({ data: [] }))).data
    for (const r of rs) {
      byTag[r.tag] = (byTag[r.tag] || 0) + 1
      ids.push(r._id)
    }
    if (rs.length < 100) break
  }
  let cleared = 0
  if (!dryRun) {
    for (const id of ids) {
      await db.collection('records').doc(id).update({ data: { tag: '' } }).catch(() => {})
      cleared++
    }
  }
  return { ok: true, dryRun: !!dryRun, matched: ids.length, byTag, cleared }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const action = (event && event.action) || ''
  const familyName = (event && event.family_name) || ''
  try {
    const fid = await resolveFamily(OPENID, familyName)
    if (action === 'clear') {
      const counts = await clear(fid)
      return { ok: true, family_id: fid, cleared: counts }
    }
    if (action === 'import') {
      return await importData(fid)
    }
    if (action === 'import_foods') {
      return await importFoodsResume(fid)
    }
    if (action === 'backfill_weight') {
      return await backfillWeight(fid)
    }
    if (action === 'fix_times') {
      return await fixTimes(fid)
    }
    if (action === 'stats') {
      return await stats(fid)
    }
    if (action === 'clean_tags') {
      // 默认预览（dryRun=true）；真改须显式传 { action:'clean_tags', family_name, dryRun:false }
      return await cleanTags(fid, event.dryRun !== false)
    }
    return { ok: false, msg: 'unknown action: ' + action }
  } catch (e) {
    return { ok: false, code: e.code || 'ERR', msg: e.msg || String((e && e.message) || e) }
  }
}
