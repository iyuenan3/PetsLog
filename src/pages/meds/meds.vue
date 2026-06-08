<template>
  <view class="page">
    <view v-if="meds.length" class="med-list">
      <view v-for="m in meds" :key="m._id" class="med-card">
        <view class="med-card__icon">💊</view>
        <view class="med-card__body">
          <view class="med-card__top">
            <text class="med-card__name">{{ m.name }}</text>
            <text v-if="isExpiringSoon(m.expire_date)" class="med-card__badge">临期</text>
          </view>
          <text class="med-card__qty">剩余 {{ m.quantity }}</text>
          <text v-if="m.effect" class="med-card__effect">{{ m.effect }}</text>
          <text class="med-card__exp" :class="{ 'med-card__exp--soon': isExpiringSoon(m.expire_date) }">过期 {{ m.expire_date || '未填' }}</text>
        </view>
      </view>
    </view>
    <view v-else class="empty">
      <view class="empty__art">💊</view>
      <text class="empty__title">药箱还空着</text>
      <text class="empty__desc">回首页说一句「买了盒驱虫药，2 支，明年3月过期」，自动入库</text>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { callFn } from '@/cloud'

export default {
  data() {
    return { meds: [] }
  },
  onShow() {
    this.load()
  },
  methods: {
    isExpiringSoon(d) {
      if (!d) return false
      const t = new Date(String(d).replace(/-/g, '/')).getTime()
      return t - Date.now() < 30 * 24 * 3600 * 1000
    },
    async load() {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV) return
      try {
        const res = await callFn('meds', { action: 'list' })
        if (res.result && res.result.ok) {
          const list = res.result.data || []
          // 按过期日期升序；未填过期的排最后，避免把近效期药品挤下去
          list.sort((a, b) => (a.expire_date || '9999-99-99').localeCompare(b.expire_date || '9999-99-99'))
          this.meds = list
        }
      } catch (e) {
        console.warn('meds load failed', e)
      }
      // #endif
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
}
.med-list {
  padding: 24rpx var(--pad-page) 40rpx;
}
.med-card {
  background: var(--c-card);
  border-radius: var(--r-md);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--sh-2);
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}
.med-card__icon {
  width: 88rpx;
  height: 88rpx;
  flex: none;
  border-radius: var(--r-md);
  background: var(--c-primary-tint);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
}
.med-card__body {
  flex: 1;
}
.med-card__top {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.med-card__name {
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--c-text);
}
.med-card__badge {
  height: 36rpx;
  padding: 0 14rpx;
  border-radius: var(--r-pill);
  background: var(--c-danger-tint);
  color: var(--c-danger);
  font-size: var(--fs-tiny);
  font-weight: 600;
  display: flex;
  align-items: center;
}
.med-card__qty {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-primary-deep);
  font-weight: 600;
  margin-top: 4rpx;
}
.med-card__effect {
  display: block;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
  margin-top: 10rpx;
  line-height: 1.5;
}
.med-card__exp {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-text-3);
  margin-top: 12rpx;
}
.med-card__exp--soon {
  color: var(--c-danger);
  font-weight: 600;
}

/* 空状态 */
.empty {
  padding: 160rpx var(--pad-page);
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
  font-size: var(--fs-sub);
  color: var(--c-text-2);
  text-align: center;
  line-height: 1.6;
  padding: 0 20rpx;
}
</style>
