<template>
  <view class="page">
    <scroll-view scroll-y class="pets-scroll">
      <!-- 问候 -->
      <view class="greeting">
        <text class="greeting__hi">今天，毛孩子们还好吗 🐾</text>
        <text class="greeting__sub">点下面的 ＋ 说一句，我帮你记下来</text>
      </view>

      <!-- 到期提醒横幅 -->
      <view
        v-if="dueCount"
        class="banner banner--alert"
        hover-class="banner--press"
        hover-stay-time="80"
        @click="goHealth"
      >
        <text class="banner__icon">🔔</text>
        <text class="banner__text">有 <text class="banner__num">{{ dueCount }}</text> 条提醒到期</text>
        <text class="banner__arrow">›</text>
      </view>

      <!-- 宠物档案卡轮播（ADR-022）：复用档案卡出图，左右滑、邻卡露边 -->
      <swiper
        v-if="pets.length"
        class="card-swiper"
        :style="{ height: swiperH + 'px' }"
        :current="cur"
        previous-margin="30px"
        next-margin="30px"
        :circular="false"
        @change="onSwipe"
      >
        <swiper-item v-for="(p, i) in pets" :key="p._id || p.name" class="card-slide">
          <view class="card-shell" :class="{ 'card-shell--active': i === cur }" @click="openPet(p)">
            <image
              v-if="cardImgs[p._id || p.name]"
              :src="cardImgs[p._id || p.name]"
              class="card-img"
              mode="aspectFill"
            ></image>
            <!-- 出图前骨架占位（带头像 + 名，不空白） -->
            <view v-else class="card-skel">
              <view class="card-skel__avatar" :class="p.species === 'dog' ? 'is-dog' : 'is-cat'">
                <image v-if="p.avatar" :src="p.avatar" class="card-skel__avatar-img" mode="aspectFill"></image>
                <text v-else>{{ p.avatar_emoji || speciesEmoji(p.species) }}</text>
              </view>
              <text class="card-skel__name">{{ p.name }}</text>
              <text class="card-skel__tip">档案卡生成中…</text>
            </view>
          </view>
        </swiper-item>
        <!-- 末张：添加宠物（ADR-015 手动建宠入口） -->
        <swiper-item :key="'__add__'" class="card-slide">
          <view class="card-shell card-shell--add" :class="{ 'card-shell--active': cur === pets.length }" @click="addPet">
            <view class="add-inner">
              <view class="add-plus">＋</view>
              <text class="add-title">添加宠物</text>
              <text class="add-sub">建一份新档案</text>
            </view>
          </view>
        </swiper-item>
      </swiper>

      <!-- 指示点 -->
      <view v-if="pets.length" class="dots">
        <view
          v-for="i in pets.length + 1"
          :key="i"
          class="dot"
          :class="{ 'dot--on': i - 1 === cur }"
        ></view>
      </view>

      <!-- 空状态 -->
      <view v-else class="empty">
        <view class="empty__art">🐾</view>
        <text class="empty__title">还没有毛孩子</text>
        <text class="empty__desc">点 ＋ 说一句，比如「新来的橘猫示例 3.2kg」，我会自动建档</text>
        <button class="empty__cta" hover-class="empty__cta--press" hover-stay-time="60" @click="goRecord">＋ 记录</button>
        <text class="empty__alt" @click="addPet">或手动添加宠物档案</text>
      </view>
    </scroll-view>

    <!-- 离屏画布：顺序渲染各宠档案卡 → image（ADR-022）；首页无浮层，left:-9999px 不穿透 -->
    <canvas
      type="2d"
      id="petCardCanvas"
      :style="{ width: cardW + 'px', height: cardH + 'px', position: 'fixed', left: '-9999px', top: '0' }"
    ></canvas>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { petAge } from '@/utils'
import { callFn } from '@/cloud'
import { paintPetCard, loadPetAvatar, CARD_W, CARD_H } from '@/petCard'
import { syncTab } from '@/tabSync'

