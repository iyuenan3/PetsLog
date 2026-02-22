'use strict';

/**
 * 加入家庭（通过家庭 ID 或邀请码等，MVP 仅通过 family_id）
 * 入参：family_id, user_id（当前用户）
 */
exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId } = event || {};

  if (!familyId || !userId) {
    return { code: 'INVALID_PARAMS', message: '缺少 family_id 或 user_id' };
  }

  const exist = await db.collection('family_member')
    .where({ family_id: familyId, user_id: userId })
    .count();

  if (exist.total > 0) {
    return { code: 0, data: { joined: true }, message: '已是该家庭成员' };
  }

  await db.collection('family_member').add({
    family_id: familyId,
    user_id: userId,
    joined_at: Date.now()
  });

  return { code: 0, data: { joined: true } };
};
