<template>
  <view class="page">
    <!-- 顶部分段：提醒 | 药品 -->
    <view class="seg">
      <view class="seg__item" :class="{ 'seg__item--on': tab === 'rem' }" hover-class="seg__item--press" hover-stay-time="60" @click="switchTab('rem')">提醒</view>
      <view class="seg__item" :class="{ 'seg__item--on': tab === 'med' }" hover-class="seg__item--press" hover-stay-time="60" @click="switchTab('med')">药品</view>
    </view>

    <!-- ===== 提醒 ===== -->
    <block v-if="tab === 'rem'">
      <view v-if="reminders.length" class="rm-list">
        <view v-for="r in reminders" :key="r._id" class="rm-card" :class="{ 'rm-card--overdue': dayDiff(r.next_date) < 0 }">
          <view class="rm-card__head">
            <text class="chip-tag" :class="'chip-tag--' + tagClass(r.type)">{{ r.type }}</text>
            <text class="rm-card__title">{{ r.title || '(未命名提醒)' }}</text>
          </view>
          <view class="rm-card__sub">
            <text v-if="r.pet" class="rm-card__pet">{{ r.pet }}</text>
            <text class="rm-card__due" :class="dueClass(r.next_date)">{{ dateLabel(r.next_date) }}</text>
            <text v-if="r.repeat_days" class="rm-card__repeat">· {{ repeatText(r.repeat_days) }}</text>
          </view>
          <view class="rm-card__ops">
            <text class="rm-op rm-op--done" hover-class="rm-op--press" hover-stay-time="60" @click="markDone(r)">✓ 完成</text>
            <text class="rm-op rm-op--snooze" hover-class="rm-op--press" hover-stay-time="60" @click="snooze(r)">延后7天</text>
            <text class="rm-op rm-op--del" hover-class="rm-op--press" hover-stay-time="60" @click="remove(r)">删除</text>
          </view>
        </view>
      </view>
      <view v-else class="empty">
        <view class="empty__art">⏰</view>
        <text class="empty__title">暂无提醒，一切安好</text>
        <text class="empty__desc">点底部 ＋ 说一句「下月15号给示例狗打疫苗」「每月给猫驱虫」，AI 会自动设上</text>
      </view>
    </block>

    <!-- ===== 药品 ===== -->
    <block v-else>
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
        <text class="empty__desc">点底部 ＋ 说一句「买了盒驱虫药，2 支，明年3月过期」，自动入库</text>
      </view>
    </block>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { callFn } from '@/cloud'