export default {
  data() {
    return {
      pets: [],
      dueCount: 0, // 到期/逾期提醒数，用于宠物页横幅
      cur: 0, // 当前轮播下标
      cardImgs: {}, // petKey → 档案卡 tempFilePath（会话内有效，签名缓存）
      cardSig: {}, // petKey → 上次出图时的字段签名（脏判断）
      swiperH: 0, // 轮播高度（按屏宽派生 = cardW : cardH 比例）
      cardW: CARD_W,
      cardH: CARD_H,
    }
  },
  onLoad() {
    // 轮播高度按屏宽派生：卡宽 = 屏宽 - 左右露边(30*2) - slide 内距(8*2)，卡高 = 卡宽 × 440/320
    let win = 375
    // #ifdef MP-WEIXIN
    win = (uni.getSystemInfoSync().windowWidth) || 375
    // #endif
    const cardWidth = win - 60 - 16
    this.swiperH = Math.round((cardWidth * CARD_H) / CARD_W) + 16
  },
  async onShow() {
    syncTab(this, 0)
    await this.loadPets()
    this.ensureCards()
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
    // 字段签名：任一展示字段变了即重渲该卡（漏签名字段会显旧卡到下次匹配，新增展示字段记得补这里）
    sigOf(p) {
      return [p.avatar, p.name, p.species, p.breed, p.birthday, p.latest_weight, p.home_date, p.intro]
        .map((x) => (x == null ? '' : String(x)))
        .join('|')
    },
    // 顺序出图：仅脏 / 缺图的宠重渲，命中签名缓存即跳过（多宠不每次进 tab 全量重画）
    async ensureCards() {
      if (!this.cloudReady() || this._rendering) return
      this._rendering = true
      try {
        for (const p of this.pets) {
          const key = p._id || p.name
          const sig = this.sigOf(p)
          if (this.cardSig[key] === sig && this.cardImgs[key]) continue
          const img = await this.renderOne(p)
          if (img) {
            this.$set(this.cardImgs, key, img)
            this.cardSig[key] = sig
          }
        }
      } finally {
        this._rendering = false
      }
    },
    renderOne(p) {
      return new Promise((resolve) => {
        // #ifdef MP-WEIXIN
        uni
          .createSelectorQuery()
          .in(this)
          .select('#petCardCanvas')
          .fields({ node: true, size: true })
          .exec(async (res) => {
            if (!res || !res[0] || !res[0].node) return resolve('')
            const canvas = res[0].node
            const ctx = canvas.getContext('2d')
            const dpr = uni.getSystemInfoSync().pixelRatio || 2
            canvas.width = CARD_W * dpr
            canvas.height = CARD_H * dpr
            ctx.scale(dpr, dpr)
            // 头像照片异步加载（失败回退 emoji），再整张绘制（与详情页同款，@/petCard）
            const avatarImg = await loadPetAvatar(canvas, p.avatar)
            paintPetCard(ctx, CARD_W, CARD_H, p, avatarImg)
            wx.canvasToTempFilePath({
              canvas,
              success: (r) => resolve(r.tempFilePath),
              fail: () => resolve(''),
            })
          })
        return
        // #endif
        // eslint-disable-next-line no-unreachable
        resolve('')
      })
    },
    onSwipe(e) {
      this.cur = e.detail.current
    },
    addPet() {
      uni.navigateTo({ url: '/pages/pet/pet?mode=new' })
    },
    openPet(p) {
      const id = p && p._id ? p._id : ''
      uni.navigateTo({
        url: '/pages/pet/pet?id=' + id,
        fail: (err) => {
          uni.showModal({ title: '跳转失败', content: 'id=' + id + ' / ' + ((err && err.errMsg) || JSON.stringify(err)), showCancel: false })
        },
      })
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
    goHealth() {
      // 横幅跳「健康」tab，并指定到提醒分段
      uni.setStorageSync('health_seg', 'rem')
      uni.switchTab({ url: '/pages/health/health' })
    },
    goRecord() {
      uni.navigateTo({ url: '/pages/record/record' })
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
  padding: 0 0 calc(160rpx + env(safe-area-inset-bottom));
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

/* 档案卡轮播 */
.card-swiper {
  width: 100%;
  margin-top: 8rpx;
}
.card-slide {
  box-sizing: border-box;
  padding: 0 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card-shell {
  width: 100%;
  height: 100%;
  border-radius: 28rpx;
  overflow: hidden;
  background: var(--c-card);
  box-shadow: var(--sh-2);
  transform: scale(0.92);
  opacity: 0.62;
  transition: transform 0.28s ease, opacity 0.28s ease, box-shadow 0.28s ease;
}
.card-shell--active {
  transform: scale(1);
  opacity: 1;
  box-shadow: 0 16rpx 40rpx rgba(196, 124, 86, 0.22);
}
.card-img {
  width: 100%;
  height: 100%;
  display: block;
}

/* 出图前骨架 */
.card-skel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18rpx;
  background: radial-gradient(circle at 50% 32%, #fce7da 0%, #faf1e9 55%, #faf6f0 100%);
}
.card-skel__avatar {
  width: 150rpx;
  height: 150rpx;
  border-radius: var(--r-pill);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 84rpx;
  background: radial-gradient(circle at 50% 38%, #fff3ec 0%, var(--c-primary-tint) 100%);
  box-shadow: inset 0 0 0 4rpx #fff, 0 6rpx 16rpx rgba(242, 130, 92, 0.18);
}
.card-skel__avatar.is-dog {
  background: radial-gradient(circle at 50% 38%, #fff0e6 0%, #fad9c2 100%);
}
.card-skel__avatar-img {
  width: 100%;
  height: 100%;
  border-radius: var(--r-pill);
}
.card-skel__name {
  font-size: var(--fs-h2);
  font-weight: 700;
  color: var(--c-text);
}
.card-skel__tip {
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}

/* 添加宠物卡 */
.card-shell--add {
  background: transparent;
  box-shadow: none;
  border: 3rpx dashed rgba(242, 130, 92, 0.4);
}
.add-inner {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16rpx;
}
.add-plus {
  width: 132rpx;
  height: 132rpx;
  border-radius: var(--r-pill);
  background: var(--c-bg-sink);
  color: var(--c-primary);
  font-size: 64rpx;
  font-weight: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}
.add-title {
  font-size: var(--fs-h2);
  font-weight: 600;
  color: var(--c-text);
}
.add-sub {
  font-size: var(--fs-cap);
  color: var(--c-text-2);
}

/* 指示点 */
.dots {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12rpx;
  padding: 28rpx 0 8rpx;
}
.dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: var(--c-primary-tint);
  transition: width 0.24s ease, background 0.24s ease;
}
.dot--on {
  width: 32rpx;
  border-radius: 6rpx;
  background: var(--c-primary);
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
.empty__cta {
  margin-top: 40rpx;
  height: 88rpx;
  line-height: 88rpx;
  padding: 0 56rpx;
  border-radius: var(--r-pill);
  background: var(--c-primary-grad);
  box-shadow: var(--sh-primary);
  color: var(--c-text-inv);
  font-size: var(--fs-body);
  font-weight: 600;
}
.empty__alt {
  margin-top: 32rpx;
  min-height: 64rpx;
  padding: 0 24rpx;
  display: inline-flex;
  align-items: center;
  font-size: var(--fs-sub);
  color: var(--c-primary);
  text-decoration: underline;
}
.empty__cta--press {
  transform: scale(0.97);
  box-shadow: var(--sh-press);
}
</style>
