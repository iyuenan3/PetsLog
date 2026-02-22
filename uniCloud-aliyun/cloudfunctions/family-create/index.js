'use strict';

/**
 * 创建家庭
 * 入参：name（家庭名称）, user_id（当前用户，MVP 由前端传入，后续可改为从 uni-id token 取）
 */
exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { name, user_id: userId } = event || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return { code: 'INVALID_PARAMS', message: '请填写家庭名称' };
  }
  if (!userId) {
    return { code: 'UNAUTHORIZED', message: '请先登录' };
  }

  const now = Date.now();
  const familyRes = await db.collection('family').add({
    name: name.trim(),
    created_by: userId,
    created_at: now
  });

  const familyId = familyRes.id;
  await db.collection('family_member').add({
    family_id: familyId,
    user_id: userId,
    joined_at: now
  });

  return {
    code: 0,
    data: { _id: familyId, name: name.trim(), created_at: now }
  };
};
