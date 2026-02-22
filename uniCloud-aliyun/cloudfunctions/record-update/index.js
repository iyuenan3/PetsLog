'use strict';

const EVENT_TYPES = ['vomit', 'diarrhea', 'blood_stool', 'clinic', 'weigh', 'deworm', 'neuter', 'vaccine', 'other'];
const MAX_ATTACHMENTS = 5;

function parseDateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return undefined;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, h || 0, min || 0, 0, 0).getTime();
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
    record_id: recordId,
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

  if (!familyId || !userId || !recordId) return { code: 'INVALID_PARAMS', message: '缺少 family_id、user_id 或 record_id' };
  if (eventType && !EVENT_TYPES.includes(eventType)) return { code: 'INVALID_PARAMS', message: '事件类型不合法' };
  if (eventType === 'other' && eventDesc != null && !String(eventDesc).trim()) return { code: 'INVALID_PARAMS', message: '事件类型为「其他」时请填写事件描述' };
  if (eventType === 'weigh' && weight != null && weight === '') return { code: 'INVALID_PARAMS', message: '事件类型为「称重」时请填写体重' };
  if (Array.isArray(attachments) && attachments.length > MAX_ATTACHMENTS) return { code: 'INVALID_PARAMS', message: `附件最多 ${MAX_ATTACHMENTS} 个` };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权操作' };

  const rec = await db.collection('record').doc(recordId).get();
  if (!rec.data || rec.data.length === 0) return { code: 'NOT_FOUND', message: '记录不存在' };
  if (rec.data[0].family_id !== familyId) return { code: 'FORBIDDEN', message: '记录不属于该家庭' };

  const update = { updated_at: Date.now() };
  if (eventType !== undefined) update.event_type = eventType;
  if (date !== undefined) update.date = date;
  if (time !== undefined) update.time = time;
  if (eventDesc !== undefined) update.event_desc = String(eventDesc).trim();
  if (weight !== undefined) update.weight = weight === '' ? undefined : Number(weight);
  if (medicine !== undefined) update.medicine = medicine;
  if (hospital !== undefined) update.hospital = hospital;
  if (cost !== undefined) update.cost = cost === '' ? undefined : Math.round(Number(cost));
  if (attachments !== undefined) update.attachments = attachments.slice(0, MAX_ATTACHMENTS);
  if (date !== undefined && time !== undefined) update.datetime = parseDateTime(date, time);

  await db.collection('record').doc(recordId).update(update);
  return { code: 0, data: { _id: recordId, ...update } };
};
