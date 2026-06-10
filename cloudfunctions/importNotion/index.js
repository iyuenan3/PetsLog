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

  // 2) 写 pets
  for (const p of pets) {
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
        latest_weight: null,
        latest_weight_date: '',
        created_at: now,
      },
    })
  }

  // 3) 写 records（自定义 _id，便于附件 key 对应；attachments 已挂 fileID）
  for (const r of records) {
    const atts = r.attachments || []
    // created_at 由事件日期派生：主时间线缺省按 created_at 倒序，若全用 now 则历史记录同值乱序 + limit 50 截断不可见。
    // 用 time 的毫秒数让历史按事件日期排；缺日期回退 now（同日内不要求二级稳定，足够）。
    const ts = Date.parse((r.time || '') + 'T00:00:00+08:00')
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
        tag: r.tag || '',
        desc: r.desc || '',
        raw: r.raw || '',
        attachments: atts,
        att_count: atts.length,
        created_at: Number.isFinite(ts) ? ts : now,
        imported: true,
      },
    })
  }

  // 4) 写 foods
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
    return { ok: false, msg: 'unknown action: ' + action }
  } catch (e) {
    return { ok: false, code: e.code || 'ERR', msg: e.msg || String((e && e.message) || e) }
  }
}
