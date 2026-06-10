<template>
  <view class="page">
    <scroll-view scroll-y class="pets-scroll">
      <!-- 问候 -->
      <view class="greeting">
        <text class="greeting__hi">今天，毛孩子们还好吗 🐾</text>
        <text class="greeting__sub">点下面的 ＋ 说一句，我帮你记下来</text>
      </view>

      <!-- 到期提醒横幅 -->
      <view
        v-if="dueCount"
        class="banner banner--alert"
        hover-class="banner--press"
        hover-stay-time="80"
        @click="goHealth"
      >
        <text class="banner__icon">🔔</text>
        <text class="banner__text">有 <text class="banner__num">{{ dueCount }}</text> 条提醒到期</text>
        <text class="banner__arrow">›</text>
      </view>

      <!-- 宠物网格 -->
      <view v-if="pets.length" class="pet-grid">
        <view
          v-for="p in pets"
          :key="p._id || p.name"
          class="pet-card"
          hover-class="pet-card--press"
          hover-stay-time="80"
          @click="openPet(p)"
        >
          <view class="pet-card__avatar" :class="p.species === 'dog' ? 'is-dog' : 'is-cat'">
            <image v-if="p.avatar" :src="p.avatar" class="pet-card__avatar-img" mode="aspectFill"></image>
            <text v-else>{{ speciesEmoji(p.species) }}</text>
          </view>
          <text class="pet-card__name">{{ p.name }}</text>
          <text class="pet-card__meta">{{ ageText(p.birthday) || '年龄未知' }} · {{ p.latest_weight ? p.latest_weight + 'kg' : '体重未记' }}</text>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-else class="empty">
        <view class="empty__art">🐾</view>
        <text class="empty__title">还没有毛孩子</text>
        <text class="empty__desc">点 ＋ 说一句，比如「新来的橘猫示例 3.2kg」，我会自动建档</text>
        <button class="empty__cta" hover-class="empty__cta--press" hover-stay-time="60" @click="goRecord">＋ 记一笔</button>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { petAge } from '@/utils'
import { callFn } from '@/cloud'

export default {
  data() {
    return {
      pets: [],
      dueCount: 0, // 到期/逾期提醒数，用于宠物页横幅
    }
  },
  onShow() {
    this.loadPets()
    this.loadDue()
  },
  methods: {
    speciesEmoji(s) {
      return s === 'dog' ? '🐶' : '🐱'
    },
    ageText(b) {
      return petAge(b)
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
        const res = await callFn('pets', { action: 'list' })
        if (res.result && res.result.ok) this.pets = res.result.data || []
      } catch (e) {
        console.warn('loadPets failed', e)
      }
    },
    openPet(p) {
      const id = p && p._id ? p._id : ''
      uni.navigateTo({
        url: '/pages/pet/pet?id=' + id,
        fail: (err) => {
          uni.showModal({ title: '跳转失败', content: 'id=' + id + ' / ' + (err && err.errMsg || JSON.stringify(err)), showCancel: false })
        },
      })
    },
    async loadDue() {
      if (!this.cloudReady()) return
      try {
        const res = await callFn('reminders', { action: 'list' })
        if (res.result && res.result.ok) {
          const today = res.result.today || ''
          this.dueCount = (res.result.data || []).filter((r) => r.next_date && r.next_date <= today).length
        }
      } catch (e) {
        console.warn('loadDue failed', e)
      }
    },
    goHealth() {
      // 横幅跳「健康」tab，并指定到提醒分段
      uni.setStorageSync('health_seg', 'rem')
      uni.switchTab({ url: '/pages/health/health' })
    },
    goRecord() {
      uni.navigateTo({ url: '/pages/record/record' })
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
  padding: 0 0 calc(160rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

/* 问候 */
.greeting {
  padding: 40rpx var(--pad-page) 16rpx;
  display: flex;
  flex-direction: column;
}
.greeting__hi {
  font-size: var(--fs-display);
  line-height: 1.25;
  font-weight: 700;
  color: var(--c-text);
}
.greeting__sub {
  margin-top: 8rpx;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
}

/* 到期提醒横幅 */
.banner {
  margin: 8rpx var(--pad-page) 24rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx 28rpx;
  background: var(--c-primary-wash);
  border: 2rpx solid var(--c-primary-tint);
  border-radius: var(--r-md);
  box-shadow: var(--sh-1);
}
.banner--alert {
  animation: breathe 2.8s ease-in-out infinite;
}
.banner--press {
  background: var(--c-primary-tint);
}
.banner__icon {
  font-size: 36rpx;
}
.banner__text {
  flex: 1;
  font-size: var(--fs-sub);
  color: var(--c-primary-deep);
  font-weight: 500;
}
.banner__num {
  font-weight: 700;
}
.banner__arrow {
  font-size: 32rpx;
  color: var(--c-primary);
}

/* 宠物网格 */
.pet-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24rpx;
  padding: 0 var(--pad-page);
}
.pet-card {
  width: calc(50% - 12rpx);
  box-sizing: border-box;
  background: var(--c-card);
  border-radius: var(--r-lg);
  padding: 36rpx 24rpx 32rpx;
  box-shadow: var(--sh-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.pet-card--press {
  transform: scale(0.97);
  box-shadow: var(--sh-press);
}
.pet-card__avatar {
  width: 128rpx;
  height: 128rpx;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 72rpx;
  background: radial-gradient(circle at 50% 38%, #fff3ec 0%, var(--c-primary-tint) 100%);
  box-shadow: inset 0 0 0 2rpx rgba(242, 130, 92, 0.12), 0 6rpx 16rpx rgba(242, 130, 92, 0.18);
}
.pet-card__avatar.is-dog {
  background: radial-gradient(circle at 50% 38%, #fff0e6 0%, #fad9c2 100%);
}
.pet-card__avatar-img {
  width: 100%;
  height: 100%;
  border-radius: var(--r-pill);
}
.pet-card__name {
  margin-top: 20rpx;
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--c-text);
}
.pet-card__meta {
  margin-top: 6rpx;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}

/* 空状态 */
.empty {
  padding: 120rpx var(--pad-page);
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
}
.empty__cta {
  margin-top: 40rpx;
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 56rpx;
  border-radius: var(--r-pill);
  background: var(--c-primary-grad);
  box-shadow: var(--sh-primary);
  color: var(--c-text-inv);
  font-size: var(--fs-body);
  font-weight: 600;
}
.empty__cta--press {
  transform: scale(0.97);
  box-shadow: var(--sh-press);
}
</style>
