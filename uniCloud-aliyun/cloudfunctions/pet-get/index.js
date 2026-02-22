'use strict';

/**
 * 获取单只宠物详情
 * 入参：family_id, user_id, pet_id
 */
async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId, pet_id: petId } = event || {};

  if (!familyId || !userId || !petId) return { code: 'INVALID_PARAMS', message: '缺少 family_id、user_id 或 pet_id' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权查看该家庭' };

  const res = await db.collection('pet').doc(petId).get();
  if (!res.data || res.data.length === 0) return { code: 'NOT_FOUND', message: '宠物不存在' };
  const pet = res.data[0];
  if (pet.family_id !== familyId) return { code: 'FORBIDDEN', message: '宠物不属于该家庭' };

  return { code: 0, data: pet };
};
