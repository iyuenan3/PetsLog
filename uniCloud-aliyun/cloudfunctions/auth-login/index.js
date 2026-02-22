'use strict';

/**
 * 微信小程序手机号登录（MVP）
 * 入参：code（来自 button open-type="getPhoneNumber" 的 detail.code）
 * 若已配置 uni-id-co 的微信手机号登录，可改为调用 uni-id-co；此处仅做占位：根据 code 返回一个 uid 供前端存储，正式环境请接 uni-id。
 */
exports.main = async (event, context) => {
  const { code } = event || {};
  if (!code) {
    return { code: 'INVALID_PARAMS', message: '缺少手机号授权 code' };
  }
  // 开发/模拟器：用固定 code 返回固定 uid，便于在开发者工具中测试（无 getPhoneNumber 权限时使用）
  if (String(code) === 'dev_simulator') {
    return {
      code: 0,
      data: { uid: 'dev_user_001', token: '' }
    };
  }
  // TODO: 正式环境在此调用微信 getuserphonenumber 获取手机号，再与 uni-id 对接，返回 uid + token
  const uid = 'u_' + String(code).slice(0, 16).replace(/[^a-zA-Z0-9]/g, '');
  return {
    code: 0,
    data: { uid, token: '' }
  };
};
