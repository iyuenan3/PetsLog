'use strict';

/**
 * 更新家庭名称
 * 入参：family_id, user_id, name
 */
async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId, name } = event || {};

  if (!familyId || !userId) return { code: 'INVALID_PARAMS', message: '缺少 family_id 或 user_id' };
  if (!name || typeof name !== 'string' || !name.trim()) return { code: 'INVALID_PARAMS', message: '请填写家庭名称' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权修改该家庭' };

  await db.collection('family').doc(familyId).update({ name: name.trim() });
  return { code: 0, data: { _id: familyId, name: name.trim() } };
};
