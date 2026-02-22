'use strict';

/**
 * 新增宠物
 * 入参：family_id, user_id；以及宠物字段：name, breed, avatar?, birthday?, home_date?, initial_price?, intro?, medical_history?, remark?
 * 创建时 status 固定为 normal
 */
async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId, name, breed, avatar, birthday, home_date, initial_price, intro, medical_history, remark } = event || {};

  if (!familyId || !userId) return { code: 'INVALID_PARAMS', message: '缺少 family_id 或 user_id' };
  if (!name || !String(name).trim()) return { code: 'INVALID_PARAMS', message: '请填写宠物姓名' };
  if (!breed || !String(breed).trim()) return { code: 'INVALID_PARAMS', message: '请填写品种' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权在该家庭下添加宠物' };

  const now = Date.now();
  const doc = {
    family_id: familyId,
    name: String(name).trim(),
    breed: String(breed).trim(),
    status: 'normal',
    created_at: now,
    updated_at: now
  };
  if (avatar != null) doc.avatar = avatar;
  if (birthday != null) doc.birthday = birthday;
  if (home_date != null) doc.home_date = home_date;
  if (initial_price != null) doc.initial_price = Number(initial_price) || 0;
  if (intro != null) doc.intro = String(intro);
  if (medical_history != null) doc.medical_history = String(medical_history);
  if (remark != null) doc.remark = String(remark);

  const res = await db.collection('pet').add(doc);
  return { code: 0, data: { _id: res.id, ...doc } };
};
