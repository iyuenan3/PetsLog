'use strict';

async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId } = event || {};

  if (!familyId || !userId) return { code: 'INVALID_PARAMS', message: '缺少 family_id 或 user_id' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权查看该家庭' };

  const res = await db.collection('staple_food').where({ family_id: familyId }).orderBy('start_date', 'desc').get();
  return { code: 0, data: res.data || [] };
};
