<template>
  <view class="page">
    <!-- 宠物卡片区 -->
    <scroll-view scroll-y class="pets-scroll">
      <view class="header">
        <text class="greeting">今天，家里的猫狗们还好吗</text>
      </view>

      <view v-if="pets.length" class="pet-grid">
        <view
          v-for="p in pets"
          :key="p._id || p.name"
          class="pet-card"
          @click="openPet(p)"
        >
          <view class="pet-avatar">{{ speciesEmoji(p.species) }}</view>
          <view class="pet-meta">
            <text class="pet-name">{{ p.name }}</text>
            <text class="pet-sub">{{ p.ageText || '年龄未知' }} · {{ p.latest_weight ? p.latest_weight + 'kg' : '体重未记' }}</text>
          </view>
        </view>
      </view>

      <view v-else class="empty">
        <text class="empty-title">还没有宠物档案</text>
        <text class="empty-sub">直接在下面说一句，例如「新来的橘猫示例 3.2kg」</text>
      </view>
    </scroll-view>

    <!-- 解析结果确认卡片 -->
    <view v-if="parsed" class="confirm-mask" @click="cancelParse">
      <view class="confirm-card" @click.stop>
        <text class="confirm-title">确认这条记录</text>
        <view class="confirm-row">
          <text class="k">宠物</text>
          <text class="v">{{ parsed.pet || '待确认' }}<text v-if="parsed.is_new" class="new-badge"> 🆕 将建档</text></text>
        </view>
        <view class="confirm-row" v-if="parsed.is_new">
          <text class="k">种类</text>
          <view class="v toggle">
            <text :class="['chip', parsed.species === 'cat' ? 'on' : '']" @click="setSpecies('cat')">🐱 猫</text>
            <text :class="['chip', parsed.species === 'dog' ? 'on' : '']" @click="setSpecies('dog')">🐶 狗</text>
          </view>
        </view>
        <view class="confirm-row"><text class="k">时间</text><text class="v">{{ parsed.time || '今天' }}</text></view>
        <view class="confirm-row"><text class="k">类型</text><text class="v">{{ parsed.event_type || '其它' }}</text></view>
        <view class="confirm-row" v-if="parsed.weight"><text class="k">体重</text><text class="v">{{ parsed.weight }}kg</text></view>
        <view class="confirm-row" v-if="parsed.med"><text class="k">用药</text><text class="v">{{ parsed.med }}</text></view>
        <view class="confirm-row"><text class="k">原文</text><text class="v">{{ parsed.raw || draft }}</text></view>
        <view class="confirm-actions">
          <button class="btn ghost" @click="cancelParse">取消</button>
          <button class="btn primary" :loading="saving" @click="confirmSave">确认归档</button>
        </view>
      </view>
    </view>

    <!-- 底部固定输入框 -->
    <view class="input-bar">
      <input
        v-model="draft"
        class="input"
        type="text"
        placeholder="说一句，例如「示例猫今天吐了，体重4.2kg」"
        confirm-type="send"
        :disabled="parsing"
        @confirm="onSend"
      />
      <button class="send" :loading="parsing" @click="onSend">{{ parsing ? '' : '记录' }}</button>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'

