<template>
  <view class="page">
    <!-- 个人头部 -->
    <view class="hero" hover-class="hero--press" hover-stay-time="80" @click="goProfile">
      <view class="hero__avatar">
        <image v-if="profile.avatar" :src="profile.avatar" class="hero__img" mode="aspectFill"></image>
        <text v-else class="hero__emoji">🐾</text>
      </view>
      <view class="hero__meta">
        <text class="hero__name">{{ profile.nickname || '设置昵称' }}</text>
        <text class="hero__sub">编辑个人档案 ›</text>
      </view>
    </view>

    <!-- 当前家庭 -->
    <view class="fam-card" hover-class="fam-card--press" hover-stay-time="80" @click="goFamily">
      <view class="fam-card__icon">🏠</view>
      <view class="fam-card__body">
        <text class="fam-card__title">{{ fam ? fam.name : '我的家' }}</text>
        <view class="fam-card__sub">
          <text class="fam-card__role">{{ fam && fam.role === 'admin' ? '管理员' : '成员' }}</text>
          <text class="fam-card__hint">管理 / 切换家庭</text>
        </view>
      </view>
      <text class="fam-card__arrow">›</text>
    </view>

    <!-- 菜单 -->
    <view class="menu">
      <view class="menu__row" hover-class="menu__row--press" hover-stay-time="60" @click="goFamily"><text class="menu__label">家庭管理</text><text class="menu__arrow">›</text></view>
      <view class="menu__row" hover-class="menu__row--press" hover-stay-time="60" @click="goProfile"><text class="menu__label">个人档案</text><text class="menu__arrow">›</text></view>
    </view>
    <view class="menu">
      <view class="menu__row" hover-class="menu__row--press" hover-stay-time="60" @click="goAgreement('user')"><text class="menu__label">用户协议</text><text class="menu__arrow">›</text></view>
      <view class="menu__row" hover-class="menu__row--press" hover-stay-time="60" @click="goAgreement('privacy')"><text class="menu__label">隐私协议</text><text class="menu__arrow">›</text></view>
    </view>
    <view class="menu">
      <view class="menu__row" hover-class="menu__row--press" hover-stay-time="60" @click="about"><text class="menu__label">关于 PetsLog</text><text class="menu__val">v{{ version }}</text></view>
    </view>

    <text class="foot">多宠家庭 AI 健康记录 · 仅记录，不替代兽医</text>
  </view>
</template>

<script>
import { ensureFamily, getProfile, refreshFamilies, getActiveFamily } from '@/cloud'

export default {
  data() {
    return { profile: { nickname: '', avatar: '' }, fam: null, version: '0.4.4' }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      // #ifdef MP-WEIXIN
      // 档案优先且独立加载，避免家庭接口抖动连累头像/昵称展示
      try {
        this.profile = await getProfile(true)
      } catch (e) {
        console.warn('me getProfile failed', e)
      }
      try {
        await ensureFamily()
        await refreshFamilies()
        this.fam = getActiveFamily()
      } catch (e) {
        console.warn('me family load failed', e)
      }
      // #endif
    },
    goProfile() {
      uni.navigateTo({ url: '/pages/profile/profile' })
    },
    goFamily() {
      uni.navigateTo({ url: '/pages/family/family' })
    },
    goAgreement(type) {
      uni.navigateTo({ url: '/pages/agreement/agreement?type=' + type })
    },
    about() {
      uni.showModal({
        title: 'PetsLog',
        content: '多宠家庭 AI 健康记录工具\n开源(MIT)：github.com/iyuenan3/petslog\n仅做健康记录，不构成诊疗建议。',
        confirmText: '复制仓库',
        success: (r) => {
          if (r.confirm) uni.setClipboardData({ data: 'https://github.com/iyuenan3/petslog' })
        },
      })
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 24rpx var(--pad-page) calc(140rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.hero {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, var(--c-primary-wash) 0%, var(--c-card) 100%);
  border-radius: var(--r-lg);
  padding: 36rpx 32rpx;
  box-shadow: var(--sh-2);
}
.hero--press {
  transform: scale(0.99);
}
.hero__avatar {
  width: 120rpx;
  height: 120rpx;
  border-radius: var(--r-pill);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(circle at 50% 38%, #fff3ec 0%, var(--c-primary-tint) 100%);
  box-shadow: inset 0 0 0 2rpx rgba(242, 130, 92, 0.14), 0 6rpx 16rpx rgba(242, 130, 92, 0.2);
}
.hero__img {
  width: 100%;
  height: 100%;
}
.hero__emoji {
  font-size: 64rpx;
}
.hero__meta {
  margin-left: 28rpx;
  display: flex;
  flex-direction: column;
}
.hero__name {
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--c-text);
}
.hero__sub {
  margin-top: 8rpx;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}

.fam-card {
  display: flex;
  align-items: center;
  background: var(--c-card);
  border-radius: var(--r-md);
  padding: 28rpx;
  margin-top: 24rpx;
  box-shadow: var(--sh-2);
}
.fam-card--press {
  background: var(--c-primary-wash);
}
.fam-card__icon {
  width: 80rpx;
  height: 80rpx;
  flex: none;
  border-radius: var(--r-md);
  background: var(--c-primary-tint);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 44rpx;
}
.fam-card__body {
  flex: 1;
  margin-left: 20rpx;
}
.fam-card__title {
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--c-text);
}
.fam-card__sub {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 6rpx;
}
.fam-card__role {
  font-size: var(--fs-tiny);
  color: var(--c-primary-deep);
  background: var(--c-primary-tint);
  padding: 2rpx 14rpx;
  border-radius: var(--r-pill);
}
.fam-card__hint {
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}
.fam-card__arrow {
  font-size: 36rpx;
  color: var(--c-text-3);
}

.menu {
  background: var(--c-card);
  border-radius: var(--r-md);
  margin-top: 24rpx;
  box-shadow: var(--sh-1);
  padding: 0 28rpx;
}
.menu__row {
  display: flex;
  align-items: center;
  height: 96rpx;
  border-bottom: 2rpx solid var(--c-divider);
}
.menu__row:last-child {
  border-bottom: none;
}
.menu__row--press {
  background: var(--c-bg-sink);
}
.menu__label {
  flex: 1;
  font-size: var(--fs-body);
  color: var(--c-text);
}
.menu__arrow {
  font-size: 32rpx;
  color: var(--c-text-3);
}
.menu__val {
  font-size: var(--fs-sub);
  color: var(--c-text-3);
}
.foot {
  display: block;
  text-align: center;
  margin-top: 40rpx;
  font-size: var(--fs-tiny);
  color: var(--c-text-3);
}
</style>
