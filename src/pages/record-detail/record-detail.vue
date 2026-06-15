<template>
  <view class="page">
    <view v-if="rec" class="detail">
      <!-- 头部：宠物 + 类型 + 日期 -->
      <view class="head">
        <view class="head__dot" :class="eventClass(rec.event_type)"></view>
        <text class="head__pet">{{ rec.pet || '未指定' }}</text>
        <text class="head__chip" :class="eventClass(rec.event_type)">{{ rec.event_type }}</text>
        <text class="head__time">{{ rec.time }}</text>
      </view>

      <!-- 结构化字段 -->
      <view class="card">
        <view class="row" v-if="rec.desc"><text class="row__label">描述</text><text class="row__value">{{ rec.desc }}</text></view>
        <view class="row" v-if="rec.tag"><text class="row__label">病程</text><text class="row__value">{{ rec.tag }}</text></view>
        <view class="row" v-if="rec.weight"><text class="row__label">体重</text><text class="row__value">{{ rec.weight }}kg</text></view>
        <view class="row" v-if="rec.med"><text class="row__label">用药</text><text class="row__value">{{ rec.med }}</text></view>
        <view class="row" v-if="rec.hospital"><text class="row__label">医院</text><text class="row__value">{{ rec.hospital }}</text></view>
        <view class="row" v-if="rec.cost != null"><text class="row__label">费用</text><text class="row__value">¥{{ rec.cost }}</text></view>
        <view class="row" v-if="rec.raw"><text class="row__label">原文</text><text class="row__value row__value--raw">{{ rec.raw }}</text></view>
      </view>

      <!-- 附件九宫格（见 ADR-011）：缩略图展示，点开看原图 / 播视频 / 开 PDF，长按删除 -->
      <view class="card">
        <view class="card__title-line">
          <text class="card__title">附件</text>
          <text class="card__sub">{{ atts.length }}/{{ attMax }}</text>
        </view>
        <view class="grid">
          <view
            v-for="a in atts"
            :key="a.fileID"
            class="cell"
            @click="preview(a)"
            @longpress="confirmRemove(a)"
          >
            <image v-if="a.type === 'image'" :src="a.thumb || a.fileID" class="cell__img" mode="aspectFill" lazy-load />
            <block v-else-if="a.type === 'video'">
              <image v-if="a.thumb" :src="a.thumb" class="cell__img" mode="aspectFill" lazy-load />
              <view class="cell__mask">▶</view>
            </block>
            <view v-else class="cell__pdf">
              <text class="cell__pdf-ico">📄</text>
              <text class="cell__pdf-name">{{ a.name }}</text>
              <text class="cell__pdf-size">{{ fmtSize(a.size) }}</text>
            </view>
          </view>
          <view v-if="atts.length < attMax" class="cell cell--add" @click="addAtt">＋</view>
        </view>
        <text v-if="atts.length" class="grid__hint">点开查看，长按删除</text>
      </view>

      <!-- 删除整条记录 -->
      <button class="del-btn" hover-class="del-btn--press" hover-stay-time="60" @click="confirmDelete">删除这条记录</button>
    </view>

    <view v-else-if="loaded" class="empty">
      <text class="empty__title">记录不存在或已删除</text>
    </view>
  </view>
</template>

<script>
import { callFn } from '@/cloud'
import { pickAttachments, uploadAndRegister, previewAttachment, fmtSize, ATT_MAX_PER_RECORD } from '@/attachments'

