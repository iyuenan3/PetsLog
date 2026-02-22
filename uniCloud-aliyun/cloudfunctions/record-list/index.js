'use strict';

/**
 * 记录列表：按家庭查，可选 pet_id、日期范围、关键词；按 datetime 倒序
 * 入参：family_id, user_id；可选 pet_id, date_from, date_to, keyword（搜 event_desc/medicine/hospital）, limit, offset
 */
async function isFamilyMember(db, familyId, userId) {
  const r = await db.collection('family_member').where({ family_id: familyId, user_id: userId }).count();
  return r.total > 0;
}

exports.main = async (event, context) => {
  const db = uniCloud.database();
  const dbCmd = db.command;
  const { family_id: familyId, user_id: userId, pet_id: petId, date_from: dateFrom, date_to: dateTo, keyword, limit = 100, offset = 0 } = event || {};

  if (!familyId || !userId) return { code: 'INVALID_PARAMS', message: '缺少 family_id 或 user_id' };

  const ok = await isFamilyMember(db, familyId, userId);
  if (!ok) return { code: 'FORBIDDEN', message: '无权查看该家庭' };

  const where = { family_id: familyId };
  if (petId) where.pet_id = petId;
  if (dateFrom || dateTo) {
    const conds = [];
    if (dateFrom) conds.push(dbCmd.gte(new Date(dateFrom + ' 00:00:00').getTime()));
    if (dateTo) conds.push(dbCmd.lte(new Date(dateTo + ' 23:59:59').getTime()));
    where.datetime = conds.length > 0 ? dbCmd.and(...conds) : undefined;
  }
  if (where.datetime === undefined) delete where.datetime;

  const limitNum = Math.min(Number(limit) || 100, 500);
  const skipNum = Number(offset) || 0;
  // 有关键词时先取较多数据再在内存中筛选并分页
  const fetchLimit = (keyword && String(keyword).trim()) ? 500 : limitNum;
  const res = await db.collection('record').where(where).orderBy('datetime', 'desc').skip(keyword ? 0 : skipNum).limit(fetchLimit).get();
  let list = res.data || [];

  // 联表查宠物姓名
  const petIds = [...new Set(list.map(r => r.pet_id).filter(Boolean))];
  let petMap = {};
  if (petIds.length > 0) {
    const petRes = await db.collection('pet').where({ _id: dbCmd.in(petIds) }).get();
    (petRes.data || []).forEach(p => { petMap[p._id] = p.name || ''; });
  }
  list = list.map(r => ({ ...r, pet_name: petMap[r.pet_id] || '' }));

  if (keyword && String(keyword).trim()) {
    const k = String(keyword).trim().toLowerCase();
    list = list.filter(r =>
      (r.event_desc && r.event_desc.toLowerCase().includes(k)) ||
      (r.medicine && r.medicine.toLowerCase().includes(k)) ||
      (r.hospital && r.hospital.toLowerCase().includes(k))
    );
    list = list.slice(skipNum, skipNum + limitNum);
  }

  return { code: 0, data: list };
};
