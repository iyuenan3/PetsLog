<template>
  <view class="page">
    <view v-if="meds.length" class="list">
      <view v-for="m in meds" :key="m._id" class="card">
        <view class="line1">
          <text class="name">{{ m.name }}</text>
          <text class="qty">x{{ m.quantity }}</text>
        </view>
        <text class="effect">{{ m.effect }}</text>
        <text class="expire" :class="{ warn: isExpiringSoon(m.expire_date) }">
          过期：{{ m.expire_date || '未填' }}
        </text>
      </view>
    </view>
    <view v-else class="empty">
      <text class="empty-title">家庭药品库存为空</text>
      <text class="empty-sub">记录驱虫药等的数量与过期日期，避免漏管</text>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'

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
      const t = new Date(d).getTime()
      return t - Date.now() < 30 * 24 * 3600 * 1000
    },
    async load() {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV) return
      try {
        const res = await wx.cloud.callFunction({ name: 'meds', data: { action: 'list' } })
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
.page { padding: 24rpx; }
.list { display: flex; flex-direction: column; gap: 20rpx; }
.card { background: #fff; border-radius: 24rpx; padding: 28rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.04); }
.line1 { display: flex; align-items: center; }
.name { font-size: 32rpx; font-weight: 600; color: #111827; }
.qty { margin-left: auto; font-size: 28rpx; color: #6b7280; }
.effect { display: block; font-size: 26rpx; color: #6b7280; margin-top: 8rpx; }
.expire { display: block; font-size: 24rpx; color: #9ca3af; margin-top: 12rpx; }
.expire.warn { color: #ef4444; }
.empty { margin-top: 200rpx; display: flex; flex-direction: column; align-items: center; }
.empty-title { font-size: 32rpx; color: #374151; }
.empty-sub { font-size: 26rpx; color: #9ca3af; margin-top: 16rpx; }
</style>
