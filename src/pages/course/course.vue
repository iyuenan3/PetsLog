<template>
  <!-- 病程完整视图（ADR-019）：按 (宠, tag) 看一个病程从头到尾的全部记录 + 概览聚合，突破时间线 50 条截断。
       入口：时间线记录的 🏷️ 病程标签点进（带 pet 单宠）。 -->
  <view class="course">
    <view v-if="loading" class="course__loading"><text>加载中…</text></view>

    <block v-else>
      <!-- 病程概览卡 -->
      <view class="cv-card">
        <view class="cv-card__head">
          <view class="cv-card__tag"><image class="ic" src="/static/icon/fn-tag.png" mode="aspectFit" /><text>{{ tag }}</text></view>
          <text v-if="petLabel" class="cv-card__pet">{{ petLabel }}</text>
        </view>
        <view class="cv-stats">
          <view class="cv-stat"><text class="cv-stat__n">{{ summary.count }}</text><text class="cv-stat__l">条记录</text></view>
          <view class="cv-stat"><text class="cv-stat__n">{{ spanText }}</text><text class="cv-stat__l">跨度</text></view>
          <view v-if="summary.costSum != null" class="cv-stat"><text class="cv-stat__n">¥{{ summary.costSum }}</text><text class="cv-stat__l">已记花费</text></view>
        </view>
        <text v-if="summary.firstDate && summary.lastDate" class="cv-card__range">{{ summary.firstDate }} ~ {{ summary.lastDate }}</text>
      </view>

      <!-- 跨宠：同名 tag 涉及多只 → 给 pet 下钻 chips（不混画体重） -->
      <view v-if="!pet && summary.pets && summary.pets.length > 1" class="cv-pets">
        <text class="cv-pets__hint">本病程涉及 {{ summary.pets.length }} 只，点选看单只趋势</text>
        <view class="cv-pets__chips">
          <text v-for="p in summary.pets" :key="p" class="cv-pet-chip" hover-class="cv-pet-chip--press" @click="drill(p)">{{ p }}</text>
        </view>
      </view>

      <!-- 体重迷你趋势（静态 canvas，单宠且 ≥2 点才画；ADR-019：不复用 pet.vue 拖动 canvas） -->
      <view v-if="summary.weights && summary.weights.length >= 2" class="cv-chart">
        <view class="cv-chart__title"><image class="ic ic--sm" src="/static/icon/fn-weight.png" mode="aspectFit" /><text>体重趋势</text></view>
        <canvas type="2d" id="cvWeight" class="cv-chart__canvas"></canvas>
      </view>

      <!-- 病程记录竖向时间轴（复用 App.vue 全局 .tl-item 卡片样式，与主时间线同一真相源） -->
      <view v-if="records.length" class="tl-list course__list">
        <view v-for="r in records" :key="r._id" class="tl-item" hover-class="tl-item--press" hover-stay-time="60" @click="openDetail(r)">
          <view class="tl-item__head">
            <view class="tl-dot" :class="eventClass(r.event_type)"></view>
            <text class="tl-item__pet">{{ r.pet || '未指定' }}</text>
            <text class="tl-chip" :class="eventClass(r.event_type)">{{ r.event_type }}</text>
            <text class="tl-item__time">{{ shortDate(r.time) }}</text>
          </view>
          <text v-if="r.raw || r.desc" class="tl-item__quote">{{ r.raw || r.desc }}</text>
          <view v-if="r.weight || r.med || r.hospital || r.cost != null || r.att_count" class="tl-item__notes">
            <view v-if="r.weight" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-weight.png" mode="aspectFit" /><text>{{ r.weight }}kg</text></view>
            <view v-if="r.med" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-med.png" mode="aspectFit" /><text>{{ r.med }}</text></view>
            <view v-if="r.hospital" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-hospital.png" mode="aspectFit" /><text>{{ r.hospital }}</text></view>
            <view v-if="r.cost != null" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-cost.png" mode="aspectFit" /><text>¥{{ r.cost }}</text></view>
            <view v-if="r.att_count" class="tl-note"><image class="ic ic--sm" src="/static/icon/fn-attach.png" mode="aspectFit" /><text>{{ r.att_count }}</text></view>
          </view>
        </view>
      </view>
      <view v-else class="empty">
        <view class="empty__art"><image class="empty__art-img" src="/static/icon/label.png" mode="aspectFit" /></view>
        <text class="empty__title">这个病程还没有记录</text>
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
      tag: '',
      pet: '',
      loading: true,
      records: [],
      summary: { tag: '', pet: '', pets: [], count: 0, firstDate: '', lastDate: '', costSum: null, weights: [] },
    }
  },
  computed: {
    // 概览标题里的宠物名：显式下钻 pet 优先，否则单宠时显示那只
    petLabel() {
      return this.pet || (this.summary.pets && this.summary.pets.length === 1 ? this.summary.pets[0] : '')
    },
    spanText() {
      const a = this.summary.firstDate, b = this.summary.lastDate
      if (!a || !b) return '—'
      const d = Math.round((Date.parse(b + 'T12:00:00+08:00') - Date.parse(a + 'T12:00:00+08:00')) / 86400000)
      return isNaN(d) ? '—' : d <= 0 ? '当天' : d + ' 天'
    },
  },
  onLoad(opts) {
    this.tag = decodeURIComponent((opts && opts.tag) || '')
    this.pet = decodeURIComponent((opts && opts.pet) || '')
    uni.setNavigationBarTitle({ title: this.tag ? '病程 · ' + this.tag : '病程' })
  },
  // onShow 加载：首次进入 + 从 record-detail 编辑 / 删记录返回时自动刷新（与 timeline 一致）
  onShow() {
    this.load()
  },
  methods: {
    eventClass(t) {
      return { 症状: 'ev-symptom', 用药: 'ev-med', 疫苗: 'ev-vaccine', 驱虫: 'ev-deworm', 体重: 'ev-weight', 就医: 'ev-clinic', 养护: 'ev-care' }[t] || 'ev-other'
    },
    shortDate(d) {
      return d ? String(d).slice(5) : ''
    },
    openDetail(r) {
      uni.navigateTo({ url: `/pages/record-detail/record-detail?id=${r._id}` })
    },
    // 跨宠下钻：选一只 → 重查该宠该病程（单宠才给体重序列）
    drill(p) {
      this.pet = p
      uni.setNavigationBarTitle({ title: '病程 · ' + this.tag + ' · ' + p })
      this.load()
    },
    async load() {
      // #ifdef MP-WEIXIN
      if (typeof wx === 'undefined' || !wx.cloud || !CLOUD_ENV || !this.tag) { this.loading = false; return }
      this.loading = true
      try {
        const res = await callFn('timeline', { action: 'course', tag: this.tag, pet: this.pet || undefined })
        if (res.result && res.result.ok) {
          this.records = res.result.data || []
          this.summary = res.result.summary || this.summary
          this.$nextTick(() => this.drawWeight())
        }
      } catch (e) {
        console.warn('course load failed', e)
      }
      this.loading = false
      // #endif
    },
    // 静态体重迷你曲线：定宽卡片画布（≈320 CSS px，远低于 canvas 2d ~4096 物理上限），无任何触摸 / 平移逻辑。
    drawWeight(retry) {
      // #ifdef MP-WEIXIN
      const pts = this.summary.weights || []
      if (pts.length < 2) return
      uni.createSelectorQuery().in(this).select('#cvWeight').fields({ node: true, size: true }).exec((res) => {
        const info = res && res[0]
        if (!info || !info.node) {
          const r = (retry || 0) + 1
          if (r <= 10) setTimeout(() => this.drawWeight(r), 60) // 节点未就绪时短重试（同 pet.vue）
          return
        }
        const canvas = info.node
        const W = info.width, H = info.height
        if (!W || !H) return // 节点尺寸异常（如 display:none）防 scale 出 NaN/Infinity
        const dpr = uni.getSystemInfoSync().pixelRatio || 2
        canvas.width = Math.min(W * dpr, 4000) // 定宽，恒 < 上限；Math.min 为护栏（ADR-019 / MEMORY 物理宽夹紧）
        canvas.height = H * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(canvas.width / W, canvas.height / H)
        ctx.clearRect(0, 0, W, H)
        const padL = 12, padR = 12, padT = 14, padB = 16
        const ws = pts.map((p) => p.weight)
        let min = Math.min(...ws), max = Math.max(...ws)
        if (max - min < 0.2) { const m = (max + min) / 2; min = m - 0.5; max = m + 0.5 } // 变化极小时给固定窗，免平直线贴边
        const innerW = W - padL - padR, innerH = H - padT - padB
        const x = (i) => padL + (i * innerW) / (pts.length - 1)
        const y = (w) => padT + (1 - (w - min) / (max - min)) * innerH
        ctx.strokeStyle = '#f0907a'
        ctx.lineWidth = 2
        ctx.beginPath()
        pts.forEach((p, i) => { const px = x(i), py = y(p.weight); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py) })
        ctx.stroke()
        ctx.fillStyle = '#f0907a'
        pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(x(i), y(p.weight), 3, 0, 2 * Math.PI); ctx.fill() })
        // 首末标值
        ctx.fillStyle = '#9a8f88'
        ctx.font = '10px sans-serif'
        ctx.fillText(ws[0] + 'kg', x(0), y(pts[0].weight) - 7)
        const lastTxt = ws[ws.length - 1] + 'kg'
        ctx.fillText(lastTxt, x(pts.length - 1) - ctx.measureText(lastTxt).width, y(pts[pts.length - 1].weight) - 7) // 精确测字宽，免字符数估算错位
        // canvas 2d 即时绘制，无需 ctx.draw()
      })
      // #endif
    },
  },
}
</script>

