'use strict';

async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId, staple_food_id: stapleFoodId } = event || {};

  if (!familyId || !userId || !stapleFoodId) return { code: 'INVALID_PARAMS', message: '缺少 family_id、user_id 或 staple_food_id' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权操作' };

  const snap = await db.collection('staple_food').doc(stapleFoodId).get();
  if (!snap.data || snap.data.length === 0) return { code: 'NOT_FOUND', message: '主粮记录不存在' };
  if (snap.data[0].family_id !== familyId) return { code: 'FORBIDDEN', message: '记录不属于该家庭' };

  await db.collection('staple_food').doc(stapleFoodId).remove();
  return { code: 0, data: { removed: true } };
};
