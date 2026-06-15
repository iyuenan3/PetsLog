<script>
import { CLOUD_ENV } from './config'
import { ensureFamily } from './cloud'

export default {
  onLaunch: function () {
    // #ifdef MP-WEIXIN
    if (typeof wx !== 'undefined' && wx.cloud) {
      if (CLOUD_ENV) {
        wx.cloud.init({ env: CLOUD_ENV, traceUser: true })
        // 预热家庭上下文：无家庭则自动建「我的家」，单人用户无感
        ensureFamily()
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
/* ============================================================
   PetsLog 设计令牌（温暖治愈）。挂在 page 上，各页 var() 继承。
   改主题只改这一处。命名：色 --c-* / 阴影 --sh-* / 圆角 --r-* / 间距 --sp-* / 字号 --fs-*
   ============================================================ */
page {
  /* 主色：珊瑚 / 暖橘 */
  --c-primary: #f2825c;
  --c-primary-strong: #e26b43;
  --c-primary-deep: #c9542f;
  --c-primary-soft: #f8a887;
  --c-primary-tint: #fbe7dd;
  --c-primary-wash: #fdf2ec;
  --c-primary-grad: linear-gradient(135deg, #f8a887 0%, #f2825c 55%, #e26b43 100%);

  /* 背景与卡片 */
  --c-bg: #faf6f0;
  --c-bg-sink: #f3ece2;
  --c-card: #ffffff;
  --c-card-cream: #fffcf8;

  /* 文字 */
  --c-text: #3a3330;
  --c-text-2: #8a7f77;
  --c-text-3: #b5aba2;
  --c-text-inv: #ffffff;

  /* 描边与分隔 */
  --c-border: #efe7dc;
  --c-divider: #f2eae0;

  /* 语义色 */
  --c-success: #5bb98c;
  --c-success-tint: #e5f4ec;
  --c-warning: #e8a33d;
  --c-warning-tint: #fbf0dc;
  --c-danger: #e05d4e;
  --c-danger-tint: #fce8e4;

  /* 四个提醒类型色对 */
  --c-rt-med: #f2825c;
  --c-rt-med-bg: #fbe7dd;
  --c-rt-vaccine: #5ba9c9;
  --c-rt-vaccine-bg: #e4f0f5;
  --c-rt-deworm: #6fb48a;
  --c-rt-deworm-bg: #e6f2eb;
  --c-rt-other: #b08fcb;
  --c-rt-other-bg: #f0e9f6;

  /* 阴影（暖棕投影，非冷灰） */
  --sh-1: 0 2rpx 12rpx rgba(196, 124, 86, 0.06);
  --sh-2: 0 8rpx 28rpx rgba(196, 124, 86, 0.1);
  --sh-3: 0 -10rpx 40rpx rgba(120, 70, 40, 0.14);
  --sh-press: 0 2rpx 8rpx rgba(196, 124, 86, 0.08);
  --sh-primary: 0 10rpx 24rpx rgba(242, 130, 92, 0.32);

  /* 圆角 */
  --r-xs: 8rpx;
  --r-sm: 16rpx;
  --r-md: 24rpx;
  --r-lg: 32rpx;
  --r-xl: 40rpx;
  --r-pill: 999rpx;

  /* 间距（8 基准） */
  --sp-1: 8rpx;
  --sp-2: 16rpx;
  --sp-3: 24rpx;
  --sp-4: 32rpx;
  --sp-5: 40rpx;
  --sp-6: 48rpx;
  --pad-page: 32rpx;

  /* 字号 */
  --fs-display: 48rpx;
  --fs-h1: 40rpx;
  --fs-h2: 34rpx;
  --fs-body: 30rpx;
  --fs-sub: 26rpx;
  --fs-cap: 24rpx;
  --fs-tiny: 22rpx;

  background-color: var(--c-bg);
  color: var(--c-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Microsoft YaHei', sans-serif;
}

/* 清掉微信 button 默认 1px 边框，统一走自定义样式 */
button::after {
  border: none;
}

/* ============================================================
   全局按钮系统（Round 2）：成对操作按钮统一一套，各页 class="btn-primary/btn-ghost"。
   原本 health/pet/record 各复制一份（逐字相同），抽到此处去重；family 的独立版式保留本地。
   均为 flex:1，用在底部/弹层的成对按钮行（主操作 + 次操作）。
   ============================================================ */
.btn-primary {
  flex: 1;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: var(--r-pill);
  background: var(--c-primary-grad);
  color: var(--c-text-inv);
  font-size: var(--fs-body);
  font-weight: 600;
  box-shadow: var(--sh-primary);
}
.btn-primary--press {
  transform: scale(0.97);
  box-shadow: var(--sh-press);
}
.btn-ghost {
  flex: 1;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  color: var(--c-text-2);
  font-size: var(--fs-body);
  font-weight: 500;
}
.btn-ghost--press {
  background: var(--c-divider);
}

/* ============================================================
   全局空状态（Round 2）：index/timeline/health 原各复制一份（art/title/desc 逐字相同、
   仅 padding 漂移 120/140/160），抽到此处并把 padding 归一 140。
   record-detail 的极简空状态在本页另有 .empty/.empty__title 覆盖，不受影响。
   ============================================================ */
.empty {
  padding: 140rpx var(--pad-page);
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty__art {
  width: 200rpx;
  height: 200rpx;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 110rpx;
  background: radial-gradient(circle at 50% 40%, #fff3ec 0%, var(--c-primary-wash) 70%, var(--c-bg) 100%);
}
.empty__title {
  margin-top: 32rpx;
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--c-text);
}
.empty__desc {
  margin-top: 12rpx;
  padding: 0 20rpx;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
  text-align: center;
  line-height: 1.6;
}

/* 极轻呼吸：用于逾期 / 到期提示元素，温柔不焦虑 */
@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.012);
  }
}
</style>
