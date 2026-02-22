'use strict';

/**
 * 查询当前用户所属家庭列表
 * 入参：user_id（MVP 由前端传入）
 */
exports.main = async (event, context) => {
  const db = uniCloud.database();
  const { user_id: userId } = event || {};

  if (!userId) {
    return { code: 'UNAUTHORIZED', message: '请先登录' };
  }

  const memberRes = await db.collection('family_member')
    .where({ user_id: userId })
    .get();

  if (!memberRes.data || memberRes.data.length === 0) {
    return { code: 0, data: [] };
  }

  const familyIds = memberRes.data.map(m => m.family_id);
  const familyRes = await db.collection('family')
    .where({ _id: db.command.in(familyIds) })
    .get();

  const list = (familyRes.data || []).map(f => ({
    _id: f._id,
    name: f.name,
    created_at: f.created_at
  }));

  return { code: 0, data: list };
};
