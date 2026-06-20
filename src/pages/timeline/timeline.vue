<template>
  <view class="page">
    <!-- 病程入口条（ADR-019）：chip 全集由 list_tags 提供（分页全扫，含被挤出首屏分页的老病程，修「老病程无入口」bug）；
         点 chip 跳病程完整视图（不带 pet → 跨宠时 course 内再下钻），与记录内联 🏷️ 同语义为「入口」非「本地过滤」 -->
    <scroll-view v-if="courseTags.length" scroll-x class="tl-filter" :show-scrollbar="false">
      <view class="tl-filter__inner">
        <view
          v-for="t in courseTags"
          :key="t"
          class="tl-filter__chip"
          hover-class="tl-filter__chip--press"
          hover-stay-time="60"
          @click="goCourse(t)"
        ><image class="ic ic--sm" src="/static/icon/fn-tag.png" mode="aspectFit" /><text>{{ t }}</text></view>
      </view>
    </scroll-view>

    <view v-if="records.length" class="tl-list">
      <view v-for="(r, i) in records" :key="r._id" class="tl-item rise-in" hover-class="tl-item--press" hover-stay-time="60" :style="{ 'animation-delay': Math.min(i % pageSize, 10) * 36 + 'ms' }" @click="openDetail(r)">
        <view class="tl-item__head">
          <view class="tl-dot" :class="eventClass(r.event_type)"></view>
          <text class="tl-item__pet">{{ r.pet || '未指定' }}</text>
          <text class="tl-chip" :class="eventClass(r.event_type)">{{ r.event_type }}</text>
          <text class="tl-item__time">{{ shortDate(r.time) }}</text>
        </view>
        <text v-if="r.raw || r.desc" class="tl-item__quote">{{ r.raw || r.desc }}</text>
        <view v-if="r.weight || r.med || r.hospital || r.cost != null || r.tag || r.att_count || r.params" class="tl-item__notes">
          <view v-if="r.weight" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-weight.png" mode="aspectFit" /><text>{{ r.weight }}kg</text></view>
          <view v-for="pp in fmtParams(r.params)" :key="pp.key" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-param.png" mode="aspectFit" /><text>{{ pp.label }} {{ pp.value }}{{ pp.unit }}</text></view>
          <view v-if="r.med" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-med.png" mode="aspectFit" /><text>{{ r.med }}</text></view>
          <view v-if="r.hospital" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-hospital.png" mode="aspectFit" /><text>{{ r.hospital }}</text></view>
          <view v-if="r.cost != null" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-cost.png" mode="aspectFit" /><text>¥{{ r.cost }}</text></view>
          <view v-if="r.att_count" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-attach.png" mode="aspectFit" /><text>{{ r.att_count }}</text></view>
          <view v-if="r.tag" class="tl-note tl-note--tag" hover-class="tl-note--tag-press" hover-stay-time="60" @click.stop="goCourse(r.tag, r.pet)"><image class="ic ic--sm" src="/static/icon/fn-tag.png" mode="aspectFit" /><text>{{ r.tag }} ›</text></view>
        </view>
      </view>
      <view v-if="loadingMore" class="tl-more tl-more--load">
        <text class="tl-load-dot"></text>
        <text class="tl-load-dot"></text>
        <text class="tl-load-dot"></text>
      </view>
      <view v-else-if="!hasMore && records.length >= pageSize" class="tl-more tl-more--end">· 没有更多了 ·</view>
    </view>
    <view v-else class="empty">
      <view class="empty__art"><image class="empty__art-img" src="/static/icon/clipboard.png" mode="aspectFit" /></view>
      <text class="empty__title">还没有健康记录</text>
      <text class="empty__desc">点底部 ＋ 说句话，AI 会自动把记录归档到这里</text>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { callFn } from '@/cloud'
import { formatParams } from '@/speciesProfile'
import { syncTab } from '@/tabSync'

