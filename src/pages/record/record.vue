<template>
  <view class="page">
    <!-- 录入编辑区（确认弹层弹出时隐藏，规避原生 textarea 层级穿透） -->
    <view v-if="!parsed" class="rec">
      <text class="rec__title">记一笔 🐾</text>
      <text class="rec__hint">用大白话说一句，AI 自动归档。可记健康、设提醒、入库药品。</text>

      <textarea
        v-model="draft"
        class="rec__input"
        :class="{ 'rec__input--focus': focused }"
        :maxlength="200"
        placeholder="例如「示例猫今天吐了，体重 4.2kg」"
        placeholder-class="rec__ph"
        :disabled="parsing"
        auto-height
        @focus="focused = true"
        @blur="focused = false"
      />

      <view class="rec__examples">
        <text
          v-for="(ex, i) in examples"
          :key="i"
          class="rec__ex"
          hover-class="rec__ex--press"
          hover-stay-time="60"
          @click="fill(ex)"
        >{{ ex }}</text>
      </view>

      <button
        class="rec__btn"
        :class="{ 'rec__btn--loading': parsing }"
        hover-class="rec__btn--press"
        hover-stay-time="60"
        :loading="parsing"
        @click="onSend"
      >{{ parsing ? '解析中…' : '记 录' }}</button>
    </view>

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
          <text class="sheet__hint">到期会在宠物页和健康页提示你</text>
          <view class="sheet__fields">
            <view class="field-row" v-if="parsed.pet">
              <text class="field-row__label">宠物</text>
              <text class="field-row__value">{{ parsed.pet }}<text v-if="parsed.pet_unknown" class="new-badge new-badge--warn"> ❓ 没找到这只</text></text>
            </view>
            <!-- 提醒同样不挂幽灵宠物名（ADR-015 评审硬化）：错别字时从已有宠物点选 -->
            <view class="field-row" v-if="parsed.pet_unknown">
              <text class="field-row__label">选一只</text>
              <view class="chips" v-if="petOptions.length">
                <text v-for="n in petOptions" :key="n" class="chip" @click="pickPet(n)">{{ n }}</text>
              </view>
              <text v-else class="field-row__value field-row__value--empty">还没有宠物档案，先到宠物页添加</text>
            </view>
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
              <text class="field-row__value" :class="{ 'field-row__value--empty': !parsed.pet || parsed.pet_unknown }">{{ parsed.pet || '待确认' }}<text v-if="parsed.is_new" class="new-badge"> 🆕 将建档</text><text v-else-if="parsed.pet_unknown" class="new-badge new-badge--warn"> ❓ 没找到这只</text></text>
            </view>
            <!-- 名字没匹配上（错别字等，ADR-015）：让用户从家里宠物里点选，不自动建档 -->
            <view class="field-row" v-if="parsed.pet_unknown">
              <text class="field-row__label">选一只</text>
              <view class="chips" v-if="petOptions.length">
                <text v-for="n in petOptions" :key="n" class="chip" @click="pickPet(n)">{{ n }}</text>
              </view>
              <text v-else class="field-row__value field-row__value--empty">还没有宠物档案，先到宠物页添加</text>
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
            <view class="field-row" v-if="parsed.hospital"><text class="field-row__label">医院</text><text class="field-row__value">{{ parsed.hospital }}</text></view>
            <view class="field-row" v-if="parsed.cost != null"><text class="field-row__label">费用</text><text class="field-row__value">¥{{ parsed.cost }}</text></view>
            <view class="field-row" v-if="parsed.tag"><text class="field-row__label">病程</text><text class="field-row__value">{{ parsed.tag }}</text></view>
            <view class="field-row"><text class="field-row__label">原文</text><text class="field-row__value">{{ parsed.raw || draft }}</text></view>
          </view>

          <!-- 附件（见 ADR-011）：确认归档前可挂图片 / 视频 / PDF，保存后上传登记 -->
          <view class="att">
            <text class="att__label">附件（病历照片 / 视频 / PDF，选填）</text>
            <scroll-view scroll-x class="att__scroll" :show-scrollbar="false">
              <view class="att__inner">
                <view v-for="(a, i) in atts" :key="i" class="att-cell">
                  <image v-if="a.type === 'image'" :src="a.tempPath" class="att-cell__img" mode="aspectFill" />
                  <block v-else-if="a.type === 'video'">
                    <image v-if="a.thumbTemp" :src="a.thumbTemp" class="att-cell__img" mode="aspectFill" />
                    <view class="att-cell__mask">▶</view>
                  </block>
                  <view v-else class="att-cell__pdf">
                    <text class="att-cell__pdf-ico">📄</text>
                    <text class="att-cell__pdf-name">{{ a.name }}</text>
                  </view>
                  <text class="att-cell__del" @click.stop="removeAtt(i)">✕</text>
                </view>
                <view v-if="atts.length < attMax" class="att-cell att-cell--add" @click="addAtt">＋</view>
              </view>
            </scroll-view>
          </view>
        </block>

        <view class="sheet__actions">
          <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="cancelParse">返回修改</button>
          <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" :loading="saving" @click="confirmSave">{{ confirmBtnText() }}</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { callFn } from '@/cloud'
