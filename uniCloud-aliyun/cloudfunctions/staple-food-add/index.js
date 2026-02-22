'use strict';

/**
 * 主粮记录新增
 * 入参：family_id, user_id, brand, model?, pet_ids（数组）, start_date, end_date?（空表示至今）, duration_days?（可选，有 end_date 时可传）
 */
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
  const { family_id: familyId, user_id: userId, brand, model, pet_ids: petIds, start_date: startDate, end_date: endDate, duration_days: durationDays } = event || {};

  if (!familyId || !userId) return { code: 'INVALID_PARAMS', message: '缺少 family_id 或 user_id' };
  if (!brand || !String(brand).trim()) return { code: 'INVALID_PARAMS', message: '请填写品牌' };
  if (!Array.isArray(petIds) || petIds.length === 0) return { code: 'INVALID_PARAMS', message: '请选择食用对象' };
  if (!startDate) return { code: 'INVALID_PARAMS', message: '请选择起始日期' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权在该家庭下添加主粮记录' };

  const now = Date.now();
  let duration = durationDays;
  if (endDate && (duration == null || duration === '')) duration = daysBetween(startDate, endDate);

  const doc = {
    family_id: familyId,
    brand: String(brand).trim(),
    model: model != null ? String(model).trim() : '',
    pet_ids: petIds,
    start_date: startDate,
    end_date: endDate && String(endDate).trim() ? endDate.trim() : null,
    duration_days: endDate && duration != null ? Number(duration) : undefined,
    created_at: now,
    updated_at: now
  };

  const res = await db.collection('staple_food').add(doc);
  return { code: 0, data: { _id: res.id, ...doc } };
};
