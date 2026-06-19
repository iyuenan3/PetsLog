<template>
  <view class="page" v-if="pet">
    <!-- 头部（创建模式只显示表单） -->
    <view class="profile-head" v-if="!creating">
      <view class="profile-head__avatar">
        <image v-if="pet.avatar" :src="pet.avatar" class="profile-head__avatar-img" mode="aspectFill"></image>
        <text v-else-if="pet.avatar_emoji">{{ pet.avatar_emoji }}</text>
        <image v-else-if="!defAvatarErr" :src="spAvatar(pet.species)" class="profile-head__avatar-img" mode="aspectFill" @error="defAvatarErr = true"></image>
        <text v-else>{{ spEmoji(pet.species) }}</text>
      </view>
      <text class="profile-head__name">{{ pet.name }}</text>
      <text class="profile-head__meta">{{ ageText(pet.birthday) || '年龄未知' }} · {{ spLabel(pet.species) }}</text>
    </view>

    <!-- 导出：兽医小结 / 档案卡 -->
    <view v-if="!creating" class="export-row">
      <button class="btn-vet" hover-class="btn-vet--press" hover-stay-time="80" :loading="exporting" @click="exportVet"><image v-if="!exporting" class="ic ic--sm" src="/static/icon/clipboard.png" mode="aspectFit" /><text>兽医小结</text></button>
      <button class="btn-vet" hover-class="btn-vet--press" hover-stay-time="80" :loading="cardExporting" @click="exportCard"><image v-if="!cardExporting" class="ic ic--sm" src="/static/icon/idcard.png" mode="aspectFit" /><text>档案卡</text></button>
    </view>

    <!-- 体重曲线 -->
    <view class="card-block" v-if="!creating">
      <view class="card-block__head">
        <text class="card-block__title">体重曲线</text>
        <text class="card-block__sub" v-if="series.length">{{ series.length }} 次 · 最新 {{ series[series.length - 1].weight }}kg</text>
      </view>
      <!-- 横向平移：canvas 固定视口宽，手指在画布上拖动重绘（不用 scroll-view 套 canvas：
           同层渲染失败时触摸被原生组件吞掉、滑动手势到不了 scroll-view，模拟器/真机表现不一） -->
      <view v-if="series.length && !overlayOpen" class="weight-wrap">
        <view class="weight-yaxis">
          <text class="weight-yaxis__t">{{ wMax }}</text>
          <text class="weight-yaxis__t">{{ wMin }}</text>
        </view>
        <view class="weight-body">
          <canvas type="2d" id="weightChart" class="weight-chart" @touchstart="chartTouchStart" @touchmove.stop="chartTouchMove" @touchend="chartTouchEnd"></canvas>
        </view>
      </view>
      <text v-if="series.length && canScroll && !overlayOpen" class="weight-hint">← 按住曲线左右拖动看更早记录</text>
      <view v-else-if="!series.length" class="chart-empty">
        <image class="chart-empty__icon" src="/static/icon/scale.png" mode="aspectFit" />
        <text class="chart-empty__title">还没有体重数据</text>
        <text class="chart-empty__hint">回首页说一句「{{ pet.name }} 今天 X.X kg」即可记上</text>
      </view>
    </view>

    <!-- 基础档案：只读 -->
    <view class="card-block" v-if="!editing">
      <view class="card-block__head">
        <text class="card-block__title">基础档案</text>
        <text class="edit-btn" hover-class="edit-btn--press" hover-stay-time="60" @click="startEdit">编辑</text>
      </view>
      <view class="rows">
        <view class="row"><text class="row__k">品种</text><text class="row__v">{{ pet.breed || '未填' }}</text></view>
        <view class="row"><text class="row__k">生日</text><text class="row__v">{{ pet.birthday || '未填' }}</text></view>
        <view class="row"><text class="row__k">性别</text><text class="row__v">{{ pet.gender === 'male' ? '公 ♂' : pet.gender === 'female' ? '母 ♀' : '未填' }}</text></view>
        <view class="row"><text class="row__k">绝育</text><text class="row__v">{{ pet.neutered ? '是' : '否' }}</text></view>
        <view class="row"><text class="row__k">过敏史</text><text class="row__v">{{ pet.allergy || '无' }}</text></view>
        <view class="row"><text class="row__k">病史</text><text class="row__v">{{ pet.chronic || '无' }}</text></view>
        <view class="row"><text class="row__k">最新体重</text><text class="row__v">{{ pet.latest_weight ? pet.latest_weight + 'kg' : '未记' }}</text></view>
        <!-- 当前主粮（ADR-027）：单宠覆盖 > 物种默认 > 无；无记录走灰占位 -->
        <view class="row"><text class="row__k">当前主粮</text><text class="row__v" :class="{ 'row__v--empty': !foodText }">{{ foodText || '未记录' }}</text></view>
        <view class="row"><text class="row__k">到家日期</text><text class="row__v">{{ pet.home_date || '未填' }}</text></view>
        <view class="row"><text class="row__k">初始身价</text><text class="row__v">{{ pet.price_base != null ? '¥' + pet.price_base : '未填' }}</text></view>
        <view class="row" v-if="hasPrice"><text class="row__k">当前身价</text><text class="row__v">¥{{ priceShow }}<text class="row__sub"> (含累计花费 ¥{{ costSum }})</text></text></view>
        <view class="row"><text class="row__k">简介</text><text class="row__v">{{ pet.intro || '无' }}</text></view>
        <view class="row"><text class="row__k">备注</text><text class="row__v">{{ pet.note || '无' }}</text></view>
      </view>
    </view>

    <!-- 基础档案：编辑 / 创建 -->
    <view class="card-block" v-else>
      <view class="card-block__head"><text class="card-block__title">{{ creating ? '新宠物建档' : '编辑档案' }}</text></view>
      <view class="form">
        <view class="form-row">
          <text class="form-row__label">头像</text>
          <view class="avatar-edit" hover-class="avatar-edit--press" hover-stay-time="60" @click="pickAvatar">
            <image v-if="form.avatar" :src="form.avatar" class="avatar-edit__img" mode="aspectFill"></image>
            <text v-else-if="form.avatar_emoji" class="avatar-edit__emoji">{{ form.avatar_emoji }}</text>
            <text v-else class="avatar-edit__ph">＋</text>
          </view>
        </view>
        <!-- emoji 头像（ADR-015）：点选即用；已传照片时照片优先，选 emoji 会移除照片 -->
        <view class="form-row form-row--top">
          <text class="form-row__label">或选 emoji</text>
          <view class="emoji-grid">
            <text
              v-for="e in emojiOptions"
              :key="e"
              :class="['emoji-cell', form.avatar_emoji === e && !form.avatar ? 'emoji-cell--active' : '']"
              @click="pickEmoji(e)"
              >{{ e }}</text
            >
          </view>
        </view>
        <view class="form-row"><text class="form-row__label">名字</text><input class="form-input" v-model="form.name" placeholder="必填" placeholder-class="form-ph" /></view>
        <view class="form-row">
          <text class="form-row__label">种类</text>
          <view class="chips">
            <text
              v-for="s in speciesList"
              :key="s.key"
              :class="['chip', form.species === s.key ? 'chip--active' : '']"
              @click="pickSpecies(s.key)"
              >{{ s.emoji }} {{ s.label }}</text
            >
          </view>
        </view>
        <view class="form-row"><text class="form-row__label">品种</text><input class="form-input" v-model="form.breed" placeholder="如 布偶 / 金毛" placeholder-class="form-ph" /></view>
        <view class="form-row">
          <text class="form-row__label">性别</text>
          <view class="chips">
            <text :class="['chip', form.gender === 'male' ? 'chip--active' : '']" @click="pickGender('male')">♂ 公</text>
            <text :class="['chip', form.gender === 'female' ? 'chip--active' : '']" @click="pickGender('female')">♀ 母</text>
            <text :class="['chip', !form.gender ? 'chip--active' : '']" @click="pickGender('')">未填</text>
          </view>
        </view>
        <view class="form-row">
          <text class="form-row__label">生日</text>
          <picker class="form-picker" mode="date" :value="form.birthday || ''" @change="onBirthday">
            <view class="form-input picker-val" :class="{ 'picker-val--ph': !form.birthday }">{{ form.birthday || '点击选择' }}</view>
          </picker>
        </view>
        <view class="form-row">
          <text class="form-row__label">到家日期</text>
          <picker class="form-picker" mode="date" :value="form.home_date || ''" @change="onHomeDate">
            <view class="form-input picker-val" :class="{ 'picker-val--ph': !form.home_date }">{{ form.home_date || '点击选择' }}</view>
          </picker>
        </view>
        <view class="form-row"><text class="form-row__label">绝育</text><switch :checked="form.neutered" color="#f2825c" @change="onNeutered" /></view>
        <view class="form-row"><text class="form-row__label">过敏史</text><input class="form-input" v-model="form.allergy" placeholder="无则留空" placeholder-class="form-ph" /></view>
        <view class="form-row"><text class="form-row__label">病史</text><input class="form-input" v-model="form.chronic" placeholder="无则留空" placeholder-class="form-ph" /></view>
        <view class="form-row"><text class="form-row__label">初始身价</text><input class="form-input" type="digit" v-model="form.price_base" placeholder="元，可留空" placeholder-class="form-ph" /></view>
        <view class="form-row"><text class="form-row__label">简介</text><input class="form-input" v-model="form.intro" placeholder="一句话介绍，可留空" placeholder-class="form-ph" /></view>
        <view class="form-row"><text class="form-row__label">备注</text><input class="form-input" v-model="form.note" placeholder="来历 / 习性等，可留空" placeholder-class="form-ph" /></view>
      </view>
      <view class="form-actions">
        <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="cancelEdit">取消</button>
        <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" :loading="saving" @click="save">{{ creating ? '建档' : '保存' }}</button>
      </view>
      <view v-if="!creating" class="del-link" hover-class="del-link--press" hover-stay-time="60" @click="confirmDelete">删除这只宠物的<text class="del-link__hot">档案</text></view>
    </view>

    <!-- 给兽医的小结：生成结果浮层 -->
    <view v-if="vetImg" class="vet-mask" @click="vetImg = ''">
      <view class="vet-box" @click.stop>
        <image :src="vetImg" mode="widthFix" class="vet-img" show-menu-by-longpress></image>
        <text class="vet-tip">长按图片可转发 / 保存</text>
        <view class="vet-actions">
          <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="vetImg = ''">关闭</button>
          <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" @click="saveVetImg">保存到相册</button>
        </view>
      </view>
    </view>

    <!-- 档案卡：生成结果浮层（复用兽医小结浮层样式） -->
    <view v-if="cardImg" class="vet-mask" @click="cardImg = ''">
      <view class="vet-box" @click.stop>
        <image :src="cardImg" mode="widthFix" class="vet-img" show-menu-by-longpress></image>
        <text class="vet-tip">长按图片可转发 / 保存</text>
        <view class="vet-actions">
          <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="cardImg = ''">关闭</button>
          <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" @click="saveCardImg">保存到相册</button>
        </view>
      </view>
    </view>

    <!-- 离屏导出画布（移出可视区，仅用于生成图片） -->
    <canvas type="2d" id="vetCanvas" :style="{ width: cw + 'px', height: ch + 'px', position: 'fixed', left: '-9999px', top: '0' }"></canvas>
    <canvas type="2d" id="cardCanvas" :style="{ width: cardW + 'px', height: cardH + 'px', position: 'fixed', left: '-9999px', top: '0' }"></canvas>
  </view>

  <view v-else class="page-empty"><text>加载中…</text></view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { petAge } from '@/utils'