import { pickAttachments, uploadAndRegister, ATT_MAX_PER_RECORD } from '@/attachments'

export default {
  data() {
    return {
      draft: '',
      focused: false,
      parsing: false,
      saving: false,
      parsed: null, // AI 解析后的结构化结果，待用户确认
      petOptions: [], // 家庭已有宠物名单（parseRecord 带回），pet_unknown 时供点选（ADR-015）
      atts: [], // 待上传附件（本地临时文件，确认归档后才上传，取消不留孤儿）
      attMax: ATT_MAX_PER_RECORD,
      examples: ['示例猫今天吐了，体重 4.2kg', '下月 15 号给示例狗打疫苗', '买了盒驱虫药 2 支，明年 3 月过期'],
    }
  },
  methods: {
    cloudReady() {
      // #ifdef MP-WEIXIN
      return typeof wx !== 'undefined' && !!wx.cloud && !!CLOUD_ENV
      // #endif
      // eslint-disable-next-line no-unreachable
      return false
    },
    fill(ex) {
      this.draft = ex
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
      if (!text) {
        uni.showToast({ title: '先说一句吧', icon: 'none' })
        return
      }
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
        this.atts = [] // 新一次解析，清掉上一轮残留的待传附件
        this.petOptions = r.pets || []
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
    pickPet(name) {
      if (!this.parsed) return
      this.parsed.pet = name
      this.parsed.pet_unknown = false
    },
    cancelParse() {
      this.parsed = null
      this.atts = [] // 只是本地临时文件，丢弃即可，无云端孤儿
    },
    async addAtt() {
      const picked = await pickAttachments(this.attMax - this.atts.length)
      if (picked.length) this.atts = this.atts.concat(picked)
    },
    removeAtt(i) {
      this.atts.splice(i, 1)
    },
    async confirmSave() {
      if (!this.parsed) return
      const kind = this.parsed.kind
      // 名字没匹配上时不放行（ADR-015，record + reminder 都拦）：先点选已有宠物（服务端 PET_UNKNOWN 双保险）
      if (kind !== 'med_stock' && this.parsed.pet_unknown) {
        uni.showToast({ title: '先选一只宠物吧', icon: 'none' })
        return
      }
      // 显式新增意图但没听清名字：建档意图不能被静默吞掉
      if (kind !== 'med_stock' && kind !== 'reminder' && this.parsed.new_pet && !this.parsed.pet) {
        uni.showToast({ title: '没听清名字，补一句宠物叫什么吧', icon: 'none' })
        return
      }
      const okMsg = kind === 'med_stock' ? '已入库' : kind === 'reminder' ? '已设提醒' : '已归档'
      this.saving = true
      try {
        const res = await callFn('saveRecord', { record: this.parsed })
        const r = res.result || {}
        if (r.ok) {
          // 健康记录带附件：先归档成功再上传登记（取消归档不产生云端孤儿；上传失败记录仍在，可去详情页补传）
          if (kind !== 'med_stock' && kind !== 'reminder' && this.atts.length && r.id) {
            uni.showLoading({ title: '上传附件中…', mask: true })
            const up = await uploadAndRegister(r.id, this.atts)
            uni.hideLoading()
            if (!up.ok) {
              await new Promise((done) =>
                uni.showModal({
                  title: '附件没传上',
                  content: `记录已归档，但附件上传失败：${up.msg}。可稍后在时间线点开这条记录补传。`,
                  showCancel: false,
                  complete: done,
                })
              )
            }
          }
          uni.showToast({ title: okMsg, icon: 'success' })
          this.draft = ''
          this.parsed = null
          this.atts = []
          // 让来源 tab 在返回后 onShow 刷新；稍等 toast 露出再返回
          setTimeout(() => {
            uni.navigateBack({ delta: 1 })
          }, 600)
        } else if (r.code === 'PET_UNKNOWN') {
          // 服务端兜底拒了（前端态被绕过 / 解析后名单变化）：回到选择态
          this.parsed.pet_unknown = true
          if (r.pets && r.pets.length) this.petOptions = r.pets
          uni.showToast({ title: r.msg || '没找到这只宠物，请选择', icon: 'none' })
        } else {
          uni.showToast({ title: r.msg || '保存失败', icon: 'none' })
        }
      } catch (e) {
        uni.hideLoading()
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
  padding: 32rpx var(--pad-page) 48rpx;
  box-sizing: border-box;
}

/* 录入编辑区 */
.rec {
  display: flex;
  flex-direction: column;
}
.rec__title {
  font-size: var(--fs-display);
  font-weight: 700;
  color: var(--c-text);
}
.rec__hint {
  margin-top: 10rpx;
  font-size: var(--fs-sub);
  color: var(--c-text-2);
  line-height: 1.5;
}
.rec__input {
  margin-top: 32rpx;
  width: 100%;
  box-sizing: border-box;
  min-height: 200rpx;
  padding: 28rpx;
  background: var(--c-card);
  border: 2rpx solid var(--c-border);
  border-radius: var(--r-lg);
  font-size: var(--fs-body);
  line-height: 1.6;
  color: var(--c-text);
  box-shadow: var(--sh-1);
}
.rec__input--focus {
  border-color: var(--c-primary-tint);
  background: var(--c-card-cream);
}
.rec__ph {
  color: var(--c-text-3);
}
.rec__examples {
  margin-top: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.rec__ex {
  align-self: flex-start;
  max-width: 100%;
  padding: 16rpx 28rpx;
  background: var(--c-primary-wash);
  border: 2rpx solid var(--c-primary-tint);
  border-radius: var(--r-pill);
  font-size: var(--fs-sub);
  color: var(--c-primary-deep);
}
.rec__ex--press {
  background: var(--c-primary-tint);
}
.rec__btn {
  margin-top: 48rpx;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: var(--r-pill);
  background: var(--c-primary-grad);
  box-shadow: var(--sh-primary);
  color: var(--c-text-inv);
  font-size: var(--fs-body);
  font-weight: 600;
  letter-spacing: 4rpx;
}
.rec__btn--press {
  transform: scale(0.98);
  box-shadow: var(--sh-press);
}
.rec__btn--loading {
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
.new-badge--warn {
  color: #d65a4a;
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
/* 附件选择区（确认卡片内） */
.att {
  margin-bottom: 28rpx;
}
.att__label {
  display: block;
  font-size: var(--fs-cap);
  color: var(--c-text-2);
  margin-bottom: 14rpx;
}
.att__scroll {
  white-space: nowrap;
}
.att__inner {
  display: inline-flex;
  gap: 16rpx;
}
.att-cell {
  position: relative;
  width: 140rpx;
  height: 140rpx;
  flex: none;
  border-radius: var(--r-sm);
  background: var(--c-bg-sink);
  overflow: hidden;
}
.att-cell__img {
  width: 100%;
  height: 100%;
}
.att-cell__mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.25);
  color: #fff;
  font-size: 44rpx;
}
.att-cell__pdf {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  padding: 0 10rpx;
  box-sizing: border-box;
}
.att-cell__pdf-ico {
  font-size: 48rpx;
}
.att-cell__pdf-name {
  max-width: 100%;
  font-size: var(--fs-tiny);
  color: var(--c-text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.att-cell__del {
  position: absolute;
  top: 0;
  right: 0;
  width: 44rpx;
  height: 44rpx;
  line-height: 44rpx;
  text-align: center;
  background: rgba(58, 51, 48, 0.55);
  color: #fff;
  font-size: var(--fs-tiny);
  border-radius: 0 0 0 var(--r-sm);
}
.att-cell--add {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 56rpx;
  color: var(--c-text-3);
  border: 2rpx dashed var(--c-border);
  background: transparent;
  box-sizing: border-box;
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
