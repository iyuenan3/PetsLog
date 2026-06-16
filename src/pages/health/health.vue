<template>
  <view class="page">
    <!-- 顶部分段：提醒 | 药品 | 主粮 -->
    <view class="seg">
      <view class="seg__item" :class="{ 'seg__item--on': tab === 'rem' }" hover-class="seg__item--press" hover-stay-time="60" @click="switchTab('rem')">提醒</view>
      <view class="seg__item" :class="{ 'seg__item--on': tab === 'med' }" hover-class="seg__item--press" hover-stay-time="60" @click="switchTab('med')">药品</view>
      <view class="seg__item" :class="{ 'seg__item--on': tab === 'food' }" hover-class="seg__item--press" hover-stay-time="60" @click="switchTab('food')">主粮</view>
    </view>

    <!-- ===== 提醒 ===== -->
    <block v-if="tab === 'rem'">
      <view v-if="reminders.length" class="rm-list">
        <view v-for="r in reminders" :key="r._id" class="rm-card" :class="['rm-card--' + tagClass(r.type), { 'rm-card--overdue': dayDiff(r.next_date) < 0 }]">
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
            <text class="op op--success" hover-class="op--press" hover-stay-time="60" @click="markDone(r)">✓ 完成</text>
            <text class="op op--secondary" hover-class="op--press" hover-stay-time="60" @click="snooze(r)">延后7天</text>
            <text class="op op--danger" hover-class="op--press" hover-stay-time="60" @click="remove(r)">删除</text>
          </view>
        </view>
      </view>
      <view v-else class="empty">
        <view class="empty__art">⏰</view>
        <text class="empty__title">暂无提醒，一切安好</text>
        <text class="empty__desc">点底部 ＋ 说一句「下月15号给示例狗打疫苗」「每月给猫驱虫」，AI 会自动设上</text>
      </view>
    </block>

    <!-- ===== 主粮台账 ===== -->
    <block v-else-if="tab === 'food'">
      <view class="food-head">
        <text class="food-head__title">主粮台账</text>
        <text class="food-head__add" hover-class="food-head__add--press" hover-stay-time="60" @click="openFoodAdd">＋ 添加</text>
      </view>
      <view v-if="foods.length" class="food-list">
        <view v-for="f in foods" :key="f._id" class="food-card" :class="{ 'food-card--current': f.current }">
          <view class="food-card__top">
            <text class="food-card__name">{{ f.name }}</text>
            <text v-if="f.current" class="food-card__badge">在喂</text>
          </view>
          <text class="food-card__period">{{ foodPeriod(f) }}</text>
          <text v-if="f.note" class="food-card__note">{{ f.note }}</text>
          <view class="food-card__ops">
            <text v-if="!f.current" class="op op--success" hover-class="op--press" hover-stay-time="60" @click="setCurrent(f)">设为在喂</text>
            <text class="op op--secondary" hover-class="op--press" hover-stay-time="60" @click="openFoodEdit(f)">编辑</text>
            <text class="op op--danger" hover-class="op--press" hover-stay-time="60" @click="removeFood(f)">删除</text>
          </view>
        </view>
      </view>
      <view v-else class="empty">
        <view class="empty__art">🍚</view>
        <text class="empty__title">还没有主粮记录</text>
        <text class="empty__desc">点右上「＋ 添加」记下喂过的主粮和时段，给换粮决策留个账</text>
      </view>
    </block>

    <!-- 主粮 编辑弹层 -->
    <view v-if="foodSheet" class="sheet-mask" @click="closeFood">
      <view class="sheet" @click.stop>
        <view class="sheet__grab"></view>
        <text class="sheet__title">{{ foodSheet._id ? '编辑主粮' : '添加主粮' }}</text>
        <view class="f-form">
          <view class="f-row"><text class="f-row__label">名称</text><input class="f-input" v-model="foodSheet.name" placeholder="如 渴望六种鱼" placeholder-class="f-ph" /></view>
          <view class="f-row">
            <text class="f-row__label">开始</text>
            <picker class="f-picker" mode="date" :value="foodSheet.start_date || ''" @change="onFoodStart">
              <view class="f-input f-pick" :class="{ 'f-pick--ph': !foodSheet.start_date }">{{ foodSheet.start_date || '点击选择' }}</view>
            </picker>
          </view>
          <view class="f-row">
            <text class="f-row__label">结束</text>
            <picker class="f-picker" mode="date" :value="foodSheet.end_date || ''" @change="onFoodEnd">
              <view class="f-input f-pick" :class="{ 'f-pick--ph': !foodSheet.end_date }">{{ foodSheet.end_date || '在喂留空' }}</view>
            </picker>
          </view>
          <view class="f-row"><text class="f-row__label">当前在喂</text><switch :checked="foodSheet.current" color="#f2825c" @change="onFoodCurrent" /></view>
          <view class="f-row"><text class="f-row__label">备注</text><input class="f-input" v-model="foodSheet.note" placeholder="可留空" placeholder-class="f-ph" /></view>
        </view>
        <view class="sheet__actions">
          <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="closeFood">取消</button>
          <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" :loading="foodSaving" @click="saveFood">保存</button>
        </view>
      </view>
    </view>

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
import { syncTab } from '@/tabSync'

