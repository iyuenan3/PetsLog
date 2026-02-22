'use strict';

/**
 * 删除单条记录（硬删除）
 */
async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId, record_id: recordId } = event || {};

  if (!familyId || !userId || !recordId) return { code: 'INVALID_PARAMS', message: '缺少 family_id、user_id 或 record_id' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权操作' };

  const rec = await db.collection('record').doc(recordId).get();
  if (!rec.data || rec.data.length === 0) return { code: 'NOT_FOUND', message: '记录不存在' };
  if (rec.data[0].family_id !== familyId) return { code: 'FORBIDDEN', message: '记录不属于该家庭' };

  await db.collection('record').doc(recordId).remove();
  return { code: 0, data: { removed: true } };
};
