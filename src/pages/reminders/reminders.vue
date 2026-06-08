<template>
  <view class="page">
    <view v-if="list.length" class="rm-list">
      <view v-for="r in list" :key="r._id" class="rm-card" :class="{ 'rm-card--overdue': dayDiff(r.next_date) < 0 }">
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
          <text class="rm-op rm-op--done" @click="markDone(r)">✓ 完成</text>
          <text class="rm-op rm-op--snooze" @click="snooze(r)">延后7天</text>
          <text class="rm-op rm-op--del" @click="remove(r)">删除</text>
        </view>
      </view>
    </view>
    <view v-else class="empty">
      <view class="empty__art">⏰</view>
      <text class="empty__title">暂无提醒，一切安好</text>
      <text class="empty__desc">回首页说一句「下月15号给示例狗打疫苗」「每月给猫驱虫」，AI 会自动设上</text>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { callFn } from '@/cloud'

export default {
  data() {
    return { list: [], today: '' }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV) return
      try {
        const res = await callFn('reminders', { action: 'list' })
        if (res.result && res.result.ok) {
          this.list = res.result.data || []
          this.today = res.result.today || ''
        }
      } catch (e) {
        console.warn('reminders load failed', e)
      }
      // #endif
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
          this.load()
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
          this.load()
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
              this.load()
            }
          } catch (e) {
            uni.showToast({ title: '删除失败', icon: 'none' })
          }
        },
      })
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
}
.rm-list {
  padding: 24rpx var(--pad-page) 40rpx;
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

/* 空状态 */
.empty {
  padding: 160rpx var(--pad-page);
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