export default {
  data() {
    return {
      tab: 'rem', // rem | med | food
      reminders: [],
      today: '',
      remLoaded: false,
      meds: [],
      medLoaded: false,
      foods: [],
      foodLoaded: false,
      foodSheet: null, // 编辑中的主粮（null = 弹层关闭）
      foodSaving: false,
    }
  },
  onShow() {
    syncTab(this, 2)
    // 进入「健康」tab 时允许从首页横幅指定分段
    const want = uni.getStorageSync('health_seg')
    if (want === 'rem' || want === 'med' || want === 'food') {
      this.tab = want
      uni.removeStorageSync('health_seg')
    }
    // 各分段都刷新：避免切回非当前分段看到陈旧数据；并保证 this.today（服务端基准日）始终新鲜，供药品临期判定
    this.loadRem()
    this.loadMed()
    this.loadFood()
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
      // onShow 已加载各段；此处仅兜底首次（onShow 未完成前）未加载的情况
      if (t === 'rem' && !this.remLoaded) this.loadRem()
      if (t === 'med' && !this.medLoaded) this.loadMed()
      if (t === 'food' && !this.foodLoaded) this.loadFood()
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
      return { 疫苗: 'vaccine', 驱虫: 'deworm', 用药: 'med', 养护: 'care' }[t] || 'other'
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

    /* ===== 主粮 ===== */
    async loadFood() {
      if (!this.cloudReady()) return
      try {
        const res = await callFn('foods', { action: 'list' })
        if (res.result && res.result.ok) {
          this.foods = res.result.data || []
          this.foodLoaded = true
        }
      } catch (e) {
        console.warn('foods load failed', e)
      }
    },
    foodPeriod(f) {
      const s = f.start_date || '?'
      return f.current ? `${s} 起 · 在喂` : `${s} ~ ${f.end_date || '?'}`
    },
    openFoodAdd() {
      this.foodSheet = { name: '', start_date: '', end_date: '', current: false, note: '' }
    },
    openFoodEdit(f) {
      this.foodSheet = { _id: f._id, name: f.name || '', start_date: f.start_date || '', end_date: f.end_date || '', current: !!f.current, note: f.note || '' }
    },
    closeFood() {
      this.foodSheet = null
    },
    onFoodStart(e) {
      this.foodSheet.start_date = e.detail.value
    },
    onFoodEnd(e) {
      this.foodSheet.end_date = e.detail.value
    },
    onFoodCurrent(e) {
      this.foodSheet.current = e.detail.value
    },
    async saveFood() {
      const f = this.foodSheet
      if (!f || !String(f.name || '').trim()) {
        uni.showToast({ title: '主粮名必填', icon: 'none' })
        return
      }
      this.foodSaving = true
      try {
        const food = { name: f.name.trim(), start_date: f.start_date, end_date: f.end_date, current: f.current, note: f.note }
        const res = f._id
          ? await callFn('foods', { action: 'update', id: f._id, food })
          : await callFn('foods', { action: 'add', food })
        if (res.result && res.result.ok) {
          uni.showToast({ title: '已保存', icon: 'success' })
          this.foodSheet = null
          this.loadFood()
        } else {
          uni.showToast({ title: (res.result && res.result.msg) || '保存失败', icon: 'none' })
        }
      } catch (e) {
        uni.showToast({ title: '保存出错', icon: 'none' })
      } finally {
        this.foodSaving = false
      }
    },
    async setCurrent(f) {
      try {
        const res = await callFn('foods', { action: 'update', id: f._id, food: { current: true } })
        if (res.result && res.result.ok) {
          uni.showToast({ title: '已设为在喂', icon: 'success' })
          this.loadFood()
        }
      } catch (e) {
        uni.showToast({ title: '操作失败', icon: 'none' })
      }
    },
    removeFood(f) {
      uni.showModal({
        title: '删除主粮记录',
        content: `删除「${f.name}」？`,
        confirmColor: '#e05d4e',
        success: async (m) => {
          if (!m.confirm) return
          try {
            const res = await callFn('foods', { action: 'delete', id: f._id })
            if (res.result && res.result.ok) {
              uni.showToast({ title: '已删除', icon: 'success' })
              this.loadFood()
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
  padding-bottom: calc(140rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}

/* 分段控件 */
.seg {
  display: flex;
  background: var(--c-bg-sink);
  border-radius: var(--r-pill);
  padding: 8rpx;
  margin: 24rpx var(--pad-page) 8rpx;
}
.seg__item {
  flex: 1;
  height: 76rpx;
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
/* 左侧类型彩条（对齐主粮卡 + 时间线点的视觉语言）；逾期时统一压成 danger（须在类型色之后，同特异性后者胜） */
.rm-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8rpx;
  background: var(--c-rt-other);
}
.rm-card--med::before { background: var(--c-rt-med); }
.rm-card--vaccine::before { background: var(--c-rt-vaccine); }
.rm-card--deworm::before { background: var(--c-rt-deworm); }
.rm-card--other::before { background: var(--c-rt-other); }
.rm-card--care::before { background: #4fa89b; }
.rm-card--overdue::before { background: var(--c-danger); }
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
.chip-tag--care { color: #3c8579; background: rgba(79, 168, 155, 0.14); }
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
/* 次级操作按钮（提醒卡 + 主粮卡共用，Round 2 合并 rm-op/food-op 为一套 .op） */
.op {
  flex: 1;
  height: 72rpx;
  border-radius: var(--r-pill);
  font-size: var(--fs-cap);
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
}
.op--success { background: var(--c-success-tint); color: var(--c-success); }
.op--secondary { background: var(--c-bg-sink); color: var(--c-text-2); }
.op--danger { background: var(--c-danger-tint); color: var(--c-danger); }
.op--press { opacity: 0.6; }

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

/* ===== 主粮台账 ===== */
.food-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20rpx var(--pad-page) 4rpx;
}
.food-head__title {
  font-size: var(--fs-sub);
  font-weight: 600;
  color: var(--c-text);
}
.food-head__add {
  height: 56rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-pill);
  background: var(--c-primary-tint);
  color: var(--c-primary-deep);
  font-size: var(--fs-cap);
  font-weight: 600;
}
.food-head__add--press {
  opacity: 0.7;
}
.food-list {
  padding: 12rpx var(--pad-page) 8rpx;
}
.food-card {
  position: relative;
  background: var(--c-card);
  border-radius: var(--r-md);
  padding: 28rpx;
  margin-bottom: 20rpx;
  box-shadow: var(--sh-2);
}
.food-card--current::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 8rpx;
  background: var(--c-success);
  border-radius: var(--r-pill) 0 0 var(--r-pill);
}
.food-card__top {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.food-card__name {
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--c-text);
}
.food-card__badge {
  height: 36rpx;
  padding: 0 14rpx;
  border-radius: var(--r-pill);
  background: var(--c-success-tint);
  color: var(--c-success);
  font-size: var(--fs-tiny);
  font-weight: 600;
  display: flex;
  align-items: center;
}
.food-card__period {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
  margin-top: 10rpx;
}
.food-card__note {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-text-3);
  margin-top: 8rpx;
}
.food-card__ops {
  display: flex;
  gap: 16rpx;
  margin-top: 22rpx;
}
/* .food-op* 已并入 .op*（见上，Round 2） */

/* 主粮编辑弹层 */
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
  margin-bottom: 20rpx;
}
.f-form {
  background: var(--c-card-cream);
  border-radius: var(--r-md);
  padding: 4rpx 28rpx;
  margin-bottom: 28rpx;
}
.f-row {
  display: flex;
  align-items: center;
  min-height: 92rpx;
  border-bottom: 2rpx solid var(--c-divider);
}
.f-row:last-child {
  border-bottom: none;
}
.f-row__label {
  width: 150rpx;
  flex: none;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
}
.f-input {
  flex: 1;
  font-size: var(--fs-body);
  color: var(--c-text);
  text-align: right;
}
.f-ph {
  color: var(--c-text-3);
}
.f-pick {
  text-align: right;
}
.f-pick--ph {
  color: var(--c-text-3);
}
.sheet__actions {
  display: flex;
  gap: 20rpx;
}
/* .btn-primary / .btn-ghost (+--press) 已抽到 App.vue 全局（Round 2 去重） */

/* 空状态：.empty/.empty__art/.empty__title/.empty__desc 已抽到 App.vue 全局（Round 2） */
</style>