<style>
.course {
  min-height: 100vh;
  padding: 24rpx var(--pad-page) calc(60rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.course__loading {
  padding: 160rpx 0;
  text-align: center;
  color: var(--c-text-3);
  font-size: var(--fs-sub);
}

/* 病程概览卡 */
.cv-card {
  background: linear-gradient(135deg, var(--c-primary-wash) 0%, var(--c-card) 70%);
  border-radius: var(--r-md);
  padding: 32rpx;
  box-shadow: var(--sh-2);
  margin-bottom: 24rpx;
}
.cv-card__head {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
}
.cv-card__tag {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--c-text);
}
.cv-card__pet {
  font-size: var(--fs-sub);
  color: var(--c-primary-deep);
  font-weight: 600;
}
.cv-stats {
  display: flex;
  gap: 48rpx;
  margin-top: 28rpx;
}
.cv-stat {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.cv-stat__n {
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--c-primary-deep);
}
.cv-stat__l {
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}
.cv-card__range {
  display: block;
  margin-top: 22rpx;
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}

/* 跨宠下钻 */
.cv-pets {
  margin-bottom: 24rpx;
}
.cv-pets__hint {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
  margin-bottom: 14rpx;
}
.cv-pets__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
}
.cv-pet-chip {
  height: 60rpx;
  padding: 0 30rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-pill);
  background: var(--c-card);
  border: 2rpx solid var(--c-border);
  font-size: var(--fs-cap);
  color: var(--c-text);
}
.cv-pet-chip--press {
  background: var(--c-primary-tint);
  border-color: var(--c-primary);
}

/* 体重迷你曲线 */
.cv-chart {
  background: var(--c-card);
  border-radius: var(--r-md);
  padding: 24rpx 24rpx 12rpx;
  box-shadow: var(--sh-2);
  margin-bottom: 24rpx;
}
.cv-chart__title {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}
.cv-chart__canvas {
  width: 100%;
  height: 220rpx;
  margin-top: 10rpx;
}

.course__list {
  padding: 0;
}
</style>
