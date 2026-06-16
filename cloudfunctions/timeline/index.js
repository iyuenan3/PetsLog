const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 健康时间线（按家庭隔离），倒序。可选 event.pet 过滤单宠。
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const familyId = event && event.family_id
  try {
    await assertMember(OPENID, familyId)
  } catch (e) {
    return { ok: false, code: e.code || 'AUTH', msg: e.msg || '无权限' }
  }

  // 单条详情（记录详情页用）：按 id 取，校验属于本家庭，防跨家庭读
  if (event && event.action === 'get') {
    if (!event.id) return { ok: false, msg: 'no id' }
    const r = await db.collection('records').doc(event.id).get().catch(() => null)
    if (!r || !r.data || r.data.family_id !== familyId) return { ok: false, msg: 'not found' }
    return { ok: true, data: r.data }
  }

  // 病程标签全集（ADR-019）：去重列出该家庭所有非空 tag（治理后即病程线），分页全扫不受主时间线 50 条窗口限制，
  // 供病程视图 chip 入口（修复老病程记录被挤出前 50、chip 不显示导致进不去的 bug）。
  if (event && event.action === 'list_tags') {
    const set = new Set()
    for (let skip = 0; ; skip += 100) {
      const r = await db.collection('records').where({ family_id: familyId }).field({ tag: true }).skip(skip).limit(100).get().catch(() => ({ data: [] }))
      for (const rec of r.data) { const t = (rec.tag || '').trim(); if (t) set.add(t) }
      if (r.data.length < 100) break
    }
    return { ok: true, tags: [...set] }
  }

  // 病程完整视图（ADR-019）：按 (家庭, tag[, 宠]) 取该病程全量记录（去 50 截断），服务端顺手算概览聚合
  // （起止 / 记录数 / 已记花费 / 体重序列），一次往返拿齐列表 + 概览。病程建模为 (宠,tag)：
  // 带 pet 则单宠；不带 pet 且记录跨多宠时不混画体重曲线（weights 留空，前端给 pet 下钻），见 ADR-019 + 评审。
  if (event && event.action === 'course') {
    const tag = (event.tag || '').trim()
    if (!tag) return { ok: false, msg: 'no tag' }
    const w = { family_id: familyId, tag }
    if (event.pet) w.pet = event.pet
    // 按事件时间正序（病程从头到尾），同日按 created_at 兜底确定性；limit 远超现实病程长度
    const recs = (await db.collection('records').where(w).orderBy('time', 'asc').orderBy('created_at', 'asc').limit(500).get().catch(() => ({ data: [] }))).data
    const petSet = new Set(recs.map((r) => r.pet).filter(Boolean))
    const singlePet = petSet.size <= 1
    let costSum = 0, hasCost = false
    const weights = []
    const dates = []
    for (const r of recs) {
      if (typeof r.cost === 'number') { costSum += r.cost; hasCost = true }
      // 跨宠不混画体重（评审硬化）：仅单宠时给体重序列，多宠留空待前端按宠下钻
      if (singlePet && typeof r.weight === 'number' && r.weight > 0) weights.push({ time: r.time || '', weight: r.weight })
      const d = (r.time || '').slice(0, 10)
      if (d) dates.push(d)
    }
    dates.sort()
    return {
      ok: true,
      data: recs,
      summary: {
        tag,
        pet: event.pet || '',
        pets: [...petSet], // 该病程涉及哪几只宠：>1 = 跨宠，前端给 pet 筛选下钻
        count: recs.length,
        firstDate: dates[0] || '',
        lastDate: dates[dates.length - 1] || '',
        costSum: hasCost ? costSum : null, // 仅有 cost 记录时给数；前端注明「本病程已记花费」(口径窄于身价，ADR-019)
        weights, // 单宠体重序列，前端画静态迷你曲线（ADR-019：不复用 pet.vue 拖动 canvas）
      },
    }
  }

  const where = { family_id: familyId }
  if (event && event.pet) where.pet = event.pet
  // 默认按录入时间 created_at 倒序（主时间线 / 体重图沿用）；
  // 需按事件日期排序时传 orderField:'time'（兽医小结按事件日期由近到远，同日再按 created_at 兜底，保证确定性）。
  let q = db.collection('records').where(where)
  if (event && event.orderField === 'time') {
    q = q.orderBy('time', 'desc').orderBy('created_at', 'desc')
  } else {
    q = q.orderBy('created_at', 'desc').orderBy('_id', 'desc')
  }
  // 分页（修 backlog「主时间线 50 条无翻页」）：主时间线默认页 30、前端 onReachBottom 传 skip 续取；
  // 但显式大 limit 的调用方（pet.vue loadWeight 传 1000 取该宠全量算体重曲线 + 当前身价）必须放行，
  // 只封到云端 get 上限 1000，绝不钳到 100（否则 >100 条的宠少画体重点 + 身价少算，评审 must-fix）。
  // 默认序加 _id 兜底，保证 created_at 并列时分页不重不漏。
  const limit = Math.min(event && event.limit ? event.limit : 30, 1000)
  const skip = event && event.skip ? event.skip : 0
  const res = await q.skip(skip).limit(limit).get()
  return { ok: true, data: res.data, hasMore: res.data.length === limit }
}
