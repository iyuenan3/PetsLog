// 同步自定义 tabBar 选中态（ADR-010）。
// custom-tab-bar 自身靠 attached / pageLifetimes.show + getCurrentPages() 推算路由，
// 在 uni-app mp-weixin 下不稳（selected 卡默认 0，永远只有「宠物」高亮）。
// 改用微信官方推荐法：各 tab 页 onShow 主动把自己的下标推给 tabBar 组件。
// uni-app 里原生页实例在 this.$scope，getTabBar() 是 custom tabBar 启用后页的原生方法。
export function syncTab(vm, idx) {
  // #ifdef MP-WEIXIN
  const apply = () => {
    const page = (vm && vm.$scope) || vm
    const tb = page && typeof page.getTabBar === 'function' ? page.getTabBar() : null
    if (tb && tb.setData) {
      tb.setData({ selected: idx })
      return true
    }
    return false
  }
  // 首调 tabBar 可能尚未挂载，失败则下一帧重试一次
  if (!apply()) setTimeout(apply, 50)
  // #endif
}
