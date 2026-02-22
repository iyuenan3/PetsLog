'use strict';

/**
 * 更新宠物（含修改状态为去世/离家，不允许物理删除）
 * 入参：family_id, user_id, pet_id；以及要更新的字段（name, breed, avatar, birthday, home_date, initial_price, intro, medical_history, remark, status）
 */
async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { family_id: familyId, user_id: userId, pet_id: petId, name, breed, avatar, birthday, home_date, initial_price, intro, medical_history, remark, status } = event || {};

  if (!familyId || !userId || !petId) return { code: 'INVALID_PARAMS', message: '缺少 family_id、user_id 或 pet_id' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权操作该家庭下的宠物' };

  const petSnap = await db.collection('pet').doc(petId).get();
  if (!petSnap.data || petSnap.data.length === 0) return { code: 'NOT_FOUND', message: '宠物不存在' };
  const pet = petSnap.data[0];
  if (pet.family_id !== familyId) return { code: 'FORBIDDEN', message: '宠物不属于该家庭' };

  const allow = ['name', 'breed', 'avatar', 'birthday', 'home_date', 'initial_price', 'intro', 'medical_history', 'remark', 'status'];
  const update = { updated_at: Date.now() };
  if (name !== undefined) update.name = String(name).trim();
  if (breed !== undefined) update.breed = String(breed).trim();
  if (avatar !== undefined) update.avatar = avatar;
  if (birthday !== undefined) update.birthday = birthday;
  if (home_date !== undefined) update.home_date = home_date;
  if (initial_price !== undefined) update.initial_price = Number(initial_price) || 0;
  if (intro !== undefined) update.intro = String(intro);
  if (medical_history !== undefined) update.medical_history = String(medical_history);
  if (remark !== undefined) update.remark = String(remark);
  if (status !== undefined) {
    if (!['normal', 'passed', 'left'].includes(status)) return { code: 'INVALID_PARAMS', message: 'status 只能为 normal / passed / left' };
    update.status = status;
  }

  await db.collection('pet').doc(petId).update(update);
  return { code: 0, data: { _id: petId, ...update } };
};