export default {
  data() {
    return { records: [], courseTags: [], hasMore: true, loadingMore: false, pageSize: 30 }
  },
  onShow() {
    syncTab(this, 1)
    this.load()
  },
  onReachBottom() {
    this.loadMore()
  },
  methods: {
    // 进病程完整视图（ADR-019）：带 pet 看该宠该病程从头到尾全部记录 + 概览（不必在时间线上拉到底）
    goCourse(tag, pet) {
      if (!tag) return
      uni.navigateTo({ url: `/pages/course/course?tag=${encodeURIComponent(tag)}${pet ? '&pet=' + encodeURIComponent(pet) : ''}` })
    },
    // 进记录详情（看 / 补附件、删记录）；返回后 onShow 自动刷新
    openDetail(r) {
      uni.navigateTo({ url: `/pages/record-detail/record-detail?id=${r._id}` })
    },
    eventClass(t) {
      return { 症状: 'ev-symptom', 用药: 'ev-med', 疫苗: 'ev-vaccine', 驱虫: 'ev-deworm', 体重: 'ev-weight', 就医: 'ev-clinic', 养护: 'ev-care' }[t] || 'ev-other'
    },
    fmtParams(params) {
      return formatParams(params)
    },
    shortDate(d) {
      if (!d) return ''
      const s = String(d)
      // 跨年记录显示完整 YYYY-MM-DD（否则只看 MM-DD 不知是哪年）；本年显示 MM-DD HH:mm
      if (s.slice(0, 4) !== String(new Date().getFullYear())) return s.slice(0, 10)
      return s.length > 10 ? s.slice(5, 16) : s.slice(5, 10)
    },
    async load() {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV) return
      try {
        // 并发：时间线记录（首页 pageSize 条 + 上拉分页）+ 病程 tag 全集（list_tags 全扫，不受分页限，供入口条 chip）
        const [list, tagsRes] = await Promise.all([
          callFn('timeline', { action: 'list', limit: this.pageSize, skip: 0 }),
          callFn('timeline', { action: 'list_tags' }),
        ])
        if (list.result && list.result.ok) {
          this.records = list.result.data || []
          this.hasMore = !!list.result.hasMore
        }
        if (tagsRes.result && tagsRes.result.ok) this.courseTags = tagsRes.result.tags || []
      } catch (e) {
        console.warn('timeline load failed', e)
      }
      // #endif
    },
    // 上拉续取下一页（onReachBottom 触发）：skip = 已加载条数，append，hasMore 由云端回传
    async loadMore() {
      // #ifdef MP-WEIXIN
      if (this.loadingMore || !this.hasMore) return
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV) return
      this.loadingMore = true
      try {
        const res = await callFn('timeline', { action: 'list', limit: this.pageSize, skip: this.records.length })
        if (res.result && res.result.ok) {
          // _id 去重兜底：翻页期间本家庭若有增删，skip 可能让边界条重复，去重防 mp-weixin 重复 key 渲染告警
          const seen = new Set()
          this.records = this.records.concat(res.result.data || []).filter((r) => (seen.has(r._id) ? false : seen.add(r._id)))
          this.hasMore = !!res.result.hasMore
        }
      } catch (e) {
        console.warn('timeline loadMore failed', e)
      } finally {
        this.loadingMore = false
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
.tl-more {
  text-align: center;
  padding: 28rpx 0 8rpx;
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}
.tl-more--end {
  letter-spacing: 2rpx;
}
/* 上拉加载三点跳动（替代纯文字「加载中…」）：轮流上跳 + 透明度，轻而明确 */
.tl-more--load {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
}
.tl-load-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: var(--c-text-3);
  animation: tl-dot-bounce 1s ease-in-out infinite;
}
.tl-load-dot:nth-child(2) {
  animation-delay: 0.16s;
}
.tl-load-dot:nth-child(3) {
  animation-delay: 0.32s;
}
@keyframes tl-dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40% { transform: translateY(-8rpx); opacity: 1; }
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
  gap: 6rpx;
  border-radius: var(--r-pill);
  background: var(--c-card);
  border: 1px solid var(--c-border);
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}
.tl-filter__chip--press {
  background: var(--c-primary-tint);
  border-color: var(--c-primary);
  color: var(--c-primary-deep);
}

/* .tl-list / .tl-item 及全部子类（__head/__pet/__quote/__notes/__note/__time、tl-dot、tl-chip、.tl-item--press）
   与事件配色 ev-* 已抽到 App.vue 全局 <style>（timeline + course 病程列表共用单一真相源）。
   原因：uni-app mp-weixin 下页面 <style> 各自编译进各自 .wxss、不跨页，course 复用必须靠 App.vue 全局。
   本页只保留自己独有的 .page / .tl-filter* / .tl-more* / .tl-load-dot。
   空状态 .empty* 也在 App.vue 全局（Round 2）。 */
</style>