import { paintPetCard, loadPetAvatar, loadCardIcons, CARD_W, CARD_H } from '@/petCard'
import { SPECIES, speciesLabel, speciesEmoji, avatarStatic } from '@/species'
import { resolveCurrentFood } from '@/foodsResolve'
import { callFn, uploadAvatar } from '@/cloud'

export default {
  data() {
    return {
      id: '',
      pet: null,
      creating: false, // 创建模式（?mode=new，ADR-015 手动建宠入口）
      defAvatarErr: false, // 物种默认头像静态图加载失败（图未就位）→ 回退 emoji（ADR-023）
      speciesList: SPECIES, // 物种选择 chip（ADR-023 多物种）
      // emoji 头像候选（多物种，ADR-023）
      emojiOptions: ['🐱', '😺', '😸', '🐈', '🐈‍⬛', '🐶', '🐕', '🦮', '🐩', '🐰', '🐹', '🐭', '🐦', '🦜', '🐢', '🦎', '🐠', '🐟', '🐾'],
      series: [],
      // 体重曲线拖动平移：canvas 固定视口宽，虚拟内容宽 _contentW，_offsetX 为当前平移量（默认最右=最新）。
      // _offsetX/_ctx 等用下划线普通属性存（不进 data，拖动重绘不触发 setData）
      canScroll: false,
      yMin: 0,
      yMax: 0,
      costSum: 0, // 该宠累计花费 = records.cost 之和；当前身价 = price_base + costSum（派生不落库）
      priceShow: 0, // 当前身价 count-up 显示值（从 0 缓动滚到 priceNow，纯展示）
      currentFood: null, // 该宠当前主粮（ADR-027 解析：单宠覆盖 > 物种默认 > 无），food 对象或 null
      editing: false,
      saving: false,
      form: {},
      // 给兽医的小结
      exporting: false,
      exportRecs: [],
      vetHasMore: false, // 记录超过展示上限时给提示
      vetImg: '',
      cw: 340,
      ch: 480,
      // 宠物档案卡（ADR-021）：海报风可分享图片，固定 320×440 逻辑（dpr3 物理 < 4096）
      cardImg: '',
      cardExporting: false,
      cardW: CARD_W,
      cardH: CARD_H,
    }
  },
  onLoad(opts) {
    this.id = (opts && opts.id) || ''
    if (opts && opts.mode === 'new') {
      // 创建模式：空档案直接进编辑表单（ADR-015）
      this.creating = true
      this.pet = { name: '', species: 'cat' }
      this.form = {
        name: '',
        species: 'cat',
        breed: '',
        gender: '',
        birthday: '',
        neutered: false,
        allergy: '',
        chronic: '',
        home_date: '',
        note: '',
        intro: '',
        price_base: '',
        avatar: '',
        avatar_emoji: '',
      }
      this.editing = true
      uni.setNavigationBarTitle({ title: '添加宠物' })
      return
    }
    this.load()
  },
  onUnload() {
    // 清 count-up 定时器，避免页面卸载后继续 setData 告警
    if (this._priceTimer) {
      clearTimeout(this._priceTimer)
      this._priceTimer = null
    }
  },
  computed: {
    // 当前身价 = 初始身价 + 累计花费（派生，不落库，见 ADR-014）
    priceNow() {
      const base = this.pet && typeof this.pet.price_base === 'number' ? this.pet.price_base : 0
      return base + this.costSum
    },
    hasPrice() {
      return (this.pet && typeof this.pet.price_base === 'number') || this.costSum > 0
    },
    // 当前主粮展示文案：品牌 + 型号（型号有则空格拼接）；无则空串（模板走灰占位「未记录」）
    foodText() {
      const f = this.currentFood
      if (!f) return ''
      return (f.brand || '') + (f.model ? ' ' + f.model : '')
    },
    // 固定 y 轴上下标签（取派生的 yMax/yMin，与画布渲染同一范围）
    wMax() {
      return this.series.length ? this.yMax.toFixed(1) : ''
    },
    wMin() {
      return this.series.length ? this.yMin.toFixed(1) : ''
    },
    // 浮层（兽医小结 / 档案卡）打开时须摘掉体重曲线原生 canvas：type=2d canvas 不受普通 view 的 z-index 约束，
    // 会穿透盖在浮层之上（真机实证：曲线橙线 + 日期标签压在档案卡上）。见 MEMORY 原生组件浮层穿透。
    overlayOpen() {
      return !!this.cardImg || !!this.vetImg
    },
  },
  watch: {
    // 浮层关闭后体重曲线 canvas 重新挂载（v-if 销毁过节点），需重绘否则空白
    overlayOpen(open) {
      if (!open) this.$nextTick(() => this.layoutAndDraw())
    },
  },
  methods: {
    ageText(b) {
      return petAge(b)
    },
    cloudReady() {
      // #ifdef MP-WEIXIN
      return typeof wx !== 'undefined' && !!wx.cloud && !!CLOUD_ENV && !!this.id
      // #endif
      // eslint-disable-next-line no-unreachable
      return false
    },
    async load() {
      if (!this.cloudReady()) return
      try {
        const res = await callFn('pets', { action: 'get', id: this.id })
        if (res.result && res.result.ok) {
          this.pet = res.result.data
          uni.setNavigationBarTitle({ title: this.pet.name || '宠物档案' })
          // 身价显示先落到当前可知值（priceNow=base，此刻 costSum 仍 0）：
          // ① 避免 loadWeight 返回前静止显示 ¥0；② loadWeight 失败/弱网时身价行不回退成 ¥0（priceShow 始终以 priceNow 兜底）。
          this.priceShow = this.priceNow
          this.loadWeight()
          this.loadCurrentFood() // 当前主粮（ADR-027），独立拉取不阻塞体重 / 身价
        }
      } catch (e) {
        console.warn('pet load failed', e)
      }
    },
    // 当前主粮（ADR-027）：拉家庭主粮列表，按「单宠覆盖在喂 > 物种默认在喂 > 无」解析该宠在喂粮。
    // list 已按 current desc + start_date desc 排序，多条命中同档（脏数据）取第一个。失败保持 null（不崩）。
    async loadCurrentFood() {
      if (!this.pet) return
      try {
        const res = await callFn('foods', { action: 'list' })
        if (!(res.result && res.result.ok)) return
        const list = res.result.data || []
        // 解析「单宠覆盖在喂 > 物种默认在喂 > 无」抽到 foodsResolve（单一真相源 + 可单测，见 tests/foodsResolve.test.js）
        this.currentFood = resolveCurrentFood(list, this.pet.name, this.pet.species)
      } catch (e) {
        console.warn('current food load failed', e)
      }
    },
    async loadWeight() {
      // 复用 timeline 云函数按宠物名取记录，前端筛出有体重的算曲线 + 求累计花费。
      // limit 1000：覆盖单宠多年历史（导入后单宠可数百条），否则当前身价(=base+累计花费)会被截断少算。
      try {
        const res = await callFn('timeline', { action: 'list', pet: this.pet.name, limit: 1000 })
        if (res.result && res.result.ok) {
          const recs = res.result.data || []
          this.series = recs
            .filter((r) => typeof r.weight === 'number' && r.weight > 0)
            .map((r) => ({ date: r.time || '', weight: r.weight, at: r.created_at || 0 }))
            .sort((a, b) => a.at - b.at || String(a.date).localeCompare(String(b.date)))
          // 累计花费：该宠 records.cost 求和（cost 三态，仅累计数值；到家身价已在导入时置 None 不计）
          this.costSum = recs.reduce((s, r) => s + (typeof r.cost === 'number' ? r.cost : 0), 0)
          this.animatePrice() // 当前身价 count-up（costSum 就绪后，priceNow 才有终值）
          this.$nextTick(() => this.layoutAndDraw())
        }
      } catch (e) {
        console.warn('weight load failed', e)
      }
    },
    // 当前身价 count-up：从当前显示值缓动(easeOutCubic)滚到 priceNow，~700ms。
    // load() 已把 priceShow 落到 base，loadWeight 拿到累计花费后这里再滚 base→当前身价（不从 0 起跳，避免回跳/¥0）。
    // mp 无 requestAnimationFrame，用递归 setTimeout 逐帧；_priceTimer 走下划线普通属性（不进 data，重进页先清防叠）。
    animatePrice() {
      const from = this.priceShow
      const to = this.priceNow
      if (this._priceTimer) {
        clearTimeout(this._priceTimer)
        this._priceTimer = null
      }
      // 终点非正、或不高于起点（无累计花费）：直接落位不滚
      if (!to || to <= 0 || to <= from) {
        this.priceShow = to > 0 ? to : 0
        return
      }
      const dur = 700
      const start = Date.now()
      const tick = () => {
        const t = Math.min(1, (Date.now() - start) / dur)
        const eased = 1 - Math.pow(1 - t, 3)
        this.priceShow = Math.round(from + (to - from) * eased)
        if (t < 1) {
          this._priceTimer = setTimeout(tick, 16)
        } else {
          this.priceShow = to
          this._priceTimer = null
        }
      }
      tick()
    },
    // 先量视口宽算布局，再画。布局：等间距（每点 ≥56px），点多 → 虚拟内容变宽 → 拖动平移看更早
    layoutAndDraw(retry) {
      if (!this.series.length) return
      // #ifdef MP-WEIXIN
      uni
        .createSelectorQuery()
        .in(this)
        .select('#weightChart')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            // canvas 尚未渲染好稍后重试；封顶 10 次（页面已销毁时 query 永远空，无上限会在逻辑层永久空转）
            const r = (retry || 0) + 1
            if (r <= 10) setTimeout(() => this.layoutAndDraw(r), 60)
            return
          }
          const canvas = res[0].node
          const W = res[0].width
          const H = res[0].height
          this.computeLayout(W)
          const dpr = uni.getSystemInfoSync().pixelRatio || 2
          canvas.width = W * dpr // 视口宽画布（≈400 CSS px），远低于微信 canvas 2d ~4096 物理上限
          canvas.height = H * dpr
          const ctx = canvas.getContext('2d')
          ctx.scale(dpr, dpr)
          // 存引用供拖动重绘（普通属性不进 data，重绘不触发 setData）
          this._ctx = ctx
          this._W = W
          this._H = H
          this.renderTimeLine(ctx, W, H)
        })
      // #endif
    },
    computeLayout(vw) {
      const pts = this.series
      const ws = pts.map((p) => p.weight)
      let min = Math.min(...ws)
      let max = Math.max(...ws)
      if (min === max) {
        min -= 0.5
        max += 0.5
      } else {
        const m = (max - min) * 0.18
        min -= m
        max += m
      }
      this.yMin = min
      this.yMax = max
      // 等间距：每点至少 56px（密集期也拉开看得清）；点稀疏时平铺填满视口
      const n = pts.length
      const padX = 32 // 画布内 padL + padR（与 renderTimeLine 的 16+16 一致）
      const plotFull = Math.max(60, Math.round(vw) - padX)
      const minStep = 56
      const step = n > 1 ? Math.max(minStep, plotFull / (n - 1)) : 0
      this._step = step
      const contentW = Math.max(Math.round(vw), Math.round(padX + step * (n - 1)))
      this._maxOffset = Math.max(0, contentW - Math.round(vw))
      this._offsetX = this._maxOffset // 默认平移到最右 = 最新
      this.canScroll = this._maxOffset > 0
      this._sel = null // 数据/布局变化时收起点详情气泡
    },
    chartTouchStart(e) {
      const t = e.touches && e.touches[0]
      this._tx = t ? t.clientX : 0 // 拖动增量基准（每次 touchmove 刷新）
      this._sx = t ? t.clientX : 0 // 点按阈值起点（不刷新；_tx 每帧被刷会让慢拖的瞬时增量 <8px 误判成点按）
      this._sy = t ? t.clientY : 0
      this._moved = false // 区分拖动 / 点按：累计位移超阈值算拖动，touchend 不再当点按
    },
    chartTouchMove(e) {
      const t = e.touches && e.touches[0]
      if (!t) return
      if (Math.abs(t.clientX - this._sx) > 8 || Math.abs(t.clientY - this._sy) > 8) this._moved = true
      if (!this.canScroll || !this._ctx) return
      const dx = t.clientX - this._tx
      this._tx = t.clientX
      const next = Math.min(this._maxOffset, Math.max(0, this._offsetX - dx))
      if (next === this._offsetX) return
      this._offsetX = next
      this.renderTimeLine(this._ctx, this._W, this._H)
    },
    // 点按数据点 → 气泡显示该点日期 + 体重；点空白处收起
    chartTouchEnd(e) {
      if (this._moved || !this._ctx) return
      const t = e.changedTouches && e.changedTouches[0]
      if (!t) return
      // 平移量同步快照：异步 rect 回调期间用户可能已再次拖动，用回调时刻的 _offsetX 会命中错点
      const off = this._offsetX || 0
      // 实时查 canvas 视口位置换算本地坐标（页面可滚动，不能用缓存的 rect）
      uni
        .createSelectorQuery()
        .in(this)
        .select('#weightChart')
        .boundingClientRect()
        .exec((res) => {
          const rect = res && res[0]
          if (!rect) return
          const lx = t.clientX - rect.left
          const ly = t.clientY - rect.top
          const pts = this.series
          const n = pts.length
          const step = this._step || 0
          const padL = 16
          const plotW = this._W - 32
          const x = (i) => (n === 1 ? padL + plotW / 2 : padL + step * i - off)
          // 按 x 找最近点（阈值 28px）；y 限制在图区内（H-24 排除底部日期标签区，padB=30 留 6px 容差）
          let best = -1
          let bestDx = 28
          for (let i = 0; i < n; i++) {
            const dx = Math.abs(x(i) - lx)
            if (dx < bestDx) {
              bestDx = dx
              best = i
            }
          }
          this._sel = best >= 0 && ly >= 0 && ly <= this._H - 24 ? best : null
          this.renderTimeLine(this._ctx, this._W, this._H)
        })
    },
    renderTimeLine(ctx, W, H) {
      const pts = this.series
      const n = pts.length
      const padL = 16
      const padR = 16
      const padT = 18
      const padB = 30
      const plotW = W - padL - padR
      const plotH = H - padT - padB
      ctx.clearRect(0, 0, W, H)

      const min = this.yMin
      const max = this.yMax
      const step = this._step || 0
      const off = this._offsetX || 0
      // 等间距：单点居中，多点按固定 step 排，再减当前平移量（拖动平移看更早）
      const x = (i) => (n === 1 ? padL + plotW / 2 : padL + step * i - off)
      const y = (w) => padT + plotH - ((w - min) / (max - min)) * plotH

      // 横向网格（淡虚线，3 条）
      ctx.strokeStyle = '#F2EAE0'
      ctx.lineWidth = 1
      if (ctx.setLineDash) ctx.setLineDash([3, 5])
      for (let g = 0; g <= 2; g++) {
        const gy = padT + (plotH * g) / 2
        ctx.beginPath()
        ctx.moveTo(padL, gy)
        ctx.lineTo(padL + plotW, gy)
        ctx.stroke()
      }
      if (ctx.setLineDash) ctx.setLineDash([])

      // 面积填充（珊瑚渐隐）
      if (n > 1) {
        const grd = ctx.createLinearGradient(0, padT, 0, padT + plotH)
        grd.addColorStop(0, 'rgba(242,130,92,0.18)')
        grd.addColorStop(1, 'rgba(242,130,92,0)')
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.moveTo(x(0), y(pts[0].weight))
        pts.forEach((p, i) => ctx.lineTo(x(i), y(p.weight)))
        ctx.lineTo(x(n - 1), padT + plotH)
        ctx.lineTo(x(0), padT + plotH)
        ctx.closePath()
        ctx.fill()
      }

      // 折线
      if (n > 1) {
        ctx.strokeStyle = '#F2825C'
        ctx.lineWidth = 2.5
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.beginPath()
        pts.forEach((p, i) => {
          const px = x(i)
          const py = y(p.weight)
          if (i) ctx.lineTo(px, py)
          else ctx.moveTo(px, py)
        })
        ctx.stroke()
      }

      // 数据点：白底珊瑚描边，最后一个高亮
      pts.forEach((p, i) => {
        const px = x(i)
        const py = y(p.weight)
        if (i === n - 1) {
          ctx.fillStyle = 'rgba(242,130,92,0.22)'
          ctx.beginPath()
          ctx.arc(px, py, 9, 0, Math.PI * 2)
          ctx.fill()
          ctx.fillStyle = '#F2825C'
          ctx.beginPath()
          ctx.arc(px, py, 5, 0, Math.PI * 2)
          ctx.fill()
        } else {
          ctx.fillStyle = '#FFFFFF'
          ctx.beginPath()
          ctx.arc(px, py, 4, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#F2825C'
          ctx.lineWidth = 2
          ctx.stroke()
        }
      })

      // 日期标签：按距离间隔挑点画（≥70px 才画下一个），杜绝重叠；首末必标
      ctx.fillStyle = '#B5ABA2'
      ctx.font = '10px sans-serif'
      ctx.textBaseline = 'top'
      const labelIdx = []
      let lastX = -999
      for (let i = 0; i < n; i++) {
        if (x(i) - lastX >= 70) {
          labelIdx.push(i)
          lastX = x(i)
        }
      }
      if (n > 1 && labelIdx[labelIdx.length - 1] !== n - 1) {
        if (x(n - 1) - x(labelIdx[labelIdx.length - 1]) < 70) labelIdx[labelIdx.length - 1] = n - 1
        else labelIdx.push(n - 1)
      }
      labelIdx.forEach((i) => {
        ctx.textAlign = i === 0 ? 'left' : i === n - 1 ? 'right' : 'center'
        ctx.fillText(this.shortDate(pts[i].date), x(i), padT + plotH + 8)
      })

      // 选中点详情气泡：完整日期 + 体重（点按数据点触发，点空白收起；随平移跟随）。
      // 点被拖出视口时跳过绘制（否则气泡被夹紧在画布边缘悬空指向不可见的点），_sel 保留，拖回来气泡再现
      if (this._sel != null && this._sel >= 0 && this._sel < n && x(this._sel) >= -9 && x(this._sel) <= W + 9) {
        const i = this._sel
        const px = x(i)
        const py = y(pts[i].weight)
        ctx.strokeStyle = '#F2825C'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(px, py, 8, 0, Math.PI * 2)
        ctx.stroke()
        const label = `${pts[i].date || '日期未知'} · ${pts[i].weight}kg`
        ctx.font = '11px sans-serif'
        const tw = ctx.measureText(label).width
        const bw = tw + 18
        const bh = 24
        let bx = px - bw / 2
        bx = Math.max(4, Math.min(W - 4 - bw, bx))
        let by = py - bh - 12
        if (by < 2) by = py + 14 // 点贴顶时气泡画在点下方
        ctx.fillStyle = 'rgba(61, 50, 44, 0.92)'
        const r = 6
        ctx.beginPath()
        ctx.moveTo(bx + r, by)
        ctx.arcTo(bx + bw, by, bx + bw, by + bh, r)
        ctx.arcTo(bx + bw, by + bh, bx, by + bh, r)
        ctx.arcTo(bx, by + bh, bx, by, r)
        ctx.arcTo(bx, by, bx + bw, by, r)
        ctx.closePath()
        ctx.fill()
        ctx.fillStyle = '#FFFFFF'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(label, bx + bw / 2, by + bh / 2 + 0.5)
      }
    },
    shortDate(d) {
      // 带日防同月多点标签重复："2025-08-05" → "25/08/05"
      return d ? String(d).slice(2, 10).replace(/-/g, '/') : ''
    },
    startEdit() {
      const p = this.pet
      this.form = {
        name: p.name || '',
        species: p.species || 'cat', // 物种透传（ADR-023 多物种），editable chip 选；pets 云函数 normSpecies 兜底
        breed: p.breed || '',
        gender: p.gender === 'male' || p.gender === 'female' ? p.gender : '', // 性别（ADR-025）
        birthday: p.birthday || '',
        neutered: !!p.neutered,
        allergy: p.allergy || '',
        chronic: p.chronic || '',
        home_date: p.home_date || '',
        note: p.note || '',
        intro: p.intro || '',
        price_base: p.price_base != null ? String(p.price_base) : '',
        avatar: p.avatar || '',
        avatar_emoji: p.avatar_emoji || '',
      }
      this.editing = true
    },
    // 丢弃本编辑会话新传未落库的头像文件（头像是即选即传，ADR-011「取消不留孤儿」要求显式清理）。
    // 只删「≠ 库内已存 avatar」的，绝不动已落库文件。
    discardTempAvatar() {
      const saved = (this.pet && this.pet.avatar) || ''
      const tmp = this.form && this.form.avatar
      // #ifdef MP-WEIXIN
      if (tmp && tmp !== saved && typeof wx !== 'undefined' && wx.cloud) {
        wx.cloud.deleteFile({ fileList: [tmp] }).catch(() => {})
      }
      // #endif
    },
    cancelEdit() {
      this.discardTempAvatar()
      // 创建模式取消 = 放弃建档返回上一页
      if (this.creating) {
        uni.navigateBack({ delta: 1 })
        return
      }
      this.editing = false
    },
    pickEmoji(e) {
      // 选 emoji 表示想用 emoji 当头像：清掉照片（显示优先级 照片 > emoji，不清照片永远盖住）。
      // 本会话刚传未落库的照片文件顺手删掉，否则成云存储孤儿
      this.discardTempAvatar()
      this.form.avatar_emoji = e
      this.form.avatar = ''
    },
    pickSpecies(s) {
      this.form.species = s
    },
    // 性别选择（ADR-025）：male / female / ''（未填）；落库 pets 云函数 normGender 兜底
    pickGender(g) {
      this.form.gender = g
    },
    // 物种展示助手（ADR-023）：委托 src/species.js 单一真相源
    spLabel(s) {
      return speciesLabel(s)
    },
    spEmoji(s) {
      return speciesEmoji(s)
    },
    spAvatar(s) {
      return avatarStatic(s)
    },
    onBirthday(e) {
      this.form.birthday = e.detail.value
    },
    onNeutered(e) {
      this.form.neutered = e.detail.value
    },
    onHomeDate(e) {
      this.form.home_date = e.detail.value
    },
    pickAvatar() {
      // #ifdef MP-WEIXIN
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
        success: async (res) => {
          const tmp = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath
          if (!tmp) return
          uni.showLoading({ title: '上传中…' })
          try {
            const next = await uploadAvatar(tmp)
            this.discardTempAvatar() // 同会话反复换图：新图传成后再删上一张未落库的（先删后传若上传失败会指向已删文件）
            this.form.avatar = next
          } catch (e) {
            uni.showToast({ title: '头像上传失败', icon: 'none' })
          } finally {
            uni.hideLoading()
          }
        },
        fail: (err) => {
          // 用户取消(cancel)属正常静默；其它失败（权限 / 系统）给反馈，对齐 saveVetImg 的失败处理
          if (!String((err && err.errMsg) || '').includes('cancel')) uni.showToast({ title: '选择图片失败', icon: 'none' })
        },
      })
      // #endif
    },
    async save() {
      if (!String(this.form.name || '').trim()) {
        uni.showToast({ title: '名字必填', icon: 'none' })
        return
      }
      this.saving = true
      try {
        const pet = { ...this.form, name: this.form.name.trim() }
        // 创建模式（ADR-015 手动建宠）：pets add 落库后切换为该宠详情
        const res = this.creating
          ? await callFn('pets', { action: 'add', pet })
          : await callFn('pets', { action: 'update', id: this.id, pet })
        if (res.result && res.result.ok) {
          uni.showToast({ title: this.creating ? '已建档' : '已保存', icon: 'success' })
          if (this.creating) {
            this.creating = false
            this.id = res.result.id
            // 先用表单值立即渲染头部（load 是异步的，否则短暂显示空名占位；load 失败也有合理兜底）
            this.pet = { ...this.pet, ...pet, price_base: pet.price_base !== '' && pet.price_base != null ? Number(pet.price_base) : null }
            uni.setNavigationBarTitle({ title: pet.name })
          }
          this.editing = false
          this.load()
        } else {
          uni.showToast({ title: (res.result && res.result.msg) || '保存失败', icon: 'none' })
        }
      } catch (e) {
        uni.showToast({ title: '保存出错', icon: 'none' })
      } finally {
        this.saving = false
      }
    },
    confirmDelete() {
      uni.showModal({
        title: '删除档案',
        content: `确定删除「${this.pet.name}」的档案吗？历史记录会保留在时间线。`,
        confirmColor: '#e05d4e',
        success: async (r) => {
          if (!r.confirm) return
          try {
            const res = await callFn('pets', { action: 'delete', id: this.id })
            if (res.result && res.result.ok) {
              uni.showToast({ title: '已删除', icon: 'success' })
              setTimeout(() => uni.navigateBack(), 600)
            } else {
              uni.showToast({ title: '删除失败', icon: 'none' })
            }
          } catch (e) {
            uni.showToast({ title: '删除出错', icon: 'none' })
          }
        },
      })
    },
    // ===== 给兽医的小结：拉近期记录 → 画离屏 canvas → 出图 =====
    async exportVet() {
      if (this.exporting) return
      this.exporting = true
      uni.showLoading({ title: '生成中…' })
      try {
        const MAX = 10 // 兽医小结最多展示最近 N 条，避免图过长；超出给提示
        let recs = []
        // #ifdef MP-WEIXIN
        const res = await callFn('timeline', { action: 'list', pet: this.pet.name, limit: MAX + 1, orderField: 'time' })
        if (res.result && res.result.ok) recs = res.result.data || []
        // #endif
        const hasMore = recs.length > MAX
        const shown = recs.slice(0, MAX)
        this.exportRecs = shown
        this.vetHasMore = hasMore
        this.cw = 340
        // 近期记录区高度：每条原文按列宽换行、不截断，保守按 14 字 / 行估行数（宁可留白不裁切）。
        // 与 paintVet 绘制几何对应：每条首行 22px + 续行各 20px + 条后 8px 间距（单行恰为 30px，兼容旧版）。
        let recsH = 0
        if (!shown.length) recsH = 30
        else for (const r of shown) recsH += Math.max(1, Math.ceil(String(this.composeVetBody(r)).length / 14)) * 22 + 8
        const moreH = hasMore ? 24 : 0
        // 头部92 + 30到基础标题 + 10下划线 + 6行*26 + 22到分隔 + 26到近期标题 + 10下划线 + 近期记录 + 超出提示 + 56页脚
        this.ch = 92 + 30 + 10 + 6 * 26 + 22 + 26 + 10 + recsH + moreH + 56
        await this.$nextTick()
        setTimeout(() => this.renderVet(), 30)
      } catch (e) {
        uni.hideLoading()
        this.exporting = false
        uni.showToast({ title: '生成失败', icon: 'none' })
      }
    },
    renderVet() {
      // #ifdef MP-WEIXIN
      uni
        .createSelectorQuery()
        .in(this)
        .select('#vetCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            setTimeout(() => this.renderVet(), 50)
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = uni.getSystemInfoSync().pixelRatio || 2
          const W = this.cw
          const H = this.ch
          canvas.width = W * dpr
          canvas.height = H * dpr
          ctx.scale(dpr, dpr)
          this.paintVet(ctx, W, H)
          wx.canvasToTempFilePath({
            canvas,
            success: (r) => {
              uni.hideLoading()
              this.exporting = false
              this.vetImg = r.tempFilePath
            },
            fail: () => {
              uni.hideLoading()
              this.exporting = false
              uni.showToast({ title: '生成失败', icon: 'none' })
            },
          })
        })
      // #endif
    },
    paintVet(ctx, W, H) {
      const p = this.pet
      const padX = 22
      const HH = 92
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, W, H)

      // 头部珊瑚渐变带
      const grd = ctx.createLinearGradient(0, 0, W, HH)
      grd.addColorStop(0, '#F8A887')
      grd.addColorStop(0.55, '#F2825C')
      grd.addColorStop(1, '#E26B43')
      ctx.fillStyle = grd
      ctx.fillRect(0, 0, W, HH)

      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.font = '11px sans-serif'
      ctx.fillText('PetsLog · 健康小结', padX, 26)
      ctx.fillStyle = '#ffffff'
      ctx.font = '700 20px sans-serif'
      ctx.fillText(`${this.spEmoji(p.species)} ${p.name}`, padX, 54)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = '12px sans-serif'
      const sub = `${this.ageText(p.birthday) || '年龄未知'} · ${this.spLabel(p.species)}${p.breed ? ' · ' + p.breed : ''}`
      ctx.fillText(this.truncate(ctx, sub, W - padX * 2), padX, 76)

      // 基础信息
      let y = HH + 30
      this.vetSection(ctx, '基础信息', padX, y, W)
      y += 10
      const basics = [
        ['品种', p.breed || '未填'],
        ['年龄', this.ageText(p.birthday) || '未知'],
        ['绝育', p.neutered ? '是' : '否'],
        ['过敏史', p.allergy || '无'],
        ['病史', p.chronic || '无'],
        ['最新体重', p.latest_weight ? p.latest_weight + 'kg' : '未记'],
      ]
      basics.forEach(([k, v]) => {
        y += 26
        ctx.font = '13px sans-serif'
        ctx.fillStyle = '#8A7F77'
        ctx.fillText(k, padX, y)
        ctx.font = '600 13px sans-serif'
        ctx.fillStyle = '#3A3330'
        ctx.fillText(this.truncate(ctx, v, W - padX - 80 - padX), padX + 80, y)
      })

      // 分隔
      y += 22
      ctx.strokeStyle = '#F2EAE0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padX, y)
      ctx.lineTo(W - padX, y)
      ctx.stroke()

      // 近期记录
      y += 26
      this.vetSection(ctx, '近期记录', padX, y, W)
      y += 10
      const recs = this.exportRecs || []
      ctx.font = '13px sans-serif'
      if (!recs.length) {
        y += 30
        ctx.fillStyle = '#B5ABA2'
        ctx.fillText('暂无记录', padX, y)
      } else {
        // 兽医小结正文【只用结构化字段拼接(composeVetBody: desc / tag / med / weight)，绝不用 raw】：
        // raw 是录入原话、含费用 / 医院 / 寒暄，对不同医院 / 医生敏感（费用只留时间线）；用户明确要求，勿「好心」回退 raw。
        // 按列宽换行、不截断，兽医要看全。
        recs.forEach((r) => {
          const date = (r.time || '').slice(5)
          const tag = '[' + (r.event_type || '其它') + ']'
          // 首行：日期 + 类型 + 正文第一行
          y += 22
          ctx.font = '13px sans-serif'
          ctx.fillStyle = '#B5ABA2'
          ctx.fillText(date, padX, y)
          ctx.fillStyle = '#8A7F77'
          ctx.fillText(tag, padX + 42, y)
          const tagW = ctx.measureText(tag).width
          const rawX = padX + 42 + tagW + 8
          const lines = this.wrapByWidth(ctx, this.composeVetBody(r), W - rawX - padX)
          ctx.fillStyle = '#3A3330'
          ctx.fillText(lines[0] || '', rawX, y)
          for (let i = 1; i < lines.length; i++) {
            y += 20
            ctx.fillText(lines[i], rawX, y)
          }
          y += 8 // 记录间距
        })
        if (this.vetHasMore) {
          y += 22
          ctx.font = '11px sans-serif'
          ctx.fillStyle = '#B5ABA2'
          ctx.fillText(`仅展示最近 ${recs.length} 条记录，完整病史见小程序`, padX, y)
        }
      }

      // 页脚（含生成日期 + 医疗免责）
      const now = new Date()
      const z = (n) => String(n).padStart(2, '0')
      const gen = `${now.getFullYear()}-${z(now.getMonth() + 1)}-${z(now.getDate())}`
      ctx.strokeStyle = '#EFE7DC'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padX, H - 46)
      ctx.lineTo(W - padX, H - 46)
      ctx.stroke()
      ctx.fillStyle = '#B5ABA2'
      ctx.font = '11px sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`生成于 ${gen}`, padX, H - 26)
      ctx.textAlign = 'right'
      ctx.fillText('由 PetsLog 自动整理，仅供参考', W - padX, H - 26)
      ctx.textAlign = 'left'
    },
    vetSection(ctx, title, padX, y, W) {
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.fillStyle = '#C9542F'
      ctx.font = '600 14px sans-serif'
      ctx.fillText(title, padX, y)
      ctx.strokeStyle = '#F2EAE0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padX, y + 8)
      ctx.lineTo(W - padX, y + 8)
      ctx.stroke()
    },
    truncate(ctx, text, maxW) {
      let t = String(text)
      if (ctx.measureText(t).width <= maxW) return t
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
      return t + '…'
    },
    composeVetBody(r) {
      // 兽医小结正文【只用结构化字段拼接，绝不用 raw】：raw 含费用 / 医院 / 寒暄，敏感。
      // desc=干净事件描述（parseRecord 抽，不含费用 / 医院）；tag=病程（临床相关、不敏感）；med / weight 兽医关心。
      const parts = []
      if (r.desc) parts.push(r.desc)
      if (r.tag && (!r.desc || r.desc.indexOf(r.tag) < 0)) parts.push(r.tag)
      if (r.med) parts.push('用药:' + r.med)
      if (typeof r.weight === 'number' && r.weight > 0) parts.push(r.weight + 'kg')
      // 老数据无 desc / 结构化信息时返回 ''（只显示 日期 + 类型），绝不回退 raw 泄露费用 / 医院
      return parts.join(' · ')
    },
    wrapByWidth(ctx, text, maxW) {
      // 按容器宽度逐字换行（中文无空格，逐字断行；英文同样按字符断，兽医小结够用）
      const chars = String(text || '').split('')
      const lines = []
      let cur = ''
      for (const ch of chars) {
        if (ctx.measureText(cur + ch).width > maxW && cur) {
          lines.push(cur)
          cur = ch
        } else {
          cur += ch
        }
      }
      if (cur) lines.push(cur)
      return lines.length ? lines : ['']
    },
    saveVetImg() {
      // #ifdef MP-WEIXIN
      if (!this.vetImg) return
      uni.saveImageToPhotosAlbum({
        filePath: this.vetImg,
        success: () => uni.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: (err) => {
          const m = String((err && err.errMsg) || '')
          if (m.includes('auth deny') || m.includes('authorize') || m.includes('auth')) {
            uni.showModal({
              title: '需要相册权限',
              content: '请在设置里开启「保存到相册」权限后重试',
              confirmText: '去设置',
              success: (r) => {
                if (r.confirm) uni.openSetting()
              },
            })
          } else {
            uni.showToast({ title: '保存失败', icon: 'none' })
          }
        },
      })
      // #endif
    },

    // ===== 宠物档案卡（ADR-021）：海报风可分享图片，复用兽医小结的离屏 canvas → 出图 → 存相册 管线 =====
    async exportCard() {
      if (this.cardExporting) return
      this.cardExporting = true
      uni.showLoading({ title: '生成中…' })
      try {
        await this.$nextTick()
        setTimeout(() => this.renderCard(), 30)
      } catch (e) {
        uni.hideLoading()
        this.cardExporting = false
        uni.showToast({ title: '生成失败', icon: 'none' })
      }
    },
    renderCard() {
      // #ifdef MP-WEIXIN
      uni
        .createSelectorQuery()
        .in(this)
        .select('#cardCanvas')
        .fields({ node: true, size: true })
        .exec(async (res) => {
          if (!res || !res[0] || !res[0].node) {
            setTimeout(() => this.renderCard(), 50)
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = uni.getSystemInfoSync().pixelRatio || 2
          const W = this.cardW
          const H = this.cardH
          canvas.width = W * dpr
          canvas.height = H * dpr
          ctx.scale(dpr, dpr)
          // 头像照片先异步加载（cloud:// → 本地路径 → createImage），失败回退 emoji，再整张绘制
          // 渲染下沉到共享模块 @/petCard（与首页轮播同款，ADR-022），杜绝两处设计漂移
          const [avatarImg, cardIcons] = await Promise.all([loadPetAvatar(canvas, this.pet), loadCardIcons(canvas)])
          // 传 this.series 体重点 → 档案卡画体重趋势曲线（ADR-025；首页轮播不传，band 走占位降级）
          paintPetCard(ctx, W, H, this.pet || {}, avatarImg, this.series, cardIcons)
          wx.canvasToTempFilePath({
            canvas,
            success: (r) => {
              uni.hideLoading()
              this.cardExporting = false
              this.cardImg = r.tempFilePath
            },
            fail: () => {
              uni.hideLoading()
              this.cardExporting = false
              uni.showToast({ title: '生成失败', icon: 'none' })
            },
          })
        })
      // #endif
    },
    saveCardImg() {
      // #ifdef MP-WEIXIN
      if (!this.cardImg) return
      uni.saveImageToPhotosAlbum({
        filePath: this.cardImg,
        success: () => uni.showToast({ title: '已保存到相册', icon: 'success' }),
        fail: (err) => {
          const m = String((err && err.errMsg) || '')
          if (m.includes('auth deny') || m.includes('authorize') || m.includes('auth')) {
            uni.showModal({
              title: '需要相册权限',
              content: '请在设置里开启「保存到相册」权限后重试',
              confirmText: '去设置',
              success: (r) => {
                if (r.confirm) uni.openSetting()
              },
            })
          } else {
            uni.showToast({ title: '保存失败', icon: 'none' })
          }
        },
      })
      // #endif
    },
  },
}
</script>

