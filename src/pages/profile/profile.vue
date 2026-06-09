<template>
  <view class="page">
    <view class="card">
      <view class="frow">
        <text class="frow__label">头像</text>
        <button class="avatar-btn" hover-class="avatar-btn--press" hover-stay-time="60" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
          <image v-if="avatar" :src="avatar" class="avatar-img" mode="aspectFill"></image>
          <text v-else class="avatar-ph">＋</text>
        </button>
      </view>
      <view class="frow">
        <text class="frow__label">昵称</text>
        <input class="frow__input" type="nickname" :value="nickname" @input="onNick" @blur="onNick" placeholder="点此填写昵称" placeholder-class="ph" />
      </view>
    </view>

    <text class="tip">头像与昵称仅用于家庭内显示，存于你的微信云环境。</text>

    <button class="save" hover-class="save--press" hover-stay-time="60" :loading="saving" @click="save">保存</button>
  </view>
</template>

<script>
import { getProfile, updateProfile, uploadAvatar } from '@/cloud'

export default {
  data() {
    return { nickname: '', avatar: '', saving: false }
  },
  async onLoad() {
    // #ifdef MP-WEIXIN
    const p = await getProfile(true)
    this.nickname = p.nickname || ''
    this.avatar = p.avatar || ''
    // #endif
  },
  methods: {
    onNick(e) {
      // type="nickname" 的微信昵称自动填充走 blur，v-model 只听 input 会漏，显式兜住
      this.nickname = (e.detail && e.detail.value) || ''
    },
    async onChooseAvatar(e) {
      const url = e.detail && e.detail.avatarUrl
      if (!url) return
      uni.showLoading({ title: '上传中…' })
      try {
        this.avatar = await uploadAvatar(url)
      } catch (err) {
        uni.showToast({ title: '头像上传失败', icon: 'none' })
      }
      uni.hideLoading()
    },
    async save() {
      this.saving = true
      try {
        const res = await updateProfile({ nickname: String(this.nickname || '').trim(), avatar: this.avatar })
        if (res.result && res.result.ok) {
          uni.showToast({ title: '已保存', icon: 'success' })
          setTimeout(() => uni.navigateBack(), 500)
        } else {
          uni.showToast({ title: '保存失败', icon: 'none' })
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
  padding: 24rpx var(--pad-page);
}
.card {
  background: var(--c-card);
  border-radius: var(--r-lg);
  padding: 8rpx 32rpx;
  box-shadow: var(--sh-2);
}
.frow {
  display: flex;
  align-items: center;
  min-height: 120rpx;
  padding: 20rpx 0;
  border-bottom: 2rpx solid var(--c-divider);
}
.frow:last-child {
  border-bottom: none;
}
.frow__label {
  width: 120rpx;
  flex: none;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
}
.frow__input {
  flex: 1;
  font-size: var(--fs-body);
  color: var(--c-text);
  text-align: right;
}
.ph {
  color: var(--c-text-3);
}
.avatar-btn {
  margin-left: auto;
  margin-right: 0;
  width: 112rpx;
  height: 112rpx;
  padding: 0;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.avatar-btn::after {
  border: none;
}
.avatar-btn--press {
  background: var(--c-divider);
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.avatar-ph {
  font-size: 48rpx;
  color: var(--c-text-3);
}
.tip {
  display: block;
  margin: 20rpx 8rpx 0;
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}
.save {
  margin-top: 40rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: var(--r-pill);
  background: var(--c-primary-grad);
  color: var(--c-text-inv);
  font-size: var(--fs-body);
  font-weight: 600;
  box-shadow: var(--sh-primary);
}
.save--press {
  transform: scale(0.98);
  box-shadow: var(--sh-press);
}
</style>
