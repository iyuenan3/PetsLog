<template>
  <view class="page">
    <!-- 病程入口条（ADR-019）：chip 全集由 list_tags 提供（分页全扫，含被挤出前 50 条的老病程，修「老病程无入口」bug）；
         点 chip 跳病程完整视图（不带 pet → 跨宠时 course 内再下钻），与记录内联 🏷️ 同语义为「入口」非「本地过滤」 -->
    <scroll-view v-if="courseTags.length" scroll-x class="tl-filter" :show-scrollbar="false">
      <view class="tl-filter__inner">
        <text
          v-for="t in courseTags"
          :key="t"
          class="tl-filter__chip"
          hover-class="tl-filter__chip--press"
          hover-stay-time="60"
          @click="goCourse(t)"
        >🏷️ {{ t }}</text>
      </view>
    </scroll-view>

    <view v-if="records.length" class="tl-list">
      <view v-for="r in records" :key="r._id" class="tl-item" @click="openDetail(r)">
        <view class="tl-item__head">
          <view class="tl-dot" :class="eventClass(r.event_type)"></view>
          <text class="tl-item__pet">{{ r.pet || '未指定' }}</text>
          <text class="tl-chip" :class="eventClass(r.event_type)">{{ r.event_type }}</text>
          <text class="tl-item__time">{{ shortDate(r.time) }}</text>
        </view>
        <text v-if="r.raw || r.desc" class="tl-item__quote">{{ r.raw || r.desc }}</text>
        <view v-if="r.weight || r.med || r.hospital || r.cost != null || r.tag || r.att_count" class="tl-item__notes">
          <text v-if="r.weight" class="tl-note">⚖️ {{ r.weight }}kg</text>
          <text v-if="r.med" class="tl-note">💊 {{ r.med }}</text>
          <text v-if="r.hospital" class="tl-note">🏥 {{ r.hospital }}</text>
          <text v-if="r.cost != null" class="tl-note">💰 ¥{{ r.cost }}</text>
          <text v-if="r.att_count" class="tl-note">📎 {{ r.att_count }}</text>
          <text v-if="r.tag" class="tl-note tl-note--tag" hover-class="tl-note--tag-press" hover-stay-time="60" @click.stop="goCourse(r.tag, r.pet)">🏷️ {{ r.tag }} ›</text>
        </view>
      </view>
    </view>
    <view v-else class="empty">
      <view class="empty__art">📖</view>
      <text class="empty__title">还没有健康记录</text>
      <text class="empty__desc">点底部 ＋ 说句话，AI 会自动把记录归档到这里</text>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { callFn } from '@/cloud'
import { syncTab } from '@/tabSync'

export default {
  data() {
    return { records: [], courseTags: [] }
  },
  onShow() {
    syncTab(this, 1)
    this.load()
  },
  methods: {
    // 进病程完整视图（ADR-019）：带 pet 看该宠该病程从头到尾全部记录 + 概览（突破时间线 50 条截断）
    goCourse(tag, pet) {
      if (!tag) return
      uni.navigateTo({ url: `/pages/course/course?tag=${encodeURIComponent(tag)}${pet ? '&pet=' + encodeURIComponent(pet) : ''}` })
    },
    // 进记录详情（看 / 补附件、删记录）；返回后 onShow 自动刷新
    openDetail(r) {
      uni.navigateTo({ url: `/pages/record-detail/record-detail?id=${r._id}` })
    },
    eventClass(t) {
      return { 症状: 'ev-symptom', 用药: 'ev-med', 疫苗: 'ev-vaccine', 驱虫: 'ev-deworm', 体重: 'ev-weight', 就医: 'ev-clinic' }[t] || 'ev-other'
    },
    shortDate(d) {
      return d ? String(d).slice(5) : ''
    },
    async load() {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV) return
      try {
        // 并发：时间线记录（默认前 50 条）+ 病程 tag 全集（list_tags 全扫，不受 50 限，供入口条 chip）
        const [list, tagsRes] = await Promise.all([
          callFn('timeline', { action: 'list' }),
          callFn('timeline', { action: 'list_tags' }),
        ])
        if (list.result && list.result.ok) this.records = list.result.data || []
        if (tagsRes.result && tagsRes.result.ok) this.courseTags = tagsRes.result.tags || []
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
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
/* 病程筛选条 */
.tl-filter {
  white-space: nowrap;
  padding: 20rpx 0 4rpx;
}
.tl-filter__inner {
  display: inline-flex;
  gap: 14rpx;
  padding: 0 var(--pad-page);
}
.tl-filter__chip {
  flex: none;
  height: 56rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-pill);
  background: var(--c-card);
  border: 2rpx solid var(--c-border);
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}
.tl-filter__chip--press {
  background: var(--c-primary-tint);
  border-color: var(--c-primary);
  color: var(--c-primary-deep);
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
/* 病程标签：可点击跳病程视图，主色调 + 边框 + › 提示「可点」，热区放大 */
.tl-note--tag {
  padding: 10rpx 20rpx;
  background: var(--c-primary-wash);
  color: var(--c-primary-deep);
  border: 2rpx solid var(--c-primary-tint);
  font-weight: 500;
}
.tl-note--tag-press {
  background: var(--c-primary-tint);
}

/* 事件类型配色：点（带柔晕环）+ 标签 */
.tl-dot.ev-symptom { background: var(--c-danger); box-shadow: 0 0 0 6rpx var(--c-danger-tint); }
.tl-dot.ev-med { background: var(--c-rt-med); box-shadow: 0 0 0 6rpx var(--c-rt-med-bg); }
.tl-dot.ev-vaccine { background: var(--c-rt-vaccine); box-shadow: 0 0 0 6rpx var(--c-rt-vaccine-bg); }
.tl-dot.ev-deworm { background: var(--c-rt-deworm); box-shadow: 0 0 0 6rpx var(--c-rt-deworm-bg); }
.tl-dot.ev-weight { background: var(--c-success); box-shadow: 0 0 0 6rpx var(--c-success-tint); }
.tl-dot.ev-clinic { background: var(--c-rt-other); box-shadow: 0 0 0 6rpx var(--c-rt-other-bg); }
.tl-dot.ev-other { background: var(--c-text-3); box-shadow: 0 0 0 6rpx var(--c-bg-sink); }

.tl-chip.ev-symptom { color: var(--c-danger); background: var(--c-danger-tint); }
.tl-chip.ev-med { color: var(--c-rt-med); background: var(--c-rt-med-bg); }
.tl-chip.ev-vaccine { color: var(--c-rt-vaccine); background: var(--c-rt-vaccine-bg); }
.tl-chip.ev-deworm { color: var(--c-rt-deworm); background: var(--c-rt-deworm-bg); }
.tl-chip.ev-weight { color: var(--c-success); background: var(--c-success-tint); }
.tl-chip.ev-clinic { color: var(--c-rt-other); background: var(--c-rt-other-bg); }
.tl-chip.ev-other { color: var(--c-text-2); background: var(--c-bg-sink); }

/* 空状态：.empty/.empty__art/.empty__title/.empty__desc 已抽到 App.vue 全局（Round 2） */
</style>