<style>
.page {
  min-height: 100vh;
  padding-bottom: 48rpx;
}

/* 头部：极淡主色渐变晕染 + 头像光晕 */
.profile-head {
  padding: 48rpx var(--pad-page) 32rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: linear-gradient(180deg, var(--c-primary-wash) 0%, var(--c-bg) 100%);
}
.profile-head__avatar {
  width: 176rpx;
  height: 176rpx;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 104rpx;
  background: radial-gradient(circle at 50% 38%, #fff3ec 0%, var(--c-primary-tint) 100%);
  box-shadow: inset 0 0 0 3rpx rgba(242, 130, 92, 0.14), 0 10rpx 28rpx rgba(242, 130, 92, 0.22);
}
.profile-head__avatar-img {
  width: 100%;
  height: 100%;
  border-radius: var(--r-pill);
}
.profile-head__name {
  margin-top: 24rpx;
  font-size: var(--fs-display);
  font-weight: 700;
  color: var(--c-text);
}
.profile-head__meta {
  margin-top: 8rpx;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
}

/* 导出按钮行：兽医小结 / 档案卡 并排 */
.export-row {
  display: flex;
  gap: 16rpx;
  margin: 0 var(--pad-page) 24rpx;
}
.export-row .btn-vet {
  flex: 1;
  margin: 0;
}
/* 生成给兽医按钮（描边主色） */
.btn-vet {
  margin: 0 var(--pad-page) 24rpx;
  height: 88rpx;
  line-height: 88rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  border-radius: var(--r-pill);
  background: var(--c-card);
  border: 2rpx solid var(--c-primary);
  color: var(--c-primary-deep);
  font-size: var(--fs-sub);
  font-weight: 600;
}
.btn-vet--press {
  background: var(--c-primary-wash);
}

/* 卡片 */
.card-block {
  margin: 0 var(--pad-page) 24rpx;
  background: var(--c-card);
  border-radius: var(--r-lg);
  padding: 32rpx;
  box-shadow: var(--sh-2);
}
.card-block__head {
  display: flex;
  align-items: center;
  margin-bottom: 16rpx;
}
.card-block__title {
  font-size: var(--fs-sub);
  font-weight: 600;
  color: var(--c-text);
}
.card-block__sub {
  margin-left: auto;
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}
.edit-btn {
  margin-left: auto;
  min-height: 60rpx;
  padding: 0 24rpx;
  display: inline-flex;
  align-items: center;
  font-size: var(--fs-sub);
  color: var(--c-primary-deep);
  font-weight: 500;
  background: var(--c-primary-wash);
  border-radius: var(--r-pill);
}
.edit-btn--press {
  background: var(--c-primary-tint);
}

.weight-wrap {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  width: 100%;
  overflow: hidden;
}
.weight-yaxis {
  width: 56rpx;
  height: 360rpx;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  /* 画布网格用 px 定位(padT 18px / padB 30px)，这里跟用 px 才能跨机型对齐（标签半行高约 7px） */
  padding: 11px 0 23px;
  box-sizing: border-box;
}
.weight-yaxis__t {
  font-size: 20rpx;
  color: #b5aba2;
  text-align: right;
  padding-right: 6rpx;
}
.weight-body {
  flex: 1;
  min-width: 0;
  height: 360rpx;
  overflow: hidden;
}
.weight-chart {
  width: 100%;
  height: 360rpx;
  display: block;
}
.weight-hint {
  display: block;
  font-size: 22rpx;
  color: #c9bfb5;
  text-align: center;
  margin-top: 8rpx;
}
.chart-empty {
  padding: 40rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.chart-empty__icon {
  width: 88rpx;
  height: 88rpx;
}
.chart-empty__title {
  font-size: var(--fs-sub);
  color: var(--c-text-2);
  margin-top: 16rpx;
}
.chart-empty__hint {
  font-size: var(--fs-cap);
  color: var(--c-text-3);
  margin-top: 8rpx;
  text-align: center;
}

/* 只读行 */
.rows {
  margin-top: 4rpx;
}
.row {
  display: flex;
  padding: 24rpx 0;
  border-bottom: 2rpx solid var(--c-divider);
}
.row:last-child {
  border-bottom: none;
}
.row__k {
  width: 160rpx;
  color: var(--c-text-2);
  font-size: var(--fs-sub);
}
.row__v {
  flex: 1;
  color: var(--c-text);
  font-size: var(--fs-sub);
  font-weight: 500;
}
/* 空态值（如当前主粮未记录）：弱化成灰占位 */
.row__v--empty {
  color: var(--c-text-3);
  font-weight: 400;
}
.row__sub {
  color: var(--c-text-3);
  font-size: var(--fs-tiny);
  font-weight: 400;
}

/* 编辑表单 */
.form {
  margin-top: 4rpx;
}
.form-row {
  display: flex;
  align-items: center;
  padding: 22rpx 0;
  border-bottom: 2rpx solid var(--c-divider);
}
.form-row:last-child {
  border-bottom: none;
}
.form-row__label {
  width: 140rpx;
  flex: none;
  color: var(--c-text-2);
  font-size: var(--fs-sub);
}
.form-input {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  padding: 0 24rpx;
  background: var(--c-bg-sink);
  border: 2rpx solid transparent;
  border-radius: var(--r-sm);
  font-size: var(--fs-body);
  color: var(--c-text);
}
.form-ph {
  color: var(--c-text-3);
}
.form-picker {
  flex: 1;
}
.picker-val {
  display: flex;
  align-items: center;
}
.picker-val--ph {
  color: var(--c-text-3);
}
/* 编辑态头像选择 */
.avatar-edit {
  width: 120rpx;
  height: 120rpx;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  border: 2rpx dashed var(--c-border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.avatar-edit--press {
  opacity: 0.7;
}
.avatar-edit__img {
  width: 100%;
  height: 100%;
}
.avatar-edit__emoji {
  font-size: 64rpx;
}
.form-row--top {
  align-items: flex-start;
}
.emoji-grid {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  justify-content: flex-end;
}
.emoji-cell {
  width: 72rpx;
  height: 72rpx;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40rpx;
  border: 2rpx solid transparent;
}
.emoji-cell--active {
  background: var(--c-primary-tint);
  border-color: var(--c-primary);
}
.avatar-edit__ph {
  font-size: 56rpx;
  color: var(--c-text-3);
  font-weight: 300;
}
.chips {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  justify-content: flex-end;
}
.chip {
  flex: none; /* 物种 chip 扩 8 后防被压缩（ADR-023/024），配合 .chips flex-wrap 自动换行 */
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

.form-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 32rpx;
}
/* .btn-primary / .btn-ghost (+--press) 已抽到 App.vue 全局（Round 2 去重） */
.del-link {
  text-align: center;
  margin-top: 28rpx;
  font-size: var(--fs-cap);
  color: var(--c-text-3);
}
.del-link--press {
  opacity: 0.55;
}
.del-link__hot {
  color: var(--c-danger);
}

/* 加载占位 */
.page-empty {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-text-3);
  font-size: var(--fs-sub);
}

/* 给兽医的小结浮层 */
.vet-mask {
  position: fixed;
  inset: 0;
  background: rgba(58, 51, 48, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 60;
  padding: 48rpx;
}
.vet-box {
  width: 100%;
  max-width: 640rpx;
  background: var(--c-card);
  border-radius: var(--r-lg);
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-shadow: var(--sh-3);
}
.vet-img {
  width: 100%;
  border-radius: var(--r-md);
}
.vet-tip {
  font-size: var(--fs-tiny);
  color: var(--c-text-3);
  margin-top: 16rpx;
}
.vet-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 24rpx;
  width: 100%;
}
</style>
