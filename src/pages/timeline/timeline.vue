<template>
  <view class="page">
    <view v-if="records.length" class="list">
      <view v-for="r in records" :key="r._id" class="item">
        <view class="dot" :class="r.event_type"></view>
        <view class="body">
          <view class="line1">
            <text class="pet">{{ r.pet }}</text>
            <text class="type">{{ r.event_type }}</text>
            <text class="time">{{ r.time }}</text>
          </view>
          <text class="raw">{{ r.raw }}</text>
          <text v-if="r.weight" class="extra">体重 {{ r.weight }}kg</text>
          <text v-if="r.med" class="extra">用药 {{ r.med }}</text>
        </view>
      </view>
    </view>
    <view v-else class="empty">
      <text class="empty-title">还没有健康记录</text>
      <text class="empty-sub">回首页说一句话，AI 会自动归档到这里</text>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'

export default {
  data() {
    return { records: [] }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV) return
      try {
        const res = await wx.cloud.callFunction({ name: 'timeline', data: { action: 'list' } })
        if (res.result && res.result.ok) this.records = res.result.data || []
      } catch (e) {
        console.warn('timeline load failed', e)
      }
      // #endif
    },
  },
}
</script>

<style>
.page { padding: 24rpx; }
.list { display: flex; flex-direction: column; }
.item { display: flex; padding: 24rpx 0; border-bottom: 1rpx solid #eef0f3; }
.dot { width: 16rpx; height: 16rpx; border-radius: 50%; background: #3a7afe; margin: 10rpx 24rpx 0 8rpx; flex-shrink: 0; }
.body { flex: 1; display: flex; flex-direction: column; }
.line1 { display: flex; align-items: center; gap: 16rpx; }
.pet { font-size: 30rpx; font-weight: 600; color: #111827; }
.type { font-size: 24rpx; color: #3a7afe; background: #eef2ff; padding: 2rpx 14rpx; border-radius: 16rpx; }
.time { font-size: 24rpx; color: #9ca3af; margin-left: auto; }
.raw { font-size: 28rpx; color: #374151; margin-top: 10rpx; }
.extra { font-size: 24rpx; color: #6b7280; margin-top: 6rpx; }
.empty { margin-top: 200rpx; display: flex; flex-direction: column; align-items: center; }
.empty-title { font-size: 32rpx; color: #374151; }
.empty-sub { font-size: 26rpx; color: #9ca3af; margin-top: 16rpx; }
</style>
