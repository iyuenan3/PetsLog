<template>
  <view class="page">
    <view v-if="pet" class="profile">
      <view class="avatar">{{ pet.species === 'dog' ? '🐶' : '🐱' }}</view>
      <text class="name">{{ pet.name }}</text>
      <view class="rows">
        <view class="row"><text class="k">品种</text><text class="v">{{ pet.breed || '未填' }}</text></view>
        <view class="row"><text class="k">生日</text><text class="v">{{ pet.birthday || '未填' }}</text></view>
        <view class="row"><text class="k">绝育</text><text class="v">{{ pet.neutered ? '是' : '否' }}</text></view>
        <view class="row"><text class="k">过敏史</text><text class="v">{{ pet.allergy || '无' }}</text></view>
        <view class="row"><text class="k">慢病</text><text class="v">{{ pet.chronic || '无' }}</text></view>
        <view class="row"><text class="k">最新体重</text><text class="v">{{ pet.latest_weight ? pet.latest_weight + 'kg' : '未记' }}</text></view>
      </view>
    </view>
    <view v-else class="empty"><text>加载中…</text></view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'

export default {
  data() {
    return { id: '', pet: null }
  },
  onLoad(opts) {
    this.id = (opts && opts.id) || ''
    this.load()
  },
  methods: {
    async load() {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV || !this.id) return
      try {
        const res = await wx.cloud.callFunction({ name: 'pets', data: { action: 'get', id: this.id } })
        if (res.result && res.result.ok) this.pet = res.result.data
      } catch (e) {
        console.warn('pet load failed', e)
      }
      // #endif
    },
  },
}
</script>

<style>
.page { padding: 32rpx; }
.profile { display: flex; flex-direction: column; align-items: center; }
.avatar { width: 140rpx; height: 140rpx; border-radius: 50%; background: #eef2ff; font-size: 72rpx; display: flex; align-items: center; justify-content: center; }
.name { font-size: 40rpx; font-weight: 600; color: #111827; margin-top: 20rpx; }
.rows { width: 100%; margin-top: 40rpx; background: #fff; border-radius: 24rpx; padding: 8rpx 28rpx; }
.row { display: flex; padding: 24rpx 0; border-bottom: 1rpx solid #f0f0f0; }
.row:last-child { border-bottom: none; }
.row .k { width: 160rpx; color: #9ca3af; font-size: 28rpx; }
.row .v { flex: 1; color: #111827; font-size: 28rpx; }
.empty { margin-top: 200rpx; text-align: center; color: #9ca3af; }
</style>
