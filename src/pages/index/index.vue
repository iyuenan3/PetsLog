<template>
  <view class="page">
    <scroll-view scroll-y class="pets-scroll">
      <!-- 问候 -->
      <view class="greeting">
        <text class="greeting__hi">今天，毛孩子们还好吗 🐾</text>
        <text class="greeting__sub">说一句话，我帮你记下来</text>
      </view>

      <!-- 到期提醒横幅 -->
      <view
        v-if="dueCount"
        class="banner banner--alert"
        hover-class="banner--press"
        hover-stay-time="80"
        @click="goReminders"
      >
        <text class="banner__icon">🔔</text>
        <text class="banner__text">有 <text class="banner__num">{{ dueCount }}</text> 条提醒到期</text>
        <text class="banner__arrow">›</text>
      </view>

      <!-- 宠物网格 -->
      <view v-if="pets.length" class="pet-grid">
        <view
          v-for="p in pets"
          :key="p._id || p.name"
          class="pet-card"
          hover-class="pet-card--press"
          hover-stay-time="80"
          @click="openPet(p)"
        >
          <view class="pet-card__avatar" :class="p.species === 'dog' ? 'is-dog' : 'is-cat'">{{ speciesEmoji(p.species) }}</view>
          <text class="pet-card__name">{{ p.name }}</text>
          <text class="pet-card__meta">{{ ageText(p.birthday) || '年龄未知' }} · {{ p.latest_weight ? p.latest_weight + 'kg' : '体重未记' }}</text>
        </view>
      </view>

      <!-- 空状态 -->
      <view v-else class="empty">
        <view class="empty__art">🐾</view>
        <text class="empty__title">还没有毛孩子</text>
        <text class="empty__desc">在下面说一句，比如「新来的橘猫示例 3.2kg」，我会自动建档</text>
      </view>
    </scroll-view>

    <!-- 解析结果确认弹层 -->
    <view v-if="parsed" class="sheet-mask" @click="cancelParse">
      <view class="sheet" @click.stop>
        <view class="sheet__grab"></view>

        <!-- 药品入库 -->
        <block v-if="parsed.kind === 'med_stock'">
          <text class="sheet__title">入库一盒药 💊</text>
          <text class="sheet__hint">确认后存进药品库存</text>
          <view class="sheet__fields">
            <view class="field-row"><text class="field-row__label">药品</text><text class="field-row__value" :class="{ 'field-row__value--empty': !parsed.med_name }">{{ parsed.med_name || '待确认' }}</text></view>
            <view class="field-row" v-if="parsed.med_effect"><text class="field-row__label">功效</text><text class="field-row__value">{{ parsed.med_effect }}</text></view>
            <view class="field-row"><text class="field-row__label">数量</text><text class="field-row__value">{{ parsed.med_quantity }}</text></view>
            <view class="field-row"><text class="field-row__label">过期</text><text class="field-row__value" :class="{ 'field-row__value--empty': !parsed.med_expire }">{{ parsed.med_expire || '未填' }}</text></view>
            <view class="field-row"><text class="field-row__label">原文</text><text class="field-row__value">{{ parsed.raw || draft }}</text></view>
          </view>
        </block>

        <!-- 提醒 -->
        <block v-else-if="parsed.kind === 'reminder'">
          <text class="sheet__title">设个提醒 🔔</text>
          <text class="sheet__hint">到期会在首页和提醒页提示你</text>
          <view class="sheet__fields">
            <view class="field-row" v-if="parsed.pet"><text class="field-row__label">宠物</text><text class="field-row__value">{{ parsed.pet }}</text></view>
            <view class="field-row"><text class="field-row__label">类型</text><text class="field-row__value">{{ parsed.rem_type || '其它' }}</text></view>
            <view class="field-row"><text class="field-row__label">事项</text><text class="field-row__value" :class="{ 'field-row__value--empty': !parsed.rem_title }">{{ parsed.rem_title || '待确认' }}</text></view>
            <view class="field-row"><text class="field-row__label">到期</text><text class="field-row__value" :class="{ 'field-row__value--empty': !parsed.rem_date }">{{ parsed.rem_date || '未识别' }}</text></view>
            <view class="field-row" v-if="parsed.rem_repeat_days"><text class="field-row__label">重复</text><text class="field-row__value">{{ repeatText(parsed.rem_repeat_days) }}</text></view>
            <view class="field-row"><text class="field-row__label">原文</text><text class="field-row__value">{{ parsed.raw || draft }}</text></view>
          </view>
        </block>

        <!-- 健康记录 -->
        <block v-else>
          <text class="sheet__title">记一笔健康记录 🩺</text>
          <text class="sheet__hint">确认后归档到时间线</text>
          <view class="sheet__fields">
            <view class="field-row">
              <text class="field-row__label">宠物</text>
              <text class="field-row__value" :class="{ 'field-row__value--empty': !parsed.pet }">{{ parsed.pet || '待确认' }}<text v-if="parsed.is_new" class="new-badge"> 🆕 将建档</text></text>
            </view>
            <view class="field-row" v-if="parsed.is_new">
              <text class="field-row__label">种类</text>
              <view class="chips">
                <text :class="['chip', parsed.species === 'cat' ? 'chip--active' : '']" @click="setSpecies('cat')">🐱 猫</text>
                <text :class="['chip', parsed.species === 'dog' ? 'chip--active' : '']" @click="setSpecies('dog')">🐶 狗</text>
              </view>
            </view>
            <view class="field-row"><text class="field-row__label">时间</text><text class="field-row__value">{{ parsed.time || '今天' }}</text></view>
            <view class="field-row"><text class="field-row__label">类型</text><text class="field-row__value">{{ parsed.event_type || '其它' }}</text></view>
            <view class="field-row" v-if="parsed.weight"><text class="field-row__label">体重</text><text class="field-row__value">{{ parsed.weight }}kg</text></view>
            <view class="field-row" v-if="parsed.med"><text class="field-row__label">用药</text><text class="field-row__value">{{ parsed.med }}</text></view>
            <view class="field-row"><text class="field-row__label">原文</text><text class="field-row__value">{{ parsed.raw || draft }}</text></view>
          </view>
        </block>

        <view class="sheet__actions">
          <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="cancelParse">取消</button>
          <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" :loading="saving" @click="confirmSave">{{ confirmBtnText() }}</button>
        </view>
      </view>
    </view>

    <!-- 底部固定输入条 -->
    <view class="composer">
      <input
        v-model="draft"
        class="composer__input"
        :class="{ 'composer__input--focus': focused }"
        type="text"
        placeholder="说一句，例如「示例猫今天吐了，体重4.2kg」"
        placeholder-class="composer__ph"
        confirm-type="send"
        :disabled="parsing"
        @focus="focused = true"
        @blur="focused = false"
        @confirm="onSend"
      />
      <button
        class="composer__btn"
        :class="{ 'composer__btn--loading': parsing }"
        hover-class="composer__btn--press"
        hover-stay-time="80"
        :loading="parsing"
        @click="onSend"
      >{{ parsing ? '' : '记录' }}</button>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { petAge } from '@/utils'
