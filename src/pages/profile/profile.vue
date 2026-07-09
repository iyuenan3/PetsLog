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
        <input class="frow__input" type="nickname" :value="nickname" :focus="nickFocus" @input="onNick" @blur="onNickBlur" placeholder="点此填写昵称" placeholder-class="ph" />
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
    return { nickname: '', avatar: '', saving: false, uploadingAvatar: false, nickFocus: false, editBaseline: '' }
  },
  async onLoad() {
    // #ifdef MP-WEIXIN
    const p = await getProfile(true)
    this.nickname = p.nickname || ''
    this.avatar = p.avatar || ''
    this._savedAvatar = this.avatar // 已落库头像，用于离开时判「本次上传未保存」的孤儿
    this.snapshotForm()
    // #endif
  },
  onUnload() {
    // 用户在「未保存离开」确认里选了离开 → 撤拦截 + 清掉本次上传未落库的头像（避免云存储孤儿，对齐 pet.vue ADR-032）
    this.toggleLeaveGuard(false)
    this.discardTempAvatar()
  },
  computed: {
    // 昵称 / 头像偏离进页快照 = 有未保存改动 → 开离开前确认（ADR-032 推广到 profile：成员选了头像没保存就退 → 无 users 文档 → 成员列表显默认「家人」）。
    // profile 全程编辑态，无需 pet.vue 那个 editing 门。
    leaveGuardOn() {
      return this.editBaseline !== '' && JSON.stringify({ nickname: this.nickname, avatar: this.avatar }) !== this.editBaseline
    },
  },
  watch: {
    leaveGuardOn(on) {
      this.toggleLeaveGuard(on)
    },
  },
  methods: {
    snapshotForm() {
      this.editBaseline = JSON.stringify({ nickname: this.nickname, avatar: this.avatar })
    },
    // mp-weixin 的 onBackPress 不拦原生返回，故用官方 enableAlertBeforeUnload（拦顶部返回 + 左滑手势 + 安卓实体键）。
    toggleLeaveGuard(on) {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined') return
      if (on) {
        if (typeof wx.enableAlertBeforeUnload === 'function') wx.enableAlertBeforeUnload({ message: '头像 / 昵称尚未保存，确定离开吗？' })
      } else if (typeof wx.disableAlertBeforeUnload === 'function') {
        wx.disableAlertBeforeUnload()
      }
      // #endif
    },
    // 删本次上传但未落库的头像（this.avatar ≠ 库内已存 → 是新传的孤儿），对齐 pet.vue discardTempAvatar。
    discardTempAvatar() {
      const saved = this._savedAvatar || ''
      const tmp = this.avatar
      // #ifdef MP-WEIXIN
      if (tmp && tmp !== saved && typeof wx !== 'undefined' && wx.cloud) {
        wx.cloud.deleteFile({ fileList: [tmp] }).catch(() => {})
      }
      // #endif
    },
    onNick(e) {
      // type="nickname" 的微信昵称自动填充走 blur，v-model 只听 input 会漏，显式兜住
      this.nickname = (e.detail && e.detail.value) || ''
    },
    onNickBlur(e) {
      this.onNick(e)
      this.nickFocus = false // 收键盘后复位，避免 :focus 绑定反复抢焦点
    },
    async onChooseAvatar(e) {
      const url = e.detail && e.detail.avatarUrl
      if (!url) return
      this.uploadingAvatar = true // 兜底 mask 之外再加标志（mask 若被竞态/某基础库绕过，save 仍拒），对齐 pet.vue 防御纵深
      uni.showLoading({ title: '上传中…', mask: true }) // mask 挡住上传期间点保存（this.avatar 未就位会存旧/空头像），对齐 pet.vue
      try {
        const next = await uploadAvatar(url)
        this.discardTempAvatar() // 反复换图：新图传成后删上一张未落库的（先删后传若上传失败会指向已删文件）
        this.avatar = next
      } catch (err) {
        uni.showToast({ title: '头像上传失败', icon: 'none' })
      } finally {
        this.uploadingAvatar = false
        uni.hideLoading()
      }
      // 选完头像、昵称还空 → 自动聚焦昵称输入框（弹出「使用微信昵称」），把头像 + 昵称串成一气呵成、少点一下
      if (this.avatar && !this.nickname) {
        setTimeout(() => { this.nickFocus = true }, 300)
      }
    },
    async save() {
      if (this.uploadingAvatar) {
        // 头像还在上传（this.avatar 未就位）：此刻存会落旧/空头像。挡住等传完（mask 之外的兜底，对齐 pet.vue）
        uni.showToast({ title: '头像上传中，请稍候', icon: 'none' })
        return
      }
      if (this.saving) return // 双击守卫（:loading 在 mp-weixin 不拦点击）：防两次并发 updateProfile
      this.saving = true
      try {
        const res = await updateProfile({ nickname: String(this.nickname || '').trim(), avatar: this.avatar })
        if (res.result && res.result.ok) {
          this._savedAvatar = this.avatar // 已落库，更新「已存头像」基准，避免 onUnload 误删
          this.editBaseline = '' // 撤离开拦截（leaveGuardOn 转 false）
          this.toggleLeaveGuard(false) // navigateBack 前显式撤，防编程式返回再弹一次
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
  border-bottom: 1px solid var(--c-divider);
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
