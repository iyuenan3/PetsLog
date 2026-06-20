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
  /* 养护 care 第五类色对（原散落 4 处硬编码 → 令牌化，DRIFT #1） */
  --c-rt-care: #4fa89b;
  --c-rt-care-bg: rgba(79, 168, 155, 0.14);
  --c-rt-care-ink: #3c8579;

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
  /* 文字抗锯齿：对齐 HTML 镜像，DOM 文本边缘更平滑（mp webview 支持不稳、多为 no-op，但零成本零风险；canvas 文字不受此影响，走 dest 导出修复） */
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
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
/* 空状态用 PNG 图标（替代部分 emoji）：放进 .empty__art 光晕圆内居中 + 轻浮动 */
.empty__art-img {
  width: 124rpx;
  height: 124rpx;
  animation: float-soft 3.2s ease-in-out infinite;
}
/* 行内小图标统一工具类（UI 图标统一轮，2026-06-18）：表达型 Fluent 彩 / 功能型 Phosphor 暖染通用，
   配合 inline-flex 容器随文字居中对齐。跨页复用故必须挂 App.vue 全局（见 wxss-scope 红线）。 */
.ic {
  width: 30rpx;
  height: 30rpx;
  flex-shrink: 0;
}
.ic--sm {
  width: 24rpx;
  height: 24rpx;
}
.ic--lg {
  width: 40rpx;
  height: 40rpx;
}
/* 入场动画：.rise-in 工具类（列表项 stagger，配合内联 animation-delay）+ float-soft 空状态图标呼吸。
   全走 transform/opacity（GPU 合成、不触发 layout），克制即可。 */
@keyframes rise-in {
  from { opacity: 0; transform: translateY(24rpx); }
  to { opacity: 1; transform: translateY(0); }
}
.rise-in {
  /* backwards（非 both）：delay 段保留 from 隐藏态防闪现，播完释放 transform，
     让卡片的 hover-class 按下缩放（.tl-item--press）能接管 transform，否则被 fill 占住按不动。
     to 即元素自然态（translateY(0)/opacity(1)），不保留 forwards 也无跳变。
     波及面：本类同时用于 health 的 rm/food/med 卡，三者均无 base transform/非 1 opacity，
     backwards 释放回自然态逐像素一致、无跳变（已核对）。 */
  animation: rise-in 0.34s ease-out backwards;
}
@keyframes float-soft {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-5rpx); }
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

/* ============ 时间线卡片（.tl-list / .tl-item 及子类 + 事件配色）：全局单一真相源 ============
   timeline（主时间线）与 course（病程详情记录列表）共用。
   必须放 App.vue：uni-app mp-weixin 下页面 <style> 各自编译进各自 .wxss、不跨页，
   只有 App.vue → app.wxss 才全局；放页内则另一页拿不到（course 曾因此裸奔）。 */
.tl-list {
  padding: 24rpx var(--pad-page) 40rpx;
}
.tl-item {
  background: var(--c-card);
  border-radius: var(--r-md);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--sh-2);
  /* 按下反馈过渡 */
  transition: transform 0.14s ease, opacity 0.14s ease;
}
/* 按下态：轻缩 + 微降透明，松手回弹。transform 由 .rise-in 改 backwards 释放后能正常接管。 */
.tl-item--press {
  transform: scale(0.97);
  opacity: 0.94;
}
.tl-item__head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 14rpx;
}
.tl-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: var(--r-pill);
  flex: none;
}
.tl-item__pet {
  font-size: var(--fs-sub);
  font-weight: 600;
  color: var(--c-text);
}
.tl-chip {
  height: 40rpx;
  padding: 0 18rpx;
  border-radius: var(--r-pill);
  font-size: var(--fs-tiny);
  font-weight: 600;
  display: flex;
  align-items: center;
}
.tl-item__time {
  margin-left: auto;
  font-size: var(--fs-tiny);
  color: var(--c-text-3);
}
.tl-item__quote {
  display: block;
  font-size: var(--fs-body);
  color: var(--c-text);
  line-height: 1.55;
}
.tl-item__notes {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}
.tl-note {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 18rpx;
  background: var(--c-bg-sink);
  border-radius: var(--r-sm);
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}
/* 病程标签：可点击跳病程视图，主色调 + 边框 + › 提示「可点」，热区放大 */
.tl-note--tag {
  padding: 10rpx 20rpx;
  background: var(--c-primary-wash);
  color: var(--c-primary-deep);
  border: 1px solid var(--c-primary-tint);
  font-weight: 500;
}
.tl-note--tag-press {
  background: var(--c-primary-tint);
}

/* 事件类型配色：点（带柔晕环）+ 标签 */
.tl-dot.ev-symptom { background: var(--c-danger); box-shadow: 0 0 0 6rpx var(--c-danger-tint); }
.tl-dot.ev-med { background: var(--c-rt-med); box-shadow: 0 0 0 6rpx var(--c-rt-med-bg); }
.tl-dot.ev-vaccine { background: var(--c-rt-vaccine); box-shadow: 0 0 0 6rpx var(--c-rt-vaccine-bg); }
.tl-dot.ev-deworm { background: var(--c-rt-deworm); box-shadow: 0 0 0 6rpx var(--c-rt-deworm-bg); }
.tl-dot.ev-weight { background: var(--c-success); box-shadow: 0 0 0 6rpx var(--c-success-tint); }
.tl-dot.ev-clinic { background: var(--c-rt-other); box-shadow: 0 0 0 6rpx var(--c-rt-other-bg); }
.tl-dot.ev-care { background: var(--c-rt-care); box-shadow: 0 0 0 6rpx var(--c-rt-care-bg); }
.tl-dot.ev-other { background: var(--c-text-3); box-shadow: 0 0 0 6rpx var(--c-bg-sink); }

.tl-chip.ev-symptom { color: var(--c-danger); background: var(--c-danger-tint); }
.tl-chip.ev-med { color: var(--c-rt-med); background: var(--c-rt-med-bg); }
.tl-chip.ev-vaccine { color: var(--c-rt-vaccine); background: var(--c-rt-vaccine-bg); }
.tl-chip.ev-deworm { color: var(--c-rt-deworm); background: var(--c-rt-deworm-bg); }
.tl-chip.ev-weight { color: var(--c-success); background: var(--c-success-tint); }
.tl-chip.ev-clinic { color: var(--c-rt-other); background: var(--c-rt-other-bg); }
.tl-chip.ev-care { color: var(--c-rt-care-ink); background: var(--c-rt-care-bg); }
.tl-chip.ev-other { color: var(--c-text-2); background: var(--c-bg-sink); }
</style>
