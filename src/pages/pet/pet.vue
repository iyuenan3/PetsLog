<template>
  <view class="page" v-if="pet">
    <!-- 头部 -->
    <view class="profile-head">
      <view class="profile-head__avatar" :class="pet.species === 'dog' ? 'is-dog' : 'is-cat'">{{ pet.species === 'dog' ? '🐶' : '🐱' }}</view>
      <text class="profile-head__name">{{ pet.name }}</text>
      <text class="profile-head__meta">{{ ageText(pet.birthday) || '年龄未知' }} · {{ pet.species === 'dog' ? '狗' : '猫' }}</text>
    </view>

    <!-- 生成给兽医的小结 -->
    <button class="btn-vet" hover-class="btn-vet--press" hover-stay-time="80" :loading="exporting" @click="exportVet">📋 生成给兽医的小结</button>

    <!-- 体重曲线 -->
    <view class="card-block">
      <view class="card-block__head">
        <text class="card-block__title">体重曲线</text>
        <text class="card-block__sub" v-if="series.length">{{ series.length }} 次 · 最新 {{ series[series.length - 1].weight }}kg</text>
      </view>
      <canvas v-if="series.length" type="2d" id="weightChart" class="weight-chart"></canvas>
      <view v-else class="chart-empty">
        <text class="chart-empty__icon">⚖️</text>
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
        <view class="row"><text class="row__k">绝育</text><text class="row__v">{{ pet.neutered ? '是' : '否' }}</text></view>
        <view class="row"><text class="row__k">过敏史</text><text class="row__v">{{ pet.allergy || '无' }}</text></view>
        <view class="row"><text class="row__k">慢病</text><text class="row__v">{{ pet.chronic || '无' }}</text></view>
        <view class="row"><text class="row__k">最新体重</text><text class="row__v">{{ pet.latest_weight ? pet.latest_weight + 'kg' : '未记' }}</text></view>
      </view>
    </view>

    <!-- 基础档案：编辑 -->
    <view class="card-block" v-else>
      <view class="card-block__head"><text class="card-block__title">编辑档案</text></view>
      <view class="form">
        <view class="form-row"><text class="form-row__label">名字</text><input class="form-input" v-model="form.name" placeholder="必填" placeholder-class="form-ph" /></view>
        <view class="form-row">
          <text class="form-row__label">种类</text>
          <view class="chips">
            <text :class="['chip', form.species === 'cat' ? 'chip--active' : '']" @click="pickSpecies('cat')">🐱 猫</text>
            <text :class="['chip', form.species === 'dog' ? 'chip--active' : '']" @click="pickSpecies('dog')">🐶 狗</text>
          </view>
        </view>
        <view class="form-row"><text class="form-row__label">品种</text><input class="form-input" v-model="form.breed" placeholder="如 布偶 / 金毛" placeholder-class="form-ph" /></view>
        <view class="form-row">
          <text class="form-row__label">生日</text>
          <picker class="form-picker" mode="date" :value="form.birthday || ''" @change="onBirthday">
            <view class="form-input picker-val" :class="{ 'picker-val--ph': !form.birthday }">{{ form.birthday || '点击选择' }}</view>
          </picker>
        </view>
        <view class="form-row"><text class="form-row__label">绝育</text><switch :checked="form.neutered" color="#f2825c" @change="onNeutered" /></view>
        <view class="form-row"><text class="form-row__label">过敏史</text><input class="form-input" v-model="form.allergy" placeholder="无则留空" placeholder-class="form-ph" /></view>
        <view class="form-row"><text class="form-row__label">慢病</text><input class="form-input" v-model="form.chronic" placeholder="无则留空" placeholder-class="form-ph" /></view>
      </view>
      <view class="form-actions">
        <button class="btn-ghost" hover-class="btn-ghost--press" hover-stay-time="60" @click="cancelEdit">取消</button>
        <button class="btn-primary" hover-class="btn-primary--press" hover-stay-time="60" :loading="saving" @click="save">保存</button>
      </view>
      <view class="del-link" hover-class="del-link--press" hover-stay-time="60" @click="confirmDelete">删除这只宠物的<text class="del-link__hot">档案</text></view>
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

    <!-- 离屏导出画布（移出可视区，仅用于生成图片） -->
    <canvas type="2d" id="vetCanvas" :style="{ width: cw + 'px', height: ch + 'px', position: 'fixed', left: '-9999px', top: '0' }"></canvas>
  </view>

  <view v-else class="page-empty"><text>加载中…</text></view>