export default {
  data() {
    return {
      tab: 'rem', // rem | med
      reminders: [],
      today: '',
      remLoaded: false,
      meds: [],
      medLoaded: false,
    }
  },
  onShow() {
    // 进入「健康」tab 时允许从首页横幅指定分段
    const want = uni.getStorageSync('health_seg')
    if (want === 'rem' || want === 'med') {
      this.tab = want
      uni.removeStorageSync('health_seg')
    }
    // 两个分段都刷新：避免切回非当前分段看到陈旧数据；并保证 this.today（服务端基准日）始终新鲜，供药品临期判定
    this.loadRem()
    this.loadMed()
  },
  methods: {
    cloudReady() {
      // #ifdef MP-WEIXIN
      return typeof wx !== 'undefined' && !!wx.cloud && !!CLOUD_ENV
      // #endif
      // eslint-disable-next-line no-unreachable
      return false
    },
    switchTab(t) {
      if (this.tab === t) return
      this.tab = t
      // onShow 已加载两段；此处仅兜底首次（onShow 未完成前）未加载的情况
      if (t === 'rem' && !this.remLoaded) this.loadRem()
      if (t === 'med' && !this.medLoaded) this.loadMed()
    },

    /* ===== 提醒 ===== */
    async loadRem() {
      if (!this.cloudReady()) return
      try {
        const res = await callFn('reminders', { action: 'list' })
        if (res.result && res.result.ok) {
          this.reminders = res.result.data || []
          this.today = res.result.today || ''
          this.remLoaded = true
        }
      } catch (e) {
        console.warn('reminders load failed', e)
      }
    },
    dayDiff(d) {
      if (!d || !this.today) return 0
      const a = new Date(String(d).replace(/-/g, '/') + ' 00:00:00').getTime()
      const b = new Date(String(this.today).replace(/-/g, '/') + ' 00:00:00').getTime()
      if (isNaN(a) || isNaN(b)) return 0
      return Math.round((a - b) / 86400000)
    },
    dateLabel(d) {
      if (!d) return '未设日期'
      const n = this.dayDiff(d)
      const md = String(d).slice(5)
      if (n < 0) return `逾期 ${-n} 天 · ${md}`
      if (n === 0) return '今天到期'
      if (n === 1) return `明天 · ${md}`
      return `还有 ${n} 天 · ${md}`
    },
    dueClass(d) {
      const n = this.dayDiff(d)
      return n < 0 ? 'rm-card__due--overdue' : n === 0 ? 'rm-card__due--today' : 'rm-card__due--future'
    },
    tagClass(t) {
      return { 疫苗: 'vaccine', 驱虫: 'deworm', 用药: 'med' }[t] || 'other'
    },
    repeatText(x) {
      if (!x) return '不重复'
      if (x % 365 === 0) return `每${x / 365}年`
      if (x % 30 === 0) return `每${x / 30}个月`
      if (x % 7 === 0) return `每${x / 7}周`
      return `每${x}天`
    },
    async markDone(r) {
      try {
        const res = await callFn('reminders', { action: 'done', id: r._id })
        if (res.result && res.result.ok) {
          uni.showToast({ title: res.result.next_date ? '已顺延到下次' : '已完成', icon: 'success' })
          this.loadRem()
        }
      } catch (e) {
        uni.showToast({ title: '操作失败', icon: 'none' })
      }
    },
    async snooze(r) {
      try {
        const res = await callFn('reminders', { action: 'snooze', id: r._id, days: 7 })
        if (res.result && res.result.ok) {
          uni.showToast({ title: '已延后 7 天', icon: 'success' })
          this.loadRem()
        }
      } catch (e) {
        uni.showToast({ title: '操作失败', icon: 'none' })
      }
    },
    remove(r) {
      uni.showModal({
        title: '删除提醒',
        content: `删除「${r.title || '该提醒'}」？`,
        confirmColor: '#e05d4e',
        success: async (m) => {
          if (!m.confirm) return
          try {
            const res = await callFn('reminders', { action: 'delete', id: r._id })
            if (res.result && res.result.ok) {
              uni.showToast({ title: '已删除', icon: 'success' })
              this.loadRem()
            }
          } catch (e) {
            uni.showToast({ title: '删除失败', icon: 'none' })
          }
        },
      })
    },

    /* ===== 药品 ===== */
    // 临期判定对齐提醒分段的服务端基准日 this.today（loadRem 取回），避免页内双时间源（设备时区/时钟偏差）
    isExpiringSoon(d) {
      if (!d || !this.today) return false
      const exp = new Date(String(d).replace(/-/g, '/') + ' 00:00:00').getTime()
      const base = new Date(String(this.today).replace(/-/g, '/') + ' 00:00:00').getTime()
      if (isNaN(exp) || isNaN(base)) return false
      return exp - base < 30 * 24 * 3600 * 1000
    },
    async loadMed() {
      if (!this.cloudReady()) return
      try {
        const res = await callFn('meds', { action: 'list' })
        if (res.result && res.result.ok) {
          const list = res.result.data || []
          // 按过期日期升序；未填过期的排最后，避免把近效期药品挤下去
          list.sort((a, b) => (a.expire_date || '9999-99-99').localeCompare(b.expire_date || '9999-99-99'))
          this.meds = list
          this.medLoaded = true
        }
      } catch (e) {
        console.warn('meds load failed', e)
      }
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

/* 分段控件 */
.seg {
  display: flex;
  background: var(--c-bg-sink);
  border-radius: var(--r-pill);
  padding: 6rpx;
  margin: 24rpx var(--pad-page) 8rpx;
}
.seg__item {
  flex: 1;
  height: 68rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-pill);
  font-size: var(--fs-sub);
  color: var(--c-text-2);
  font-weight: 500;
}
.seg__item--on {
  background: var(--c-card);
  color: var(--c-primary-deep);
  font-weight: 600;
  box-shadow: var(--sh-1);
}
.seg__item--press {
  opacity: 0.7;
}

/* ===== 提醒列表 ===== */
.rm-list {
  padding: 16rpx var(--pad-page) 8rpx;
}
.rm-card {
  position: relative;
  background: var(--c-card);
  border-radius: var(--r-md);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--sh-2);
  overflow: hidden;
}
.rm-card--overdue::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8rpx;
  background: var(--c-danger);
}
.rm-card__head {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.chip-tag {
  flex: none;
  height: 40rpx;
  padding: 0 18rpx;
  border-radius: var(--r-pill);
  font-size: var(--fs-tiny);
  font-weight: 600;
  display: flex;
  align-items: center;
}
.chip-tag--med { color: var(--c-rt-med); background: var(--c-rt-med-bg); }
.chip-tag--vaccine { color: var(--c-rt-vaccine); background: var(--c-rt-vaccine-bg); }
.chip-tag--deworm { color: var(--c-rt-deworm); background: var(--c-rt-deworm-bg); }
.chip-tag--other { color: var(--c-rt-other); background: var(--c-rt-other-bg); }
.rm-card__title {
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--c-text);
  flex: 1;
}
.rm-card__sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14rpx;
  margin-top: 16rpx;
}
.rm-card__pet {
  font-size: var(--fs-cap);
  color: var(--c-text-2);
  background: var(--c-bg-sink);
  padding: 4rpx 16rpx;
  border-radius: var(--r-pill);
}
.rm-card__due {
  font-size: var(--fs-sub);
  font-weight: 600;
}
.rm-card__due--overdue { color: var(--c-danger); }
.rm-card__due--today { color: var(--c-warning); }
.rm-card__due--future { color: var(--c-text-2); font-weight: 500; }
.rm-card__repeat {
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}
.rm-card__ops {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
}
.rm-op {
  flex: 1;
  height: 72rpx;
  border-radius: var(--r-pill);
  font-size: var(--fs-cap);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rm-op--done { background: var(--c-success-tint); color: var(--c-success); }
.rm-op--snooze { background: var(--c-bg-sink); color: var(--c-text-2); }
.rm-op--del { background: var(--c-danger-tint); color: var(--c-danger); }
.rm-op--press { opacity: 0.6; }

/* ===== 药品列表 ===== */
.med-list {
  padding: 16rpx var(--pad-page) 8rpx;
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
  padding: 140rpx var(--pad-page);
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