export default {
  data() {
    return {
      pets: [],
      draft: '',
      parsing: false,
      saving: false,
      parsed: null, // AI 解析后的结构化结果，待用户确认
    }
  },
  onShow() {
    this.loadPets()
  },
  methods: {
    speciesEmoji(s) {
      return s === 'dog' ? '🐶' : '🐱'
    },
    cloudReady() {
      // #ifdef MP-WEIXIN
      return typeof wx !== 'undefined' && !!wx.cloud && !!CLOUD_ENV
      // #endif
      // eslint-disable-next-line no-unreachable
      return false
    },
    async loadPets() {
      if (!this.cloudReady()) return
      try {
        const res = await wx.cloud.callFunction({ name: 'pets', data: { action: 'list' } })
        if (res.result && res.result.ok) this.pets = res.result.data || []
      } catch (e) {
        console.warn('loadPets failed', e)
      }
    },
    openPet(p) {
      uni.navigateTo({ url: '/pages/pet/pet?id=' + (p._id || '') })
    },
    onSend() {
      const text = (this.draft || '').trim()
      if (!text) return
      if (!this.cloudReady()) {
        uni.showToast({ title: '请先配置云环境(CLOUD_ENV)', icon: 'none' })
        return
      }
      this.parse(text)
    },
    async parse(text) {
      this.parsing = true
      try {
        const res = await wx.cloud.callFunction({ name: 'parseRecord', data: { text } })
        const r = res.result || {}
        if (!r.ok) {
          uni.showToast({ title: r.msg || '解析失败', icon: 'none' })
          return
        }
        if (r.parsed && r.parsed.valid === false) {
          uni.showToast({ title: '这条看起来不是健康记录', icon: 'none' })
          return
        }
        this.parsed = r.parsed
      } catch (e) {
        uni.showToast({ title: 'AI 解析出错', icon: 'none' })
        console.error(e)
      } finally {
        this.parsing = false
      }
    },
    setSpecies(s) {
      if (this.parsed) this.parsed.species = s
    },
    cancelParse() {
      this.parsed = null
    },
    async confirmSave() {
      if (!this.parsed) return
      this.saving = true
      try {
        const res = await wx.cloud.callFunction({ name: 'saveRecord', data: { record: this.parsed } })
        const r = res.result || {}
        if (r.ok) {
          uni.showToast({ title: '已归档', icon: 'success' })
          this.draft = ''
          this.parsed = null
          this.loadPets()
        } else {
          uni.showToast({ title: r.msg || '保存失败', icon: 'none' })
        }
      } catch (e) {
        uni.showToast({ title: '保存出错', icon: 'none' })
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.pets-scroll {
  flex: 1;
  padding: 24rpx 24rpx 180rpx;
  box-sizing: border-box;
}
.header {
  padding: 16rpx 8rpx 24rpx;
}
.greeting {
  font-size: 30rpx;
  color: #6b7280;
}
.pet-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 20rpx;
}
.pet-card {
  width: calc(50% - 10rpx);
  box-sizing: border-box;
  background: #ffffff;
  border-radius: 24rpx;
  padding: 28rpx;
  display: flex;
  align-items: center;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.04);
}
.pet-avatar {
  width: 84rpx;
  height: 84rpx;
  border-radius: 50%;
  background: #eef2ff;
  font-size: 44rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}
.pet-meta {
  display: flex;
  flex-direction: column;
}
.pet-name {
  font-size: 32rpx;
  font-weight: 600;
  color: #111827;
}
.pet-sub {
  font-size: 24rpx;
  color: #9ca3af;
  margin-top: 6rpx;
}
.empty {
  margin-top: 160rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-title {
  font-size: 32rpx;
  color: #374151;
}
.empty-sub {
  font-size: 26rpx;
  color: #9ca3af;
  margin-top: 16rpx;
  text-align: center;
}
.input-bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  background: #ffffff;
  padding: 16rpx 24rpx calc(16rpx + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  border-top: 1rpx solid #f0f0f0;
}
.input {
  flex: 1;
  height: 76rpx;
  background: #f3f4f6;
  border-radius: 38rpx;
  padding: 0 28rpx;
  font-size: 28rpx;
}
.send {
  width: 132rpx;
  height: 76rpx;
  line-height: 76rpx;
  margin-left: 16rpx;
  background: #3a7afe;
  color: #fff;
  border-radius: 38rpx;
  font-size: 28rpx;
  padding: 0;
}
.confirm-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
  z-index: 50;
}
.confirm-card {
  width: 100%;
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
}
.confirm-title {
  font-size: 32rpx;
  font-weight: 600;
  color: #111827;
}
.confirm-row {
  display: flex;
  margin-top: 20rpx;
}
.confirm-row .k {
  width: 100rpx;
  color: #9ca3af;
  font-size: 28rpx;
}
.confirm-row .v {
  flex: 1;
  color: #111827;
  font-size: 28rpx;
}
.new-badge {
  font-size: 22rpx;
  color: #f59e0b;
  margin-left: 12rpx;
}
.toggle {
  display: flex;
  gap: 16rpx;
}
.chip {
  font-size: 26rpx;
  color: #6b7280;
  background: #f3f4f6;
  padding: 6rpx 24rpx;
  border-radius: 24rpx;
}
.chip.on {
  background: #eef2ff;
  color: #3a7afe;
}
.confirm-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 36rpx;
}
.btn {
  flex: 1;
  height: 84rpx;
  line-height: 84rpx;
  border-radius: 42rpx;
  font-size: 30rpx;
}
.btn.ghost {
  background: #f3f4f6;
  color: #374151;
}
.btn.primary {
  background: #3a7afe;
  color: #fff;
}
</style>