</template>

<script>
import { CLOUD_ENV } from '@/config'
import { petAge } from '@/utils'
import { callFn } from '@/cloud'

export default {
  data() {
    return {
      id: '',
      pet: null,
      series: [],
      editing: false,
      saving: false,
      form: {},
      // 给兽医的小结
      exporting: false,
      exportRecs: [],
      vetImg: '',
      cw: 340,
      ch: 480,
    }
  },
  onLoad(opts) {
    this.id = (opts && opts.id) || ''
    this.load()
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
          this.loadWeight()
        }
      } catch (e) {
        console.warn('pet load failed', e)
      }
    },
    async loadWeight() {
      // 复用 timeline 云函数按宠物名取记录，前端筛出有体重的，按时间升序
      try {
        const res = await callFn('timeline', { action: 'list', pet: this.pet.name, limit: 200 })
        if (res.result && res.result.ok) {
          this.series = (res.result.data || [])
            .filter((r) => typeof r.weight === 'number' && r.weight > 0)
            .map((r) => ({ date: r.time || '', weight: r.weight, at: r.created_at || 0 }))
            .sort((a, b) => a.at - b.at || String(a.date).localeCompare(String(b.date)))
          this.$nextTick(() => this.drawChart())
        }
      } catch (e) {
        console.warn('weight load failed', e)
      }
    },
    drawChart() {
      if (!this.series.length) return
      // #ifdef MP-WEIXIN
      uni
        .createSelectorQuery()
        .in(this)
        .select('#weightChart')
        .fields({ node: true, size: true })
        .exec((res) => {
          if (!res || !res[0] || !res[0].node) {
            // canvas 尚未渲染好，稍后重试一次
            setTimeout(() => this.drawChart(), 60)
            return
          }
          const canvas = res[0].node
          const ctx = canvas.getContext('2d')
          const dpr = uni.getSystemInfoSync().pixelRatio || 2
          const W = res[0].width
          const H = res[0].height
          canvas.width = W * dpr
          canvas.height = H * dpr
          ctx.scale(dpr, dpr)
          this.renderLine(ctx, W, H)
        })
      // #endif
    },
    renderLine(ctx, W, H) {
      const pts = this.series
      const padL = 44
      const padR = 16
      const padT = 18
      const padB = 28
      const plotW = W - padL - padR
      const plotH = H - padT - padB
      ctx.clearRect(0, 0, W, H)

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
      const x = (i) => padL + (pts.length === 1 ? plotW / 2 : (plotW * i) / (pts.length - 1))
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
      if (pts.length > 1) {
        const grd = ctx.createLinearGradient(0, padT, 0, padT + plotH)
        grd.addColorStop(0, 'rgba(242,130,92,0.18)')
        grd.addColorStop(1, 'rgba(242,130,92,0)')
        ctx.fillStyle = grd
        ctx.beginPath()
        ctx.moveTo(x(0), y(pts[0].weight))
        pts.forEach((p, i) => ctx.lineTo(x(i), y(p.weight)))
        ctx.lineTo(x(pts.length - 1), padT + plotH)
        ctx.lineTo(x(0), padT + plotH)
        ctx.closePath()
        ctx.fill()
      }

      // y 轴 max / min 标签
      ctx.fillStyle = '#B5ABA2'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(max.toFixed(1), padL - 8, padT + 2)
      ctx.fillText(min.toFixed(1), padL - 8, padT + plotH - 2)

      // 折线
      if (pts.length > 1) {
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
        if (i === pts.length - 1) {
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

      // x 轴首尾日期
      ctx.fillStyle = '#B5ABA2'
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.fillText(this.shortDate(pts[0].date), padL, padT + plotH + 8)
      if (pts.length > 1) {
        ctx.textAlign = 'right'
        ctx.fillText(this.shortDate(pts[pts.length - 1].date), padL + plotW, padT + plotH + 8)
      }
    },
    shortDate(d) {
      return d ? String(d).slice(5) : ''
    },
    startEdit() {
      const p = this.pet
      this.form = {
        name: p.name || '',
        species: p.species === 'dog' ? 'dog' : 'cat',
        breed: p.breed || '',
        birthday: p.birthday || '',
        neutered: !!p.neutered,
        allergy: p.allergy || '',
        chronic: p.chronic || '',
      }
      this.editing = true
    },
    cancelEdit() {
      this.editing = false
    },
    pickSpecies(s) {
      this.form.species = s
    },
    onBirthday(e) {
      this.form.birthday = e.detail.value
    },
    onNeutered(e) {
      this.form.neutered = e.detail.value
    },
    async save() {
      if (!String(this.form.name || '').trim()) {
        uni.showToast({ title: '名字必填', icon: 'none' })
        return
      }
      this.saving = true
      try {
        const pet = { ...this.form, name: this.form.name.trim() }
        const res = await callFn('pets', { action: 'update', id: this.id, pet })
        if (res.result && res.result.ok) {
          uni.showToast({ title: '已保存', icon: 'success' })
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
        let recs = []
        // #ifdef MP-WEIXIN
        const res = await callFn('timeline', { action: 'list', pet: this.pet.name, limit: 8 })
        if (res.result && res.result.ok) recs = res.result.data || []
        // #endif
        this.exportRecs = recs
        const rows = Math.max(Math.min(recs.length, 8), 1)
        this.cw = 340
        // 高度按内容确定，须与 paintVet 的 y 递增严格对应：
        // 头部92 + 30到基础标题 + 10下划线 + 6行*26 + 22到分隔 + 26到近期标题 + 10下划线 + rows*30 + 56页脚
        this.ch = 92 + 30 + 10 + 6 * 26 + 22 + 26 + 10 + rows * 30 + 56
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
      ctx.fillText(`${p.species === 'dog' ? '🐶' : '🐱'} ${p.name}`, padX, 54)
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = '12px sans-serif'
      const sub = `${this.ageText(p.birthday) || '年龄未知'} · ${p.species === 'dog' ? '狗' : '猫'}${p.breed ? ' · ' + p.breed : ''}`
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
        ['慢病', p.chronic || '无'],
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
        recs.slice(0, 8).forEach((r) => {
          y += 30
          const date = (r.time || '').slice(5)
          ctx.font = '13px sans-serif'
          ctx.fillStyle = '#B5ABA2'
          ctx.fillText(date, padX, y)
          const tag = '[' + (r.event_type || '其它') + ']'
          ctx.fillStyle = '#8A7F77'
          ctx.fillText(tag, padX + 42, y)
          const tagW = ctx.measureText(tag).width
          const rawX = padX + 42 + tagW + 8
          ctx.fillStyle = '#3A3330'
          ctx.fillText(this.truncate(ctx, r.raw || '', W - rawX - padX), rawX, y)
        })
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
.profile-head__avatar.is-dog {
  background: radial-gradient(circle at 50% 38%, #fff0e6 0%, #fad9c2 100%);
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

/* 生成给兽医按钮（描边主色） */
.btn-vet {
  margin: 0 var(--pad-page) 24rpx;
  height: 88rpx;
  line-height: 88rpx;
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
  font-size: var(--fs-sub);
  color: var(--c-primary-deep);
  font-weight: 500;
}
.edit-btn--press {
  opacity: 0.55;
}

.weight-chart {
  width: 100%;
  height: 360rpx;
  display: block;
}
.chart-empty {
  padding: 40rpx 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.chart-empty__icon {
  font-size: 64rpx;
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

.form-actions {
  display: flex;
  gap: 20rpx;
  margin-top: 32rpx;
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