export default {
  data() {
    return {
      id: '',
      rec: null,
      loaded: false,
      busy: false,
      attMax: ATT_MAX_PER_RECORD,
    }
  },
  computed: {
    atts() {
      return (this.rec && this.rec.attachments) || []
    },
  },
  onLoad(query) {
    this.id = (query && query.id) || ''
  },
  onShow() {
    this.load()
  },
  methods: {
    fmtSize,
    eventClass(t) {
      return { 症状: 'ev-symptom', 用药: 'ev-med', 疫苗: 'ev-vaccine', 驱虫: 'ev-deworm', 体重: 'ev-weight', 就医: 'ev-clinic' }[t] || 'ev-other'
    },
    async load() {
      if (!this.id) {
        this.loaded = true
        return
      }
      try {
        const res = await callFn('timeline', { action: 'get', id: this.id })
        const r = res.result || {}
        this.rec = r.ok ? r.data : null
      } catch (e) {
        console.warn('record-detail load failed', e)
      }
      this.loaded = true
    },
    async addAtt() {
      if (this.busy) return
      const picked = await pickAttachments(this.attMax - this.atts.length)
      if (!picked.length) return
      this.busy = true
      uni.showLoading({ title: '上传附件中…', mask: true })
      // try/finally 必须包住：uploadAndRegister 异常逃逸会让 mask loading 永不消失、busy 永久 true 锁死整页（评审 medium）
      try {
        const up = await uploadAndRegister(this.id, picked)
        if (up.ok) {
          this.rec = { ...this.rec, attachments: up.attachments, att_count: up.attachments.length }
          uni.showToast({ title: '已添加', icon: 'success' })
        } else {
          uni.showToast({ title: up.msg, icon: 'none' })
        }
      } catch (e) {
        uni.showToast({ title: '添加出错', icon: 'none' })
      } finally {
        uni.hideLoading()
        this.busy = false
      }
    },
    preview(a) {
      previewAttachment(a, this.atts)
    },
    confirmRemove(a) {
      uni.showModal({
        title: '删除附件',
        content: '删除后云端文件一并清除，无法恢复。',
        confirmText: '删除',
        confirmColor: '#e05d40',
        success: async (r) => {
          if (!r.confirm || this.busy) return
          this.busy = true
          try {
            const res = await callFn('attachment', { action: 'remove', record_id: this.id, fileID: a.fileID })
            const rr = res.result || {}
            if (rr.ok) {
              this.rec = { ...this.rec, attachments: rr.attachments, att_count: rr.attachments.length }
              uni.showToast({ title: '已删除', icon: 'success' })
            } else {
              uni.showToast({ title: rr.msg || '删除失败', icon: 'none' })
            }
          } catch (e) {
            uni.showToast({ title: '删除出错', icon: 'none' })
          } finally {
            this.busy = false
          }
        },
      })
    },
    confirmDelete() {
      uni.showModal({
        title: '删除记录',
        content: '这条记录和它的全部附件都会删除，无法恢复。',
        confirmText: '删除',
        confirmColor: '#e05d40',
        success: async (r) => {
          if (!r.confirm || this.busy) return
          this.busy = true
          try {
            const res = await callFn('attachment', { action: 'deleteRecord', record_id: this.id })
            const rr = res.result || {}
            if (rr.ok) {
              uni.showToast({ title: '已删除', icon: 'success' })
              setTimeout(() => uni.navigateBack({ delta: 1 }), 500)
            } else {
              uni.showToast({ title: rr.msg || '删除失败', icon: 'none' })
            }
          } catch (e) {
            uni.showToast({ title: '删除出错', icon: 'none' })
          } finally {
            this.busy = false
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
  padding: 28rpx var(--pad-page) 60rpx;
  box-sizing: border-box;
}
.head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 8rpx 6rpx 24rpx;
}
.head__dot {
  width: 18rpx;
  height: 18rpx;
  border-radius: var(--r-pill);
  flex: none;
}
.head__pet {
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--c-text);
}
.head__chip {
  height: 40rpx;
  padding: 0 18rpx;
  border-radius: var(--r-pill);
  font-size: var(--fs-tiny);
  font-weight: 600;
  display: flex;
  align-items: center;
}
.head__time {
  margin-left: auto;
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}

.card {
  background: var(--c-card);
  border-radius: var(--r-lg);
  padding: 12rpx 28rpx;
  margin-bottom: 24rpx;
  box-shadow: var(--sh-2);
}
.row {
  display: flex;
  padding: 22rpx 0;
  border-bottom: 2rpx solid var(--c-divider);
}
.row:last-child {
  border-bottom: none;
}
.row__label {
  width: 120rpx;
  flex: none;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
}
.row__value {
  flex: 1;
  font-size: var(--fs-body);
  color: var(--c-text);
  line-height: 1.55;
}
.row__value--raw {
  color: var(--c-text-2);
  font-size: var(--fs-sub);
}

.card__title-line {
  display: flex;
  align-items: baseline;
  gap: 14rpx;
  padding: 22rpx 0 6rpx;
}
.card__title {
  font-size: var(--fs-sub);
  font-weight: 600;
  color: var(--c-text);
}
.card__sub {
  font-size: var(--fs-tiny);
  color: var(--c-text-3);
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  padding: 16rpx 0 20rpx;
}
.cell {
  position: relative;
  width: 196rpx;
  height: 196rpx;
  border-radius: var(--r-sm);
  background: var(--c-bg-sink);
  overflow: hidden;
}
.cell__img {
  width: 100%;
  height: 100%;
}
.cell__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.32);
  color: var(--c-text-inv);
  font-size: 52rpx;
}
.cell__pdf {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 0 14rpx;
  box-sizing: border-box;
}
.cell__pdf-ico {
  font-size: 56rpx;
}
.cell__pdf-name {
  max-width: 100%;
  font-size: var(--fs-tiny);
  color: var(--c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell__pdf-size {
  font-size: var(--fs-tiny);
  color: var(--c-text-3);
}
.cell--add {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 64rpx;
  color: var(--c-text-3);
  border: 2rpx dashed var(--c-border);
  background: transparent;
  box-sizing: border-box;
}
.grid__hint {
  display: block;
  padding-bottom: 18rpx;
  font-size: var(--fs-tiny);
  color: var(--c-text-3);
}

.del-btn {
  margin-top: 16rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: var(--r-pill);
  background: var(--c-card);
  color: var(--c-danger);
  font-size: var(--fs-body);
  font-weight: 500;
  border: 2rpx solid var(--c-danger-tint);
}
.del-btn--press {
  background: var(--c-danger-tint);
}

.empty {
  padding: 200rpx 0;
  display: flex;
  justify-content: center;
}
.empty__title {
  font-size: var(--fs-body);
  color: var(--c-text-3);
}

/* 事件配色（与时间线一致） */
.head__dot.ev-symptom { background: var(--c-danger); }
.head__dot.ev-med { background: var(--c-rt-med); }
.head__dot.ev-vaccine { background: var(--c-rt-vaccine); }
.head__dot.ev-deworm { background: var(--c-rt-deworm); }
.head__dot.ev-weight { background: var(--c-success); }
.head__dot.ev-clinic { background: var(--c-rt-other); }
.head__dot.ev-other { background: var(--c-text-3); }
.head__chip.ev-symptom { color: var(--c-danger); background: var(--c-danger-tint); }
.head__chip.ev-med { color: var(--c-rt-med); background: var(--c-rt-med-bg); }
.head__chip.ev-vaccine { color: var(--c-rt-vaccine); background: var(--c-rt-vaccine-bg); }
.head__chip.ev-deworm { color: var(--c-rt-deworm); background: var(--c-rt-deworm-bg); }
.head__chip.ev-weight { color: var(--c-success); background: var(--c-success-tint); }
.head__chip.ev-clinic { color: var(--c-rt-other); background: var(--c-rt-other-bg); }
.head__chip.ev-other { color: var(--c-text-2); background: var(--c-bg-sink); }
</style>
