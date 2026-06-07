<script>
import { CLOUD_ENV } from './config'

export default {
  onLaunch: function () {
    // #ifdef MP-WEIXIN
    if (typeof wx !== 'undefined' && wx.cloud) {
      if (CLOUD_ENV) {
        wx.cloud.init({ env: CLOUD_ENV, traceUser: true })
      } else {
        console.warn('[PetsLog] 云开发环境 ID 未配置，请在 src/config.js 填 CLOUD_ENV')
      }
    }
    // #endif
  },
  onShow: function () {},
  onHide: function () {},
}
</script>

<style>
/* 全局样式 */
page {
  background-color: #f4f5f7;
}
</style>
