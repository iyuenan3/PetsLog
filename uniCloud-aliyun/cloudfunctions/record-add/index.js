'use strict';

const EVENT_TYPES = ['vomit', 'diarrhea', 'blood_stool', 'clinic', 'weigh', 'deworm', 'neuter', 'vaccine', 'other'];
const MAX_ATTACHMENTS = 5;

/**
 * 解析 "YYYY-MM-DD HH:mm" 为北京时间时间戳（毫秒）
 */
function parseDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return Date.now();
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  const d2 = new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0, 0, 0);
  return d2.getTime();
}

async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const {
    family_id: familyId,
    user_id: userId,
    pet_ids: petIds,
    event_type: eventType,
    date,
    time,
    event_desc: eventDesc,
    weight,
    medicine,
    hospital,
    cost,
    attachments
  } = event || {};

  if (!familyId || !userId) return { code: 'INVALID_PARAMS', message: '缺少 family_id 或 user_id' };
  if (!Array.isArray(petIds) || petIds.length === 0) return { code: 'INVALID_PARAMS', message: '请至少选择一只宠物' };
  if (!EVENT_TYPES.includes(eventType)) return { code: 'INVALID_PARAMS', message: '事件类型不合法' };
  if (!date || !time) return { code: 'INVALID_PARAMS', message: '请选择日期和时间' };
  if (eventType === 'other' && (!eventDesc || !String(eventDesc).trim())) return { code: 'INVALID_PARAMS', message: '事件类型为「其他」时请填写事件描述' };
  if (eventType === 'weigh' && (weight == null || weight === '')) return { code: 'INVALID_PARAMS', message: '事件类型为「称重」时请填写体重' };
  if (Array.isArray(attachments) && attachments.length > MAX_ATTACHMENTS) return { code: 'INVALID_PARAMS', message: `附件最多 ${MAX_ATTACHMENTS} 个` };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权在该家庭下添加记录' };

  const now = Date.now();
  const datetime = parseDateTime(date, time);

  const rows = petIds.map(petId => ({
    family_id: familyId,
    pet_id: petId,
    event_type: eventType,
    date,
    time,
    datetime,
    event_desc: eventDesc != null ? String(eventDesc).trim() : '',
    weight: weight != null && weight !== '' ? Number(weight) : undefined,
    medicine: medicine != null ? String(medicine) : '',
    hospital: hospital != null ? String(hospital) : '',
    cost: cost != null && cost !== '' ? Math.round(Number(cost)) : undefined,
    attachments: Array.isArray(attachments) ? attachments.slice(0, MAX_ATTACHMENTS) : [],
    created_at: now,
    updated_at: now,
    created_by: userId
  }));

  const res = await db.collection('record').add(rows);
  const ids = res.ids || (res.id ? [res.id] : []);
  return { code: 0, data: { count: rows.length, ids } };
};
