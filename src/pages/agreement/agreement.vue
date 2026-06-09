<template>
  <view class="page">
    <scroll-view scroll-y class="scroll">
      <text class="body">{{ content }}</text>
    </scroll-view>
  </view>
</template>

<script>
import { USER_AGREEMENT, PRIVACY_POLICY } from '@/agreements'

export default {
  data() {
    return { content: '' }
  },
  onLoad(opts) {
    const t = (opts && opts.type) || 'user'
    if (t === 'privacy') {
      this.content = PRIVACY_POLICY
      uni.setNavigationBarTitle({ title: '隐私政策' })
    } else {
      this.content = USER_AGREEMENT
      uni.setNavigationBarTitle({ title: '用户协议' })
    }
  },
}
</script>

<style>
.page {
  min-height: 100vh;
}
.scroll {
  height: 100vh;
  box-sizing: border-box;
  padding: 32rpx var(--pad-page) calc(48rpx + env(safe-area-inset-bottom));
}
.body {
  font-size: var(--fs-sub);
  color: var(--c-text);
  line-height: 1.9;
  white-space: pre-wrap;
}
</style>