import { callFn } from '@/cloud'

export default {
  data() {
    return {
      pets: [],
      draft: '',
      parsing: false,
      saving: false,
      parsed: null, // AI 解析后的结构化结果，待用户确认
      dueCount: 0, // 到期/逾期提醒数，用于首页横幅
      focused: false, // 输入框聚焦态
    }
  },
  onShow() {
    this.loadPets()
    this.loadDue()
  },
  methods: {
    speciesEmoji(s) {
      return s === 'dog' ? '🐶' : '🐱'
    },
    ageText(b) {
      return petAge(b)
    },
    cloudReady() {
      // #ifdef MP-WEIXIN
      return typeof wx !== 'undefined' && !!wx.cloud && !!CLOUD_ENV
      // #endif
      // eslint-disable-next-line no-unreachable
      return false
    },
    async loadPets() {
      if (!this.cloudReady()) return
      try {
        const res = await callFn('pets', { action: 'list' })
        if (res.result && res.result.ok) this.pets = res.result.data || []
      } catch (e) {
        console.warn('loadPets failed', e)
      }
    },
    openPet(p) {
      uni.navigateTo({ url: '/pages/pet/pet?id=' + (p._id || '') })
    },
    async loadDue() {
      if (!this.cloudReady()) return
      try {
        const res = await callFn('reminders', { action: 'list' })
        if (res.result && res.result.ok) {
          const today = res.result.today || ''
          this.dueCount = (res.result.data || []).filter((r) => r.next_date && r.next_date <= today).length
        }
      } catch (e) {
        console.warn('loadDue failed', e)
      }
    },
    goReminders() {
      uni.switchTab({ url: '/pages/reminders/reminders' })
    },
    repeatText(x) {
      if (!x) return '不重复'
      if (x % 365 === 0) return `每${x / 365}年`
      if (x % 30 === 0) return `每${x / 30}个月`
      if (x % 7 === 0) return `每${x / 7}周`
      return `每${x}天`
    },
    confirmBtnText() {
      const k = this.parsed && this.parsed.kind
      return k === 'med_stock' ? '确认入库' : k === 'reminder' ? '确认提醒' : '确认归档'
    },
    onSend() {
      const text = (this.draft || '').trim()
      if (!text) return
      if (!this.cloudReady()) {
        uni.showToast({ title: '请先配置云环境(CLOUD_ENV)', icon: 'none' })
        return
      }
      this.parse(text)
    },
    async parse(text) {
      this.parsing = true
      try {
        const res = await callFn('parseRecord', { text })
        const r = res.result || {}
        if (!r.ok) {
          uni.showToast({ title: r.msg || '解析失败', icon: 'none' })
          return
        }
        if (r.parsed && r.parsed.valid === false) {
          uni.showToast({ title: '这条看起来不是健康记录', icon: 'none' })
          return
        }
        this.parsed = r.parsed
      } catch (e) {
        uni.showModal({
          title: 'AI 解析出错',
          content: String((e && e.errMsg) || (e && e.message) || JSON.stringify(e)),
          showCancel: false,
        })
        console.error(e)
      } finally {
        this.parsing = false
      }
    },
    setSpecies(s) {
      if (this.parsed) this.parsed.species = s
    },
    cancelParse() {
      this.parsed = null
    },
    async confirmSave() {
      if (!this.parsed) return
      const kind = this.parsed.kind
      const okMsg = kind === 'med_stock' ? '已入库' : kind === 'reminder' ? '已设提醒' : '已归档'
      this.saving = true
      try {
        const res = await callFn('saveRecord', { record: this.parsed })
        const r = res.result || {}
        if (r.ok) {
          uni.showToast({ title: okMsg, icon: 'success' })
          this.draft = ''
          this.parsed = null
          this.loadPets()
          if (kind === 'reminder') this.loadDue()
        } else {
          uni.showToast({ title: r.msg || '保存失败', icon: 'none' })
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
  display: flex;
  flex-direction: column;
}
.pets-scroll {
  flex: 1;
  padding: 0 0 200rpx;
  box-sizing: border-box;
}

/* 问候 */
.greeting {
  padding: 40rpx var(--pad-page) 16rpx;
  display: flex;
  flex-direction: column;
}
.greeting__hi {
  font-size: var(--fs-display);
  line-height: 1.25;
  font-weight: 700;
  color: var(--c-text);
}
.greeting__sub {
  margin-top: 8rpx;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
}

/* 到期提醒横幅 */
.banner {
  margin: 8rpx var(--pad-page) 24rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 24rpx 28rpx;
  background: var(--c-primary-wash);
  border: 2rpx solid var(--c-primary-tint);
  border-radius: var(--r-md);
  box-shadow: var(--sh-1);
}
.banner--alert {
  animation: breathe 2.8s ease-in-out infinite;
}
.banner--press {
  background: var(--c-primary-tint);
}
.banner__icon {
  font-size: 36rpx;
}
.banner__text {
  flex: 1;
  font-size: var(--fs-sub);
  color: var(--c-primary-deep);
  font-weight: 500;
}
.banner__num {
  font-weight: 700;
}
.banner__arrow {
  font-size: 32rpx;
  color: var(--c-primary);
}

/* 宠物网格 */
.pet-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 24rpx;
  padding: 0 var(--pad-page);
}
.pet-card {
  width: calc(50% - 12rpx);
  box-sizing: border-box;
  background: var(--c-card);
  border-radius: var(--r-lg);
  padding: 36rpx 24rpx 32rpx;
  box-shadow: var(--sh-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}
.pet-card--press {
  transform: scale(0.97);
  box-shadow: var(--sh-press);
}
.pet-card__avatar {
  width: 128rpx;
  height: 128rpx;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 72rpx;
  background: radial-gradient(circle at 50% 38%, #fff3ec 0%, var(--c-primary-tint) 100%);
  box-shadow: inset 0 0 0 2rpx rgba(242, 130, 92, 0.12), 0 6rpx 16rpx rgba(242, 130, 92, 0.18);
}
.pet-card__avatar.is-dog {
  background: radial-gradient(circle at 50% 38%, #fff0e6 0%, #fad9c2 100%);
}
.pet-card__name {
  margin-top: 20rpx;
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--c-text);
}
.pet-card__meta {
  margin-top: 6rpx;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}

/* 空状态 */
.empty {
  padding: 120rpx var(--pad-page);
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

/* 输入条 */
.composer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 20rpx var(--pad-page) calc(20rpx + env(safe-area-inset-bottom));
  background: var(--c-card-cream);
  border-top: 2rpx solid var(--c-border);
  box-shadow: 0 -6rpx 20rpx rgba(196, 124, 86, 0.06);
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.composer__input {
  flex: 1;
  height: 84rpx;
  padding: 0 28rpx;
  background: var(--c-bg-sink);
  border: 2rpx solid transparent;
  border-radius: var(--r-xl);
  font-size: var(--fs-body);
  color: var(--c-text);
}
.composer__input--focus {
  background: var(--c-primary-wash);
  border-color: var(--c-primary-tint);
}
.composer__ph {
  color: var(--c-text-3);
}
.composer__btn {
  width: 132rpx;
  height: 84rpx;
  line-height: 84rpx;
  flex: none;
  padding: 0;
  border-radius: var(--r-xl);
  background: var(--c-primary-grad);
  box-shadow: var(--sh-primary);
  color: var(--c-text-inv);
  font-size: var(--fs-body);
  font-weight: 600;
}
.composer__btn--press {
  transform: scale(0.94);
  box-shadow: var(--sh-press);
}
.composer__btn--loading {
  background: var(--c-primary-soft);
  box-shadow: none;
}

/* 确认弹层 */
.sheet-mask {
  position: fixed;
  inset: 0;
  background: rgba(58, 51, 48, 0.38);
  display: flex;
  align-items: flex-end;
  z-index: 50;
}
.sheet {
  width: 100%;
  background: var(--c-card);
  border-radius: var(--r-xl) var(--r-xl) 0 0;
  box-shadow: var(--sh-3);
  padding: 16rpx var(--pad-page) calc(32rpx + env(safe-area-inset-bottom));
  animation: sheet-up 0.26s cubic-bezier(0.22, 0.61, 0.36, 1);
}
@keyframes sheet-up {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
.sheet__grab {
  width: 64rpx;
  height: 8rpx;
  border-radius: var(--r-pill);
  background: var(--c-divider);
  margin: 8rpx auto 24rpx;
}
.sheet__title {
  display: block;
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--c-text);
}
.sheet__hint {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
  margin-top: 6rpx;
  margin-bottom: 24rpx;
}
.sheet__fields {
  background: var(--c-card-cream);
  border-radius: var(--r-md);
  padding: 4rpx 28rpx;
  margin-bottom: 28rpx;
}
.field-row {
  display: flex;
  align-items: center;
  min-height: 88rpx;
  padding: 18rpx 0;
  border-bottom: 2rpx solid var(--c-divider);
}
.field-row:last-child {
  border-bottom: none;
}
.field-row__label {
  width: 120rpx;
  flex: none;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
}
.field-row__value {
  flex: 1;
  font-size: var(--fs-body);
  color: var(--c-text);
  font-weight: 500;
  text-align: right;
}
.field-row__value--empty {
  color: var(--c-text-3);
  font-weight: 400;
}
.new-badge {
  font-size: var(--fs-tiny);
  color: var(--c-warning);
  font-weight: 500;
}
.chips {
  flex: 1;
  display: flex;
  gap: 16rpx;
  justify-content: flex-end;
}
.chip {
  height: 64rpx;
  padding: 0 28rpx;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  color: var(--c-text-2);
  font-size: var(--fs-sub);
  font-weight: 500;
  display: flex;
  align-items: center;
}
.chip--active {
  background: var(--c-primary-tint);
  color: var(--c-primary-deep);
  font-weight: 600;
  box-shadow: inset 0 0 0 2rpx var(--c-primary);
}
.sheet__actions {
  display: flex;
  gap: 20rpx;
}
.btn-ghost {
  flex: 1;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  color: var(--c-text-2);
  font-size: var(--fs-body);
  font-weight: 500;
}
.btn-ghost--press {
  background: var(--c-divider);
}
.btn-primary {
  flex: 1;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: var(--r-pill);
  background: var(--c-primary-grad);
  color: var(--c-text-inv);
  font-size: var(--fs-body);
  font-weight: 600;
  box-shadow: var(--sh-primary);
}
.btn-primary--press {
  transform: scale(0.97);
  box-shadow: var(--sh-press);
}
</style>
