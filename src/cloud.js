// 家庭上下文 + 统一云函数调用：每次自动注入 active family_id（见 AIREADME/DECISIONS ADR-008）。
// 安全：family_id 由客户端带上，服务端每个函数都会 assertMember 校验，前端只负责传对当前家庭。
import { CLOUD_ENV } from '@/config'

let activeFamilyId = ''
let families = []
let bootstrapping = null

export function cloudReady() {
  // #ifdef MP-WEIXIN
  return typeof wx !== 'undefined' && !!wx.cloud && !!CLOUD_ENV
  // #endif
  // eslint-disable-next-line no-unreachable
  return false
}

export function getFamilyId() {
  return activeFamilyId
}
export function getFamilies() {
  return families
}
export function setActiveFamily(id) {
  activeFamilyId = id || ''
  // #ifdef MP-WEIXIN
  uni.setStorageSync('active_family_id', activeFamilyId)
  // #endif
}

// 确保有家庭上下文：首次调 family bootstrap（无家庭自动建「我的家」），缓存 active。
// 用 bootstrapping 去重，避免多页面 onShow 并发触发多次 bootstrap。
export async function ensureFamily() {
  if (activeFamilyId) return activeFamilyId
  if (bootstrapping) return bootstrapping
  // #ifdef MP-WEIXIN
  if (!cloudReady()) return ''
  bootstrapping = (async () => {
    try {
      const res = await wx.cloud.callFunction({ name: 'family', data: { action: 'bootstrap' } })
      if (res.result && res.result.ok) {
        families = res.result.families || []
        const cached = uni.getStorageSync('active_family_id')
        activeFamilyId = cached && families.some((f) => f.family_id === cached) ? cached : res.result.active_family_id || ''
        uni.setStorageSync('active_family_id', activeFamilyId)
      }
    } catch (e) {
      console.warn('ensureFamily failed', e)
    }
    bootstrapping = null
    return activeFamilyId
  })()
  return bootstrapping
  // #endif
  // eslint-disable-next-line no-unreachable
  return ''
}

// 统一云函数调用：自动注入 family_id。所有页面用它替代裸 wx.cloud.callFunction。
export async function callFn(name, data = {}) {
  // #ifdef MP-WEIXIN
  const fid = activeFamilyId || (await ensureFamily())
  return wx.cloud.callFunction({ name, data: { ...data, family_id: fid } })
  // #endif
  // eslint-disable-next-line no-unreachable
  return { result: { ok: false, msg: 'not mp' } }
}

// 刷新我的家庭列表（家庭切换 / 管理用，轮 C）。
export async function refreshFamilies() {
  // #ifdef MP-WEIXIN
  const res = await wx.cloud.callFunction({ name: 'family', data: { action: 'listMine' } })
  if (res.result && res.result.ok) families = res.result.families || []
  return families
  // #endif
  // eslint-disable-next-line no-unreachable
  return []
}
