'use strict';

function daysBetween(startDateStr, endDateStr) {
  const a = new Date(startDateStr.replace(/-/g, '/'));
  const b = new Date(endDateStr.replace(/-/g, '/'));
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId, staple_food_id: stapleFoodId, brand, model, pet_ids: petIds, start_date: startDate, end_date: endDate, duration_days: durationDays } = event || {};

  if (!familyId || !userId || !stapleFoodId) return { code: 'INVALID_PARAMS', message: '缺少 family_id、user_id 或 staple_food_id' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权操作' };

  const snap = await db.collection('staple_food').doc(stapleFoodId).get();
  if (!snap.data || snap.data.length === 0) return { code: 'NOT_FOUND', message: '主粮记录不存在' };
  if (snap.data[0].family_id !== familyId) return { code: 'FORBIDDEN', message: '记录不属于该家庭' };

  const update = { updated_at: Date.now() };
  if (brand !== undefined) update.brand = String(brand).trim();
  if (model !== undefined) update.model = String(model).trim();
  if (petIds !== undefined) update.pet_ids = petIds;
  if (startDate !== undefined) update.start_date = startDate;
  if (endDate !== undefined) {
    update.end_date = endDate && String(endDate).trim() ? endDate.trim() : null;
    if (update.end_date && startDate !== undefined) update.duration_days = daysBetween(startDate, update.end_date);
    else if (update.end_date) update.duration_days = daysBetween(snap.data[0].start_date, update.end_date);
  } else if (endDate === null) {
    update.end_date = null;
    update.duration_days = undefined;
  }

  await db.collection('staple_food').doc(stapleFoodId).update(update);
  return { code: 0, data: { _id: stapleFoodId, ...update } };
};
