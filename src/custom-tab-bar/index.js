// 自定义 tabBar（ADR-010）。微信原生组件，uni-app 原样拷贝到产物根 custom-tab-bar/。
// 每个 tab 页持有独立的 tabBar 实例，selected 在 attached 时按宿主页路由算一次即恒定正确，
// 无需事件总线 / getTabBar 代理；pageLifetimes.show 作冗余兜底。
Component({
  data: {
    selected: 0,
    left: [
      { idx: 0, page: '/pages/index/index', text: '宠物', ico: '🐾' },
      { idx: 1, page: '/pages/timeline/timeline', text: '时间线', ico: '📋' },
    ],
    right: [
      { idx: 2, page: '/pages/health/health', text: '健康', ico: '💊' },
      { idx: 3, page: '/pages/me/me', text: '我的', ico: '👤' },
    ],
  },
  lifetimes: {
    attached() {
      this.syncFromRoute()
    },
  },
  pageLifetimes: {
    show() {
      this.syncFromRoute()
    },
  },
  methods: {
    syncFromRoute() {
      const pages = getCurrentPages()
      if (!pages || !pages.length) return
      const route = '/' + (pages[pages.length - 1].route || '')
      const map = {
        '/pages/index/index': 0,
        '/pages/timeline/timeline': 1,
        '/pages/health/health': 2,
        '/pages/me/me': 3,
      }
      if (route in map && this.data.selected !== map[route]) {
        this.setData({ selected: map[route] })
      }
    },
    switchTo(e) {
      const idx = Number(e.currentTarget.dataset.idx)
      const page = e.currentTarget.dataset.page
      if (this.data.selected === idx) return
      wx.switchTab({ url: page })
    },
    goRecord() {
      wx.navigateTo({ url: '/pages/record/record' })
    },
  },
})
