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
        <view v-for="(r, i) in reminders" :key="r._id" class="rm-card rise-in" :style="{ 'animation-delay': Math.min(i, 10) * 36 + 'ms' }" :class="['rm-card--' + tagClass(r.type), { 'rm-card--overdue': dayDiff(r.next_date) < 0 }]">
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
        <view class="empty__art"><image class="empty__art-img" src="/static/icon/bell.png" mode="aspectFit" /></view>
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
      <view v-if="foodGroups.length" class="food-list">
        <!-- 按物种分组：每组组头（物种头像 + label）+ 无默认主粮灰提示 + 组内卡片 -->
        <view v-for="(g, gi) in foodGroups" :key="g.key" class="food-grp rise-in" :style="{ 'animation-delay': Math.min(gi, 10) * 36 + 'ms' }">
          <view class="food-grp__head">
            <image class="food-grp__avatar" :src="g.avatar" mode="aspectFit" />
            <text class="food-grp__label">{{ g.label }}</text>
          </view>
          <text v-if="!g.hasDefaultCurrent" class="food-grp__hint">未设置该物种默认主粮</text>
          <view v-for="f in g.list" :key="f._id" class="food-card" :class="{ 'food-card--current': f.current }">
            <view class="food-card__top">
              <text class="food-card__name">{{ foodName(f) }}</text>
              <text class="food-card__scope" :class="{ 'food-card__scope--solo': f.pet }">{{ f.pet ? '仅 ' + f.pet : '全部' + g.label }}</text>
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
      </view>
      <view v-else class="empty">
        <view class="empty__art"><image class="empty__art-img" src="/static/icon/bowl.png" mode="aspectFit" /></view>
        <text class="empty__title">还没有主粮记录</text>
        <text class="empty__desc">点右上「＋ 添加」记下喂过的主粮和时段，给换粮决策留个账</text>
      </view>
    </block>

    <!-- 主粮 编辑弹层 -->
    <view v-if="foodSheet" class="sheet-mask" @click="closeFood" @touchmove.stop.prevent="noop">
      <view class="sheet" @click.stop>
        <view class="sheet__grab"></view>
        <text class="sheet__title">{{ foodSheet._id ? '编辑主粮' : '添加主粮' }}</text>
        <scroll-view scroll-y class="f-form">
          <view class="f-row">
            <text class="f-row__label">物种</text>
            <picker class="f-picker" mode="selector" :range="speciesOptions" range-key="label" :value="speciesIndex" @change="onFoodSpecies">
              <view class="f-input f-pick" :class="{ 'f-pick--ph': !foodSheet.species }">{{ curSpeciesLabel || '点击选择' }}</view>
            </picker>
          </view>
          <view class="f-row">
            <text class="f-row__label">喂给谁</text>
            <picker class="f-picker" mode="selector" :range="petOptions" :value="petIndex" @change="onFoodPet">
              <view class="f-input f-pick">{{ petOptions[petIndex] }}</view>
            </picker>
          </view>
          <view class="f-row"><text class="f-row__label">品牌</text><input class="f-input" v-model="foodSheet.brand" placeholder="如 皇家" placeholder-class="f-ph" /></view>
          <view class="f-row"><text class="f-row__label">型号</text><input class="f-input" v-model="foodSheet.model" placeholder="如 I27+F32 / 无谷鸡肉" placeholder-class="f-ph" /></view>
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
        </scroll-view>
        <view class="sheet__actions">
          <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="closeFood">取消</button>
          <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" :loading="foodSaving" @click="saveFood">保存</button>
        </view>
      </view>
    </view>

    <!-- ===== 药品 ===== -->
    <block v-else>
      <!-- 类型筛选（ADR-035）：仅在库出现 ≥2 种类型时显示（单一类型筛选无意义）；动态随在库类型增减，镜像主粮只显在场物种 -->
      <view v-if="medTypeChips.length > 2" class="med-filter">
        <text v-for="t in medTypeChips" :key="t" class="med-filter__chip" :class="{ 'med-filter__chip--on': medFilter === t }" hover-class="med-filter__chip--press" hover-stay-time="60" @click="medFilter = t">{{ t }}</text>
      </view>
      <view v-if="meds.length" class="med-list">
        <view v-for="(m, i) in filteredMeds" :key="m._id" class="med-card rise-in" :style="{ 'animation-delay': Math.min(i, 10) * 36 + 'ms' }">
          <view class="med-card__main">
            <view class="med-card__icon"><image class="med-card__icon-img" src="/static/icon/pill.png" mode="aspectFit" /></view>
            <view class="med-card__body">
              <view class="med-card__top">
                <text class="med-card__name">{{ m.name }}</text>
                <text class="chip-tag" :class="'chip-tag--' + tagClass(medTypeOf(m))">{{ medTypeOf(m) }}</text>
                <text v-if="isExpiringSoon(m.expire_date)" class="med-card__badge">临期</text>
              </view>
              <text class="med-card__qty">剩余 {{ m.quantity }}</text>
              <text v-if="m.effect" class="med-card__effect">{{ m.effect }}</text>
              <text class="med-card__exp" :class="{ 'med-card__exp--soon': isExpiringSoon(m.expire_date) }">过期 {{ m.expire_date || '未填' }}</text>
            </view>
          </view>
          <view class="med-card__ops">
            <text class="op op--secondary" hover-class="op--press" hover-stay-time="60" @click="openMedEdit(m)">编辑</text>
            <text class="op op--danger" hover-class="op--press" hover-stay-time="60" @click="removeMed(m)">删除</text>
          </view>
        </view>
      </view>
      <view v-else class="empty">
        <view class="empty__art"><image class="empty__art-img" src="/static/icon/pill.png" mode="aspectFit" /></view>
        <text class="empty__title">药箱还空着</text>
        <text class="empty__desc">点底部 ＋ 说一句「买了盒驱虫药，2 支，明年3月过期」，自动入库</text>
      </view>
    </block>

    <!-- 药品 编辑弹层 -->
    <view v-if="medSheet" class="sheet-mask" @click="closeMed" @touchmove.stop.prevent="noop">
      <view class="sheet" @click.stop>
        <view class="sheet__grab"></view>
        <text class="sheet__title">编辑药品</text>
        <scroll-view scroll-y class="f-form">
          <!-- 当时原话（只读 provenance）：有则展示，旧条无原话灰提示 -->
          <view class="f-row f-row--raw">
            <text class="f-row__label">原话</text>
            <text class="f-raw" :class="{ 'f-raw--empty': !medSheet.raw }">{{ medSheet.raw || '（此前版本未保存原话）' }}</text>
          </view>
          <view class="f-row"><text class="f-row__label">药品名</text><input class="f-input" v-model="medSheet.name" placeholder="如 海乐妙" placeholder-class="f-ph" /></view>
          <view class="f-row"><text class="f-row__label">功效</text><input class="f-input" v-model="medSheet.effect" placeholder="如 驱虫，选填" placeholder-class="f-ph" /></view>
          <view class="f-row"><text class="f-row__label">类型</text>
            <picker class="f-picker" mode="selector" :range="medEditTypes" :value="medEditTypeIdx" @change="onMedType">
              <view class="f-input f-pick">{{ medSheet.type || '用药' }}</view>
            </picker>
          </view>
          <view class="f-row"><text class="f-row__label">剩余数量</text><input class="f-input" type="number" v-model="medSheet.quantity" placeholder="0" placeholder-class="f-ph" /></view>
          <view class="f-row">
            <text class="f-row__label">过期日</text>
            <picker class="f-picker" mode="date" :value="medSheet.expire_date || ''" @change="onMedExpire">
              <view class="f-input f-pick" :class="{ 'f-pick--ph': !medSheet.expire_date }">{{ medSheet.expire_date || '点击补填' }}</view>
            </picker>
          </view>
          <view v-if="medSheet.expire_date" class="f-row f-row--clear" @click="clearMedExpire"><text class="f-clear">清除过期日</text></view>
        </scroll-view>
        <view class="sheet__actions">
          <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="closeMed">取消</button>
          <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" :loading="medSaving" @click="saveMed">保存</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { callFn } from '@/cloud'
