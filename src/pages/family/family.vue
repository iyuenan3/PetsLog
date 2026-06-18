<template>
  <view class="page">
    <!-- 我的家庭 -->
    <view class="sec">
      <text class="sec__title">我的家庭</text>
      <view class="card">
        <view
          v-for="f in families"
          :key="f.family_id"
          class="fam-row"
          hover-class="row--press"
          hover-stay-time="60"
          @click="switchTo(f.family_id)"
        >
          <view class="fam-row__main">
            <text class="fam-row__name">{{ f.name }}</text>
            <text class="fam-row__role">{{ f.role === 'admin' ? '管理员' : '成员' }}</text>
          </view>
          <text v-if="f.family_id === activeId" class="fam-row__active">✓ 当前</text>
          <text v-else class="fam-row__switch">切换</text>
        </view>
      </view>
      <view class="acts">
        <button class="btn-outline btn-half" hover-class="btn-outline--press" hover-stay-time="60" @click="createFamily">＋ 创建家庭</button>
        <button class="btn-outline btn-half" hover-class="btn-outline--press" hover-stay-time="60" @click="joinFamily">输码加入</button>
      </view>
    </view>

    <!-- 当前家庭 -->
    <view class="sec" v-if="current">
      <view class="sec__head">
        <text class="sec__title">{{ current.name }} · 成员</text>
        <text v-if="isAdmin" class="sec__edit" hover-class="sec__edit--press" hover-stay-time="60" @click="rename">改名</text>
      </view>
      <view class="card">
        <view v-for="m in members" :key="m.openid" class="mem-row" hover-class="row--press" hover-stay-time="60" @click="memberTap(m)">
          <view class="mem-row__avatar">
            <image v-if="m.avatar" :src="m.avatar" class="mem-row__avatar-img" mode="aspectFill"></image>
            <text v-else>{{ monogram(m) }}</text>
          </view>
          <view class="mem-row__main">
            <text class="mem-row__name">{{ m.nickname || ('成员 ' + m.openid.slice(-4)) }}<text v-if="m.is_me" class="mem-row__me"> (我)</text></text>
            <text v-if="isAdmin && !m.is_me" class="mem-row__hint">点击可转让 / 移除</text>
          </view>
          <text class="mem-row__role" :class="{ 'is-admin': m.role === 'admin' }">{{ m.role === 'admin' ? '管理员' : '成员' }}</text>
        </view>
      </view>
      <button v-if="isAdmin" class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" @click="genInvite"><image class="ic ic--sm" src="/static/icon/key.png" mode="aspectFit" /><text>生成邀请码</text></button>
      <text class="leave" hover-class="leave--press" hover-stay-time="60" @click="leave">退出该家庭</text>
    </view>
  </view>
</template>

<script>
import { ensureFamily, refreshFamilies, getFamilyId, setActiveFamily, callFn } from '@/cloud'

