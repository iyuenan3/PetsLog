<template>
  <view class="page">
    <view v-if="records.length" class="tl-list">
      <view v-for="r in records" :key="r._id" class="tl-item">
        <view class="tl-item__head">
          <view class="tl-dot" :class="eventClass(r.event_type)"></view>
          <text class="tl-item__pet">{{ r.pet || '未指定' }}</text>
          <text class="tl-chip" :class="eventClass(r.event_type)">{{ r.event_type }}</text>
          <text class="tl-item__time">{{ shortDate(r.time) }}</text>
        </view>
        <text class="tl-item__quote">{{ r.raw }}</text>
        <view v-if="r.weight || r.med" class="tl-item__notes">
          <text v-if="r.weight" class="tl-note">⚖️ {{ r.weight }}kg</text>
          <text v-if="r.med" class="tl-note">💊 {{ r.med }}</text>
        </view>
      </view>
    </view>
    <view v-else class="empty">
      <view class="empty__art">📖</view>
      <text class="empty__title">还没有健康记录</text>
      <text class="empty__desc">回首页对它说句话，AI 会自动把记录归档到这里</text>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { callFn } from '@/cloud'

export default {
  data() {
    return { records: [] }
  },
  onShow() {
    this.load()
  },
  methods: {
    eventClass(t) {
      return { 症状: 'ev-symptom', 用药: 'ev-med', 疫苗: 'ev-vaccine', 体重: 'ev-weight', 就医: 'ev-clinic' }[t] || 'ev-other'
    },
    shortDate(d) {
      return d ? String(d).slice(5) : ''
    },
    async load() {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV) return
      try {
        const res = await callFn('timeline', { action: 'list' })
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
.page {
  min-height: 100vh;
}
.tl-list {
  padding: 24rpx var(--pad-page) 40rpx;
}
.tl-item {
  background: var(--c-card);
  border-radius: var(--r-md);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--sh-2);
}
.tl-item__head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 14rpx;
}
.tl-dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: var(--r-pill);
  flex: none;
}
.tl-item__pet {
  font-size: var(--fs-sub);
  font-weight: 600;
  color: var(--c-text);
}
.tl-chip {
  height: 40rpx;
  padding: 0 18rpx;
  border-radius: var(--r-pill);
  font-size: var(--fs-tiny);
  font-weight: 600;
  display: flex;
  align-items: center;
}
.tl-item__time {
  margin-left: auto;
  font-size: var(--fs-tiny);
  color: var(--c-text-3);
}
.tl-item__quote {
  display: block;
  font-size: var(--fs-body);
  color: var(--c-text);
  line-height: 1.55;
}
.tl-item__notes {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}
.tl-note {
  padding: 8rpx 18rpx;
  background: var(--c-bg-sink);
  border-radius: var(--r-sm);
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}

/* 事件类型配色：点（带柔晕环）+ 标签 */
.tl-dot.ev-symptom { background: var(--c-danger); box-shadow: 0 0 0 6rpx var(--c-danger-tint); }
.tl-dot.ev-med { background: var(--c-rt-med); box-shadow: 0 0 0 6rpx var(--c-rt-med-bg); }
.tl-dot.ev-vaccine { background: var(--c-rt-vaccine); box-shadow: 0 0 0 6rpx var(--c-rt-vaccine-bg); }
.tl-dot.ev-weight { background: var(--c-success); box-shadow: 0 0 0 6rpx var(--c-success-tint); }
.tl-dot.ev-clinic { background: var(--c-rt-other); box-shadow: 0 0 0 6rpx var(--c-rt-other-bg); }
.tl-dot.ev-other { background: var(--c-text-3); box-shadow: 0 0 0 6rpx var(--c-bg-sink); }

.tl-chip.ev-symptom { color: var(--c-danger); background: var(--c-danger-tint); }
.tl-chip.ev-med { color: var(--c-rt-med); background: var(--c-rt-med-bg); }
.tl-chip.ev-vaccine { color: var(--c-rt-vaccine); background: var(--c-rt-vaccine-bg); }
.tl-chip.ev-weight { color: var(--c-success); background: var(--c-success-tint); }
.tl-chip.ev-clinic { color: var(--c-rt-other); background: var(--c-rt-other-bg); }
.tl-chip.ev-other { color: var(--c-text-2); background: var(--c-bg-sink); }

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
}
</style>