import { syncTab } from '@/tabSync'
import { SPECIES, speciesLabel, avatarStatic } from '@/species'

export default {
  data() {
    return {
      tab: 'rem', // rem | med | food
      reminders: [],
      today: '',
      remLoaded: false,
      meds: [],
      medLoaded: false,
      medFilter: '全部', // 药品类型筛选（ADR-035）：全部 + 在库出现的类型
      medSheet: null, // 编辑中的药品（null = 弹层关闭）
      medSaving: false,
      foods: [],
      foodLoaded: false,
      foodSheet: null, // 编辑中的主粮（null = 弹层关闭）
      foodSaving: false,
      foodBase: '', // openFoodEdit 那刻的 8 字段快照（JSON）；编辑保存只发改动字段（ADR-033 推广到 foods）
      foodBaseVersion: 0, // 那刻的 updated_at；保存回传做乐观并发校验（期间被家人改过则拒）
      settingCurrent: false, // setCurrent 在途防抖（防双击并发设在喂）
      pets: [], // 家庭宠物（供主粮分组 + 弹层「喂给谁」候选）
    }
  },
  computed: {
    // 药品类型筛选 chip（ADR-035）：全部 + 在库出现的类型（按枚举固定序，空类型不显，镜像主粮在场物种）。
    medTypeChips() {
      const order = ['用药', '疫苗', '驱虫', '养护', '其它']
      const present = new Set(this.meds.map((m) => this.medTypeOf(m)))
      return ['全部', ...order.filter((t) => present.has(t))]
    },
    // 按当前筛选过滤药品；medFilter 失效（该类型已被删空 / 陈旧）时回退全部，避免空列表 + 无空状态。
    filteredMeds() {
      if (this.medFilter === '全部' || !this.medTypeChips.includes(this.medFilter)) return this.meds
      return this.meds.filter((m) => this.medTypeOf(m) === this.medFilter)
    },
    // 编辑弹层类型 picker 候选：固定 5 值 + 并入当前值（防旧值落 index 0 错配）。
    medEditTypes() {
      const base = ['用药', '疫苗', '驱虫', '养护', '其它']
      const cur = this.medSheet && this.medSheet.type
      return cur && !base.includes(cur) ? [...base, cur] : base
    },
    medEditTypeIdx() {
      if (!this.medSheet) return 0
      const i = this.medEditTypes.indexOf(this.medSheet.type)
      return i < 0 ? 0 : i // 默认「用药」（枚举首位）
    },
    // 台账按物种分组：只列「家庭已有宠物的物种 ∪ foods 出现的物种」，按 SPECIES 固定序。
    foodGroups() {
      const present = new Set()
      this.pets.forEach((p) => present.add(p.species || 'other'))
      this.foods.forEach((f) => present.add(f.species || 'other'))
      return SPECIES.filter((s) => present.has(s.key)).map((s) => {
        const list = this.foods.filter((f) => (f.species || 'other') === s.key)
        return {
          key: s.key,
          label: s.label,
          avatar: avatarStatic(s.key),
          list,
          hasDefaultCurrent: list.some((f) => !f.pet && f.current), // 该物种有无「全部默认」在喂
        }
      })
    },
    // 弹层物种 picker 候选：家庭已有物种（按 SPECIES 序）；无宠时给全 8 类兜底。
    speciesOptions() {
      const present = new Set(this.pets.map((p) => p.species || 'other'))
      // 编辑态把当前记录的物种并入候选（即便该物种已无在养宠物 / 物种漂移），避免 picker 错位显成 index 0（ADR-027 verify should-fix）
      if (this.foodSheet && this.foodSheet.species) present.add(this.foodSheet.species)
      const has = SPECIES.filter((s) => present.has(s.key))
      return has.length ? has : SPECIES.slice()
    },
    speciesIndex() {
      if (!this.foodSheet) return 0
      const i = this.speciesOptions.findIndex((s) => s.key === this.foodSheet.species)
      return i < 0 ? 0 : i
    },
    curSpeciesLabel() {
      return this.foodSheet && this.foodSheet.species ? speciesLabel(this.foodSheet.species) : ''
    },
    // 当前物种的宠物候选（按名字）
    petsOfSpecies() {
      if (!this.foodSheet) return []
      const names = this.pets.filter((p) => (p.species || 'other') === this.foodSheet.species).map((p) => p.name).filter(Boolean)
      // 编辑态：当前记录的单宠覆盖名若不在候选里（宠物已删 / 物种漂移），并入，避免 picker 落到「全部」错位（ADR-027 verify should-fix）
      if (this.foodSheet.pet && !names.includes(this.foodSheet.pet)) names.push(this.foodSheet.pet)
      return names
    },
    // 「喂给谁」picker 候选：['全部<物种>'] + 该物种各宠名；index 0 = 全部（pet=''）
    petOptions() {
      const all = '全部' + (this.curSpeciesLabel || '')
      return [all, ...this.petsOfSpecies]
    },
    petIndex() {
      if (!this.foodSheet || !this.foodSheet.pet) return 0
      const i = this.petsOfSpecies.indexOf(this.foodSheet.pet)
      return i < 0 ? 0 : i + 1
    },
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
    this.loadPets()
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
    // 展示用药品类型（ADR-035）：旧条无 type 默认「用药」（backfill_type 会补稳，前端再兜一层）
    medTypeOf(m) {
      return (m && m.type) || '用药'
    },
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
          // 筛选若指向已不存在的类型（删空 / 数据变化）→ 回退全部，避免空列表无空状态（ADR-035）
          if (!this.medTypeChips.includes(this.medFilter)) this.medFilter = '全部'
          this.medLoaded = true
        }
      } catch (e) {
        console.warn('meds load failed', e)
      }
    },
    openMedEdit(m) {
      // 复制成可编辑草稿（raw 只读展示，不进 patch）；quantity 转字符串供 number input 双向绑定
      this.medSheet = {
        _id: m._id,
        name: m.name || '',
        effect: m.effect || '',
        type: m.type || '用药', // 药品类型（ADR-035）
        quantity: m.quantity === 0 || m.quantity ? String(m.quantity) : '',
        expire_date: m.expire_date || '',
        raw: m.raw || '',
      }
    },
    closeMed() {
      this.medSheet = null
    },
    onMedType(e) {
      this.medSheet.type = this.medEditTypes[Number(e.detail.value)]
    },
    onMedExpire(e) {
      this.medSheet.expire_date = e.detail.value
    },
    clearMedExpire() {
      this.medSheet.expire_date = '' // 误填可清空（过期日非必填）
    },
    async saveMed() {
      const m = this.medSheet
      if (!m) return
      if (!String(m.name || '').trim()) {
        uni.showToast({ title: '药品名必填', icon: 'none' })
        return
      }
      this.medSaving = true
      try {
        const med = {
          name: m.name.trim(),
          effect: String(m.effect || '').trim(),
          type: m.type || '用药', // 药品类型（ADR-035）
          expire_date: m.expire_date || '',
        }
        // 数量留空 = 「没动这项」→ 不传，后端 undefined 即保持原值（对齐 meds update 契约）；
        // 真要标用完则显式填 0。避免编辑名 / 功效时顺手清空数量被静默写成 0（用完）。
        if (String(m.quantity).trim() !== '') med.quantity = Number(m.quantity) || 0
        const res = await callFn('meds', { action: 'update', id: m._id, med })
        if (res.result && res.result.ok) {
          uni.showToast({ title: '已保存', icon: 'success' })
          this.medSheet = null
          this.loadMed()
        } else {
          uni.showToast({ title: (res.result && res.result.msg) || '保存失败', icon: 'none' })
        }
      } catch (e) {
        uni.showToast({ title: '保存出错', icon: 'none' })
      } finally {
        this.medSaving = false
      }
    },
    removeMed(m) {
      uni.showModal({
        title: '删除药品',
        content: `删除「${m.name || '该药品'}」？`,
        confirmColor: '#e05d4e',
        success: async (res) => {
          if (!res.confirm) return
          try {
            const r = await callFn('meds', { action: 'delete', id: m._id })
            if (r.result && r.result.ok) {
              uni.showToast({ title: '已删除', icon: 'success' })
              this.loadMed()
            } else {
              uni.showToast({ title: '删除失败', icon: 'none' })
            }
          } catch (e) {
            uni.showToast({ title: '删除失败', icon: 'none' })
          }
        },
      })
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
    async loadPets() {
      if (!this.cloudReady()) return
      try {
        const res = await callFn('pets', { action: 'list' })
        if (res.result && res.result.ok) {
          this.pets = res.result.data || []
        }
      } catch (e) {
        console.warn('pets load failed', e)
      }
    },
    foodPeriod(f) {
      const s = f.start_date || '?'
      return f.current ? `${s} 起 · 在喂` : `${s} ~ ${f.end_date || '?'}`
    },
    // 展示名：品牌 + 型号（型号空只显品牌）
    foodName(f) {
      // brand 兜底旧 name：backfill_foods 跑前的旧条无 brand，避免台账显空名（ADR-027 verify nit，迁移后 brand 必有）
      return (f.brand || f.name || '') + (f.model ? ' ' + f.model : '')
    },
    openFoodAdd() {
      // 默认物种：第一个家庭物种，无宠则 cat
      const sp = (this.speciesOptions[0] && this.speciesOptions[0].key) || 'cat'
      this.foodSheet = { species: sp, pet: '', brand: '', model: '', start_date: '', end_date: '', current: false, note: '' }
    },
    openFoodEdit(f) {
      this.foodSheet = {
        _id: f._id,
        species: f.species || 'cat',
        pet: f.pet || '',
        brand: f.brand || '',
        model: f.model || '',
        start_date: f.start_date || '',
        end_date: f.end_date || '',
        current: !!f.current,
        note: f.note || '',
      }
      // 乐观并发 ADR-033：记进编辑那刻的版本 + 8 字段快照（与 saveFood 的 full 同构），保存时 diff 只发改动字段
      this.foodBaseVersion = f.updated_at || 0
      this.foodBase = JSON.stringify({
        species: f.species || 'cat',
        pet: f.pet || '',
        brand: String(f.brand || '').trim(),
        model: String(f.model || '').trim(),
        start_date: f.start_date || '',
        end_date: f.end_date || '',
        current: !!f.current,
        note: f.note || '',
      })
    },
    closeFood() {
      this.foodSheet = null
    },
    noop() {}, // 仅为给 sheet-mask 绑 catchtouchmove（@touchmove.stop）阻断滚动穿透到背后列表
    onFoodSpecies(e) {
      const opt = this.speciesOptions[Number(e.detail.value)]
      if (!opt) return
      this.foodSheet.species = opt.key
      this.foodSheet.pet = '' // 切物种重置「喂给谁」为全部 + 候选随 computed 刷新
    },
    onFoodPet(e) {
      const i = Number(e.detail.value)
      // index 0 = 全部（pet=''），其余 = 该物种第 i-1 只宠
      this.foodSheet.pet = i <= 0 ? '' : this.petsOfSpecies[i - 1] || ''
    },
    onFoodStart(e) {
      this.foodSheet.start_date = e.detail.value
    },
    onFoodEnd(e) {
      this.foodSheet.end_date = e.detail.value
    },
    onFoodCurrent(e) {
      this.foodSheet.current = e.detail.value
      // 切「在喂」时前端同步清结束日，与后端落库一致（后端 add/update 在喂会清 end_date；ADR-027 verify nit）
      if (e.detail.value) this.foodSheet.end_date = ''
    },
    async saveFood() {
      const f = this.foodSheet
      if (!f || !f.species) {
        uni.showToast({ title: '请选择物种', icon: 'none' })
        return
      }
      if (!String(f.brand || '').trim()) {
        uni.showToast({ title: '品牌必填', icon: 'none' })
        return
      }
      this.foodSaving = true
      try {
        const full = {
          species: f.species,
          pet: f.pet || '',
          brand: f.brand.trim(),
          model: String(f.model || '').trim(),
          start_date: f.start_date,
          end_date: f.end_date,
          current: f.current,
          note: f.note,
        }
        let res
        if (!f._id) {
          res = await callFn('foods', { action: 'add', food: full }) // 建档发全量
        } else {
          // 编辑（ADR-033 推广）：只发改动字段（current 没改就不触发后端排他重放；不同字段并发各写各的）+ base_updated_at 版本校验
          const base = this.foodBase ? JSON.parse(this.foodBase) : {}
          const food = {}
          for (const k in full) if (JSON.stringify(full[k]) !== JSON.stringify(base[k])) food[k] = full[k]
          if (!Object.keys(food).length) {
            uni.showToast({ title: '未改动', icon: 'none' })
            this.foodSheet = null
            return
          }
          res = await callFn('foods', { action: 'update', id: f._id, food, base_updated_at: this.foodBaseVersion })
        }
        if (res.result && res.result.ok) {
          uni.showToast({ title: '已保存', icon: 'success' })
          this.foodSheet = null
          this.loadFood()
        } else if (res.result && res.result.code === 'CONFLICT') {
          // 乐观并发冲突：编辑期间家人改过这条主粮 → 刷新最新、关弹层、提示重编（本次改动未落库）
          this.foodSheet = null
          this.loadFood()
          uni.showModal({ title: '主粮已被家人更新', content: '这条主粮刚被家人改过，已为你刷新到最新版本，请重新编辑后保存。', showCancel: false })
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
      if (this.settingCurrent) return // 防双击并发设在喂（评审：setCurrent 原无防抖守卫）
      this.settingCurrent = true
      try {
        // 快捷设在喂：不带 base_updated_at（系统写、跳版本校验）；只发 current:true，后端排他清理
        const res = await callFn('foods', { action: 'update', id: f._id, food: { current: true } })
        if (res.result && res.result.ok) {
          uni.showToast({ title: '已设为在喂', icon: 'success' })
          this.loadFood()
        } else {
          uni.showToast({ title: (res.result && res.result.msg) || '操作失败', icon: 'none' })
        }
      } catch (e) {
        uni.showToast({ title: '操作失败', icon: 'none' })
      } finally {
        this.settingCurrent = false
      }
    },
    removeFood(f) {
      uni.showModal({
        title: '删除主粮记录',
        content: `删除「${this.foodName(f) || f.brand || '该主粮'}」？`,
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
.rm-card--care::before { background: var(--c-rt-care); }
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
.chip-tag--care { color: var(--c-rt-care-ink); background: var(--c-rt-care-bg); }
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

/* ===== 药品类型筛选（ADR-035） ===== */
.med-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 14rpx;
  padding: 16rpx var(--pad-page) 0;
}
.med-filter__chip {
  height: 56rpx;
  padding: 0 26rpx;
  display: flex;
  align-items: center;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  color: var(--c-text-2);
  font-size: var(--fs-cap);
  font-weight: 500;
}
.med-filter__chip--on {
  background: var(--c-primary-tint);
  color: var(--c-primary-deep);
  font-weight: 600;
}
.med-filter__chip--press {
  opacity: 0.7;
}

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
}
.med-card__main {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
}
.med-card__ops {
  display: flex;
  gap: 16rpx;
  margin-top: 22rpx;
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
}
.med-card__icon-img {
  width: 56rpx;
  height: 56rpx;
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
/* 物种分组段 */
.food-grp {
  margin-bottom: 28rpx;
}
.food-grp__head {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-bottom: 14rpx;
  padding-left: 4rpx;
}
.food-grp__avatar {
  width: 40rpx;
  height: 40rpx;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  flex: none;
}
.food-grp__label {
  font-size: var(--fs-sub);
  font-weight: 600;
  color: var(--c-text);
}
.food-grp__hint {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-text-3);
  background: var(--c-bg-sink);
  border-radius: var(--r-sm);
  padding: 14rpx 22rpx;
  margin-bottom: 16rpx;
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
/* 对象标签 chip：全部<物种>（灰）/ 仅 某宠（主色高亮） */
.food-card__scope {
  flex: none;
  height: 36rpx;
  padding: 0 16rpx;
  border-radius: var(--r-pill);
  font-size: var(--fs-tiny);
  font-weight: 600;
  display: flex;
  align-items: center;
  background: var(--c-bg-sink);
  color: var(--c-text-2);
}
.food-card__scope--solo {
  background: var(--c-primary-tint);
  color: var(--c-primary-deep);
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
  /* 底部留出 ~原生 tabBar 高度（fixed z-index:100 在浮层之上，见 custom-tab-bar），否则「保存/取消」被 tabBar 压住点不到 */
  padding: 16rpx var(--pad-page) calc(180rpx + env(safe-area-inset-bottom));
  /* 字段多于一屏时整体封顶 + 表单区内部滚动，保证「保存/取消」常驻可点（ADR-027 加了物种/喂给谁两行后会顶出屏） */
  display: flex;
  flex-direction: column;
  max-height: 88vh;
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
  flex: 1 1 auto;
  min-height: 0; /* 让 scroll-view 在 flex 列里可收缩并内部滚动，否则会撑开把 actions 顶出屏 */
  background: var(--c-card-cream);
  border-radius: var(--r-md);
  padding: 4rpx 28rpx;
  margin-bottom: 28rpx;
}
.f-row {
  display: flex;
  align-items: center;
  min-height: 92rpx;
  border-bottom: 1px solid var(--c-divider);
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
/* 只读「原话」行：多行展示当时录入原句（provenance），右对齐随表单语言 */
.f-row--raw {
  align-items: flex-start;
  padding: 18rpx 0;
}
.f-raw {
  flex: 1;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
  text-align: right;
  line-height: 1.5;
}
.f-raw--empty {
  color: var(--c-text-3);
}
/* 清除过期日：整行可点的次级危险操作 */
.f-row--clear {
  justify-content: flex-end;
  min-height: 72rpx;
}
.f-clear {
  font-size: var(--fs-cap);
  color: var(--c-danger);
}
.sheet__actions {
  display: flex;
  gap: 20rpx;
}
/* .btn-primary / .btn-ghost (+--press) 已抽到 App.vue 全局（Round 2 去重） */

/* 空状态：.empty/.empty__art/.empty__title/.empty__desc 已抽到 App.vue 全局（Round 2） */
</style>