export default {
  data() {
    return { families: [], activeId: '', current: null, members: [] }
  },
  computed: {
    isAdmin() {
      return !!(this.current && this.current.my_role === 'admin')
    },
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      // #ifdef MP-WEIXIN
      await ensureFamily()
      this.families = await refreshFamilies()
      this.activeId = getFamilyId()
      await this.loadCurrent()
      // #endif
    },
    async loadCurrent() {
      const g = await callFn('family', { action: 'get', family_id: this.activeId })
      if (!(g.result && g.result.ok)) {
        this.current = null
        this.members = []
        return false
      }
      this.current = g.result.data
      const m = await callFn('family', { action: 'members', family_id: this.activeId })
      this.members = m.result && m.result.ok ? m.result.data || [] : []
      return true
    },
    monogram(m) {
      if (m.nickname) return m.nickname.slice(0, 1)
      return m.role === 'admin' ? '管' : '宠'
    },
    async switchTo(id) {
      if (id === this.activeId) return
      const prev = this.activeId
      setActiveFamily(id)
      this.activeId = id
      const ok = await this.loadCurrent()
      if (!ok) {
        // 切换目标已不可用（被踢 / 解散 / 列表是旧快照）：回滚，不污染全局 active
        setActiveFamily(prev)
        this.activeId = prev
        await this.loadCurrent()
        this.families = await refreshFamilies()
        uni.showToast({ title: '该家庭已不可用', icon: 'none' })
        return
      }
      this.families = await refreshFamilies()
      uni.showToast({ title: '已切换家庭', icon: 'success' })
    },
    rename() {
      uni.showModal({
        title: '家庭改名',
        editable: true,
        placeholderText: '输入新的家庭名',
        success: async (r) => {
          if (!r.confirm) return
          const name = String(r.content || '').trim()
          if (!name) return
          const res = await callFn('family', { action: 'rename', family_id: this.activeId, name })
          if (res.result && res.result.ok) {
            uni.showToast({ title: '已改名', icon: 'success' })
            this.load()
          } else uni.showToast({ title: (res.result && res.result.msg) || '失败', icon: 'none' })
        },
      })
    },
    memberTap(m) {
      if (!this.isAdmin || m.is_me) return
      uni.showActionSheet({
        itemList: ['设为管理员(转让)', '移除该成员'],
        success: (r) => {
          if (r.tapIndex === 0) this.transfer(m)
          else if (r.tapIndex === 1) this.kick(m)
        },
      })
    },
    transfer(m) {
      uni.showModal({
        title: '转让管理员',
        content: `把管理员转给「${m.nickname || '该成员'}」？你将变为普通成员。`,
        success: async (r) => {
          if (!r.confirm) return
          const res = await callFn('family', { action: 'transferAdmin', family_id: this.activeId, openid: m.openid })
          if (res.result && res.result.ok) {
            uni.showToast({ title: '已转让', icon: 'success' })
            this.load()
          } else uni.showToast({ title: (res.result && res.result.msg) || '失败', icon: 'none' })
        },
      })
    },
    kick(m) {
      uni.showModal({
        title: '移除成员',
        content: `把「${m.nickname || '该成员'}」移出家庭？其记录会保留在家庭里。`,
        confirmColor: '#e05d4e',
        success: async (r) => {
          if (!r.confirm) return
          const res = await callFn('family', { action: 'removeMember', family_id: this.activeId, openid: m.openid })
          if (res.result && res.result.ok) {
            uni.showToast({ title: '已移除', icon: 'success' })
            this.loadCurrent()
          } else uni.showToast({ title: (res.result && res.result.msg) || '失败', icon: 'none' })
        },
      })
    },
    genInvite() {
      callFn('family', { action: 'invite', family_id: this.activeId }).then((res) => {
        if (res.result && res.result.ok) {
          const code = res.result.code
          uni.showModal({
            title: '邀请码',
            content: `${code}\n\n7 天内有效。把它发给家人，在「输码加入」处输入即可加入本家庭。`,
            confirmText: '复制邀请码',
            success: (r) => {
              if (r.confirm) uni.setClipboardData({ data: code })
            },
          })
        } else uni.showToast({ title: (res.result && res.result.msg) || '失败', icon: 'none' })
      }).catch(() => uni.showToast({ title: '生成失败', icon: 'none' }))
    },
    leave() {
      uni.showModal({
        title: '退出家庭',
        content: '退出后将看不到该家庭的数据。如你是管理员，需先转让管理员。',
        confirmColor: '#e05d4e',
        success: async (r) => {
          if (!r.confirm) return
          const res = await callFn('family', { action: 'leave', family_id: this.activeId })
          const rr = res.result || {}
          if (rr.ok) {
            uni.showToast({ title: '已退出', icon: 'success' })
            // 退出后切到剩下的第一个家庭，没有则 bootstrap 会重建「我的家」
            const rest = (await refreshFamilies()).filter((f) => f.family_id !== this.activeId)
            if (rest.length) {
              setActiveFamily(rest[0].family_id)
              this.activeId = rest[0].family_id
              this.load()
            } else {
              setActiveFamily('')
              setTimeout(() => uni.navigateBack(), 500)
            }
          } else {
            uni.showToast({ title: rr.msg || '退出失败', icon: 'none' })
          }
        },
      })
    },
    createFamily() {
      uni.showModal({
        title: '创建家庭',
        editable: true,
        placeholderText: '给新家庭起个名',
        success: async (r) => {
          if (!r.confirm) return
          const name = String(r.content || '').trim() || '我的家'
          const res = await callFn('family', { action: 'create', name })
          if (res.result && res.result.ok) {
            setActiveFamily(res.result.family_id)
            this.activeId = res.result.family_id
            uni.showToast({ title: '已创建', icon: 'success' })
            this.load()
          } else uni.showToast({ title: (res.result && res.result.msg) || '失败', icon: 'none' })
        },
      })
    },
    joinFamily() {
      uni.showModal({
        title: '加入家庭',
        editable: true,
        placeholderText: '输入 6 位邀请码',
        success: async (r) => {
          if (!r.confirm) return
          const code = String(r.content || '').trim()
          if (!code) return
          const res = await callFn('family', { action: 'join', code })
          const rr = res.result || {}
          if (rr.ok) {
            setActiveFamily(rr.family_id)
            this.activeId = rr.family_id
            uni.showToast({ title: rr.already ? '你已在该家庭' : '已加入', icon: 'success' })
            this.load()
          } else uni.showToast({ title: rr.msg || '加入失败', icon: 'none' })
        },
      })
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
  padding: 24rpx var(--pad-page) 48rpx;
}
.sec {
  margin-bottom: 36rpx;
}
.sec__head {
  display: flex;
  align-items: center;
}
.sec__title {
  font-size: var(--fs-sub);
  font-weight: 600;
  color: var(--c-text-2);
  margin: 8rpx 8rpx 16rpx;
}
.sec__head .sec__title {
  flex: 1;
}
.sec__edit {
  font-size: var(--fs-sub);
  color: var(--c-primary-deep);
  margin-right: 8rpx;
}
.sec__edit--press {
  opacity: 0.55;
}
.card {
  background: var(--c-card);
  border-radius: var(--r-md);
  padding: 0 28rpx;
  box-shadow: var(--sh-2);
}
.row--press {
  background: var(--c-bg-sink);
}

.fam-row {
  display: flex;
  align-items: center;
  height: 104rpx;
  border-bottom: 2rpx solid var(--c-divider);
}
.fam-row:last-child {
  border-bottom: none;
}
.fam-row__main {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.fam-row__name {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--c-text);
}
.fam-row__role {
  font-size: var(--fs-tiny);
  color: var(--c-text-2);
  background: var(--c-bg-sink);
  padding: 2rpx 14rpx;
  border-radius: var(--r-pill);
}
.fam-row__active {
  font-size: var(--fs-cap);
  color: var(--c-primary-deep);
  font-weight: 600;
}
.fam-row__switch {
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}

.acts {
  display: flex;
  gap: 20rpx;
  margin-top: 20rpx;
}
.btn-half {
  flex: 1;
}
.btn-outline {
  height: 84rpx;
  line-height: 84rpx;
  border-radius: var(--r-pill);
  background: var(--c-card);
  border: 2rpx solid var(--c-border);
  color: var(--c-text);
  font-size: var(--fs-sub);
  font-weight: 500;
}
.btn-outline--press {
  background: var(--c-bg-sink);
}

.mem-row {
  display: flex;
  align-items: center;
  min-height: 110rpx;
  padding: 18rpx 0;
  border-bottom: 2rpx solid var(--c-divider);
}
.mem-row:last-child {
  border-bottom: none;
}
.mem-row__avatar {
  width: 72rpx;
  height: 72rpx;
  flex: none;
  border-radius: var(--r-pill);
  overflow: hidden;
  background: radial-gradient(circle at 50% 38%, #fff3ec 0%, var(--c-primary-tint) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  color: var(--c-primary-deep);
  font-weight: 600;
}
.mem-row__avatar-img {
  width: 100%;
  height: 100%;
}
.mem-row__main {
  flex: 1;
  margin-left: 20rpx;
  display: flex;
  flex-direction: column;
}
.mem-row__name {
  font-size: var(--fs-body);
  color: var(--c-text);
  font-weight: 500;
}
.mem-row__me {
  font-size: var(--fs-cap);
  color: var(--c-text-3);
  font-weight: 400;
}
.mem-row__hint {
  font-size: var(--fs-tiny);
  color: var(--c-text-3);
  margin-top: 4rpx;
}
.mem-row__role {
  font-size: var(--fs-tiny);
  color: var(--c-text-2);
  background: var(--c-bg-sink);
  padding: 4rpx 16rpx;
  border-radius: var(--r-pill);
}
.mem-row__role.is-admin {
  color: var(--c-primary-deep);
  background: var(--c-primary-tint);
}

.btn-primary {
  margin-top: 24rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: var(--r-pill);
  background: var(--c-primary-grad);
  color: var(--c-text-inv);
  font-size: var(--fs-sub);
  font-weight: 600;
  box-shadow: var(--sh-primary);
}
.btn-primary--press {
  transform: scale(0.98);
  box-shadow: var(--sh-press);
}
.leave {
  display: block;
  text-align: center;
  margin-top: 32rpx;
  font-size: var(--fs-cap);
  color: var(--c-danger);
}
.leave--press {
  opacity: 0.55;
}
</style>
