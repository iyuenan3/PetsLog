// 自定义 tabBar（ADR-010）。微信原生组件，uni-app 原样拷贝到产物根 custom-tab-bar/。
// 每个 tab 页持有独立的 tabBar 实例，selected 在 attached 时按宿主页路由算一次即恒定正确，
// 无需事件总线 / getTabBar 代理；pageLifetimes.show 作冗余兜底。
Component({
  data: {
    selected: 0,
    left: [
      { idx: 0, page: '/pages/index/index', text: '宠物', ico: '/static/icon/paw.png' },
      { idx: 1, page: '/pages/timeline/timeline', text: '时间线', ico: '/static/icon/clipboard.png' },
    ],
    right: [
      { idx: 2, page: '/pages/health/health', text: '健康', ico: '/static/icon/pill.png' },
      { idx: 3, page: '/pages/me/me', text: '我的', ico: '/static/icon/person.png' },
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
      const page = e.currentTarget.dataset.page
      // 早退判据用「真实当前路由」而非 this.data.selected：后者是每实例组件状态，
      // attached 时序下可能残留默认值 0，会把回「宠物」(idx 0)的点击错误吞掉。见真机 bug 复盘。
      // 目标 tab 的高亮由目标页自己的 syncFromRoute(pageLifetimes.show) 点亮，此处不 setData
      // （this 是即将被隐藏的源页实例，改它的 selected 用户看不见，且 switchTab 失败时反而误点亮）。
      const pages = getCurrentPages()
      const curRoute = pages && pages.length ? '/' + (pages[pages.length - 1].route || '') : ''
      if (curRoute === page) return
      wx.switchTab({ url: page })
    },
    goRecord() {
      wx.navigateTo({ url: '/pages/record/record' })
    },
  },
})
