'use strict';

/**
 * 查询家庭下宠物列表
 * 入参：family_id, user_id；可选 status（不传则返回全部，传 normal 则仅正常，用于添加记录选宠）
 */
async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId, status } = event || {};

  if (!familyId || !userId) return { code: 'INVALID_PARAMS', message: '缺少 family_id 或 user_id' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权查看该家庭' };

  const where = { family_id: familyId };
  if (status === 'normal') where.status = 'normal';
  const res = await db.collection('pet').where(where).orderBy('created_at', 'desc').get();
  return { code: 0, data: res.data || [] };
};
