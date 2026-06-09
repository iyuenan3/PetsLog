const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 事件类型受控枚举（7 桶，见 ADR-013）。前端配色 / 分类依赖，非法值落「其它」。
const EVENT_TYPES = ['症状', '用药', '疫苗', '驱虫', '体重', '就医', '其它']

// 日期归一：保证落库日期恒为定长零填充 'YYYY-MM-DD'，否则字典序排序（兽医小结按 time、提醒按 next_date）会失真。
// 已是 'YYYY-MM-DD' 原样；'2026-6-9' / '2026/6/9' 补零归一；解析不出回退 fallback。防 LLM 偶发非零填充。
function normalizeDate(v, fallback) {
  const t = String(v == null ? '' : v).trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const m = t.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})$/)
  if (m) {
    const z = (n) => String(n).padStart(2, '0')
    return `${m[1]}-${z(m[2])}-${z(m[3])}`
  }
  return fallback
}

// 费用容错：number 原样；"480" / "480元" 取数；空 / 无数字串（如「免费」「未知」）/ 非数 → null
// 注意：必须在 Number() 前判空串，否则 Number('')===0 会把无数字串错判成 0，污染「免费就诊(0)」语义
function numOrNull(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (v == null || v === '') return null
  const s = String(v).replace(/[^\d.]/g, '')
  if (s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

async function assertMember(openid, familyId) {
  if (!familyId) throw { code: 'NO_FAMILY', msg: '缺少家庭上下文' }
  const r = await db.collection('family_members').where({ family_id: familyId, openid }).limit(1).get()
  if (!r.data.length) throw { code: 'NOT_MEMBER', msg: '你不是该家庭成员' }
  return r.data[0]
}

// 用户确认后落库（按家庭隔离，见 ADR-008）：
// - kind=med_stock → 写 meds（家庭药品库存，不绑单宠）
// - kind=reminder  → 写 reminders（用药 / 疫苗 / 驱虫提醒）
// - 否则 → 写 records，并自动建宠物档案 / 回写体重
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  const familyId = event && event.family_id
  const r = event && event.record
  if (!r || r.valid === false) return { ok: false, code: 'INVALID', msg: '无效记录' }

  try {
    await assertMember(OPENID, familyId)
  } catch (e) {
    return { ok: false, code: e.code || 'AUTH', msg: e.msg || '无权限' }
  }

  // 提醒
  if (r.kind === 'reminder') {
    if (!r.rem_title && !r.pet) return { ok: false, code: 'EMPTY_REMINDER', msg: '提醒内容缺失' }
    await db.createCollection('reminders').catch(() => {}) // 幂等兜底
    const TYPES = ['用药', '疫苗', '驱虫', '其它']
    const remRes = await db.collection('reminders').add({
      data: {
        family_id: familyId,
        pet: r.pet || '',
        type: TYPES.includes(r.rem_type) ? r.rem_type : '其它',
        title: r.rem_title || '',
        next_date: normalizeDate(r.rem_date, ''),
        repeat_days: typeof r.rem_repeat_days === 'number' ? r.rem_repeat_days : Number(r.rem_repeat_days) || 0,
        note: '',
        done: false,
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    })
    return { ok: true, id: remRes._id, kind: 'reminder' }
  }

  // 药品入库
  if (r.kind === 'med_stock') {
    const name = r.med_name || r.med || ''
    if (!name) return { ok: false, code: 'NO_MED', msg: '药品名缺失' }
    const medRes = await db.collection('meds').add({
      data: {
        family_id: familyId,
        name,
        effect: r.med_effect || '',
        quantity: typeof r.med_quantity === 'number' ? r.med_quantity : Number(r.med_quantity) || 1,
        expire_date: normalizeDate(r.med_expire, ''),
        created_at: Date.now(),
      },
    })
    return { ok: true, id: medRes._id, kind: 'med_stock' }
  }

  const doc = {
    family_id: familyId,
    pet: r.pet || '',
    time: normalizeDate(r.time, ''),
    event_type: EVENT_TYPES.includes(r.event_type) ? r.event_type : '其它',
    weight: typeof r.weight === 'number' ? r.weight : null,
    med: r.med || null,
    hospital: (r.hospital || '').trim(), // 就诊医院（见 ADR-012）
    cost: numOrNull(r.cost), // 费用（元）
    tag: (r.tag || '').trim(), // 病程标签（与 event_type 双轴）；trim 防同名病程线因首尾空格散裂
    desc: (r.desc || '').trim(), // 干净事件描述（不含费用 / 医院），给兽医小结拼接用，不暴露 raw 原话
    raw: r.raw || '',
    created_at: Date.now(),
  }
  const addRes = await db.collection('records').add({ data: doc })

  // 宠物 upsert（按家庭）：新名字自动建档；已有的若带体重则更新最新体重
  let petCreated = false
  if (doc.pet) {
    const petRes = await db.collection('pets').where({ family_id: familyId, name: doc.pet }).get()
    if (petRes.data.length) {
      const p = petRes.data[0]
      // 仅当新记录日期 >= 已存最新体重日期时才回写，避免补录旧体重把「最新」覆盖回退
      if (doc.weight && (!p.latest_weight_date || (doc.time || '') >= p.latest_weight_date)) {
        await db.collection('pets').doc(p._id).update({ data: { latest_weight: doc.weight, latest_weight_date: doc.time || '' } })
      }
    } else {
      await db.collection('pets').add({
        data: {
          family_id: familyId,
          name: doc.pet,
          species: r.species === 'dog' ? 'dog' : 'cat',
          breed: '',
          birthday: '',
          neutered: false,
          allergy: '',
          chronic: '',
          latest_weight: doc.weight || null,
          latest_weight_date: doc.weight ? doc.time || '' : '',
          created_at: Date.now(),
        },
      })
      petCreated = true
    }
  }

  return { ok: true, id: addRes._id, petCreated }
}
