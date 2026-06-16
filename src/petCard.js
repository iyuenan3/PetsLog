// 宠物档案卡的共享 canvas 渲染（ADR-021 海报卡 + ADR-022 A 版改版 + ADR-023 多物种默认头像）。
// 详情页 pet.vue（按需出图分享）与首页 index.vue（轮播门面）共用同一份 paintPetCard，
// 保证「所见即所分享」WYSIWYG、杜绝两处各画一版的设计漂移。
// 守红线：对外分享物绝不含费用 / 医院 / 病史 / 病程 / 用药（纯萌宠 + 轻健康）。

import { petAge } from '@/utils'
import { speciesEmoji, speciesLabel, avatarStatic } from '@/species'

// 卡片逻辑尺寸（竖版海报）；dpr3 物理 960×1440 < 4096，不触发真机白屏。
export const CARD_W = 320
export const CARD_H = 440

// 陪伴天数 = 今天 - 到家日期（天）；无 / 非法 / 未来 → null（对应胶囊不出）。
function companionDays(home) {
  const s = String(home || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const t = new Date(s.replace(/-/g, '/') + ' 00:00:00').getTime()
  if (isNaN(t)) return null
  const days = Math.floor((Date.now() - t) / 86400000)
  return days >= 0 ? days : null
}

// 单行截断：超 maxW 逐字去尾 + …。
function truncate(ctx, text, maxW) {
  let t = String(text)
  if (ctx.measureText(t).width <= maxW) return t
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

// 按容器宽度逐字换行（中文无空格，逐字断行）。
function wrapByWidth(ctx, text, maxW) {
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
}

// 自适应字号：从 startPx 起，measureText 超 maxW 则逐级降到 minPx（不省略号 / 不截断）。
// 解决长龄「12岁11个月」在固定胶囊里溢出，又不破坏短龄的视觉重量。
function fitFont(ctx, text, maxW, startPx, minPx, weight) {
  let s = startPx
  ctx.font = `${weight} ${s}px sans-serif`
  while (s > minPx && ctx.measureText(text).width > maxW) {
    s--
    ctx.font = `${weight} ${s}px sans-serif`
  }
  return s
}

// 圆角矩形路径（arcTo，小程序 canvas 2d 无 roundRect API）。
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 物种默认头像静态图 → canvas.createImage（ADR-023）；图未就位 onerror → resolve(null)（回退 emoji）。
function loadSpeciesDefault(canvas, species, resolve) {
  // #ifdef MP-WEIXIN
  const img = canvas.createImage()
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = avatarStatic(species)
  return
  // #endif
  // eslint-disable-next-line no-unreachable
  resolve(null)
}

// 头像加载（ADR-021 + ADR-023）：传整只 pet，守优先级 照片 > 自选 emoji > 物种静态图 > emoji 兜底。
// 有照片 fileID → cloud:// 下载到本地 → createImage；无照片 / 下载失败 → 回退：
//   有自选 emoji → resolve(null)（让 paintPetCard 画 emoji，不画静态图）；否则 → 物种默认静态图；再失败 resolve(null)。
export function loadPetAvatar(canvas, pet) {
  const p = pet || {}
  const fileID = p.avatar
  const species = p.species
  // 无照片 / 下载失败的回退：有自选 emoji 跳过静态图（emoji 优先级高于静态图），否则加载物种静态图
  const fallback = (resolve) => (p.avatar_emoji ? resolve(null) : loadSpeciesDefault(canvas, species, resolve))
  return new Promise((resolve) => {
    // #ifdef MP-WEIXIN
    if (typeof wx === 'undefined') return resolve(null)
    if (fileID && wx.cloud) {
      wx.cloud.downloadFile({
        fileID,
        success: (d) => {
          const path = d && d.tempFilePath
          if (!path) return fallback(resolve)
          const img = canvas.createImage()
          img.onload = () => resolve(img)
          img.onerror = () => fallback(resolve)
          img.src = path
        },
        fail: () => fallback(resolve),
      })
      return
    }
    return fallback(resolve)
    // #endif
    // eslint-disable-next-line no-unreachable
    resolve(null)
  })
}

// 把一只宠物画成海报卡（A 版）。ctx 已按 dpr 缩放；W/H = CARD_W/CARD_H。
// avatarImg 由 loadPetAvatar 预加载（可为 null → 回退 emoji）。
export function paintPetCard(ctx, W, H, pet, avatarImg) {
  const p = pet || {}
  const cx = W / 2

  // 背景：暖米珊瑚竖向渐变（温暖治愈令牌镜像，canvas 读不了 CSS 变量）。
  const bg = ctx.createLinearGradient(0, 0, 0, H)
  bg.addColorStop(0, '#FCE7DA')
  bg.addColorStop(0.45, '#FAF1E9')
  bg.addColorStop(1, '#FAF6F0')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)

  // 轻量点缀（低透明散布的 ✨ + 小爪，替代初版突兀大爪印）。
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const deco = [
    ['✨', 44, 70, 16, 0.35],
    ['✨', 280, 150, 13, 0.3],
    ['🐾', 36, 300, 12, 0.25],
    ['🐾', 286, 318, 14, 0.22],
  ]
  deco.forEach(([g, x, y, s, a]) => {
    ctx.globalAlpha = a
    ctx.font = `${s}px sans-serif`
    ctx.fillText(g, x, y)
  })
  ctx.globalAlpha = 1

  // 头像区：暖色径向光晕 halo → 白底圆 + 暖棕阴影 → 圆内照片 / emoji → 白环。
  const acy = 120
  const ar = 58
  const halo = ctx.createRadialGradient(cx, acy, 0, cx, acy, 84)
  halo.addColorStop(0, 'rgba(248,183,154,0.55)')
  halo.addColorStop(1, 'rgba(248,183,154,0)')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(cx, acy, 84, 0, Math.PI * 2)
  ctx.fill()

  ctx.save()
  ctx.shadowColor = 'rgba(196,124,86,0.34)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 8
  ctx.beginPath()
  ctx.arc(cx, acy, ar, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, acy, ar - 3, 0, Math.PI * 2)
  ctx.clip()
  const ir = ar - 3
  if (avatarImg) {
    const iw = avatarImg.width || 1
    const ih = avatarImg.height || 1
    const sq = Math.min(iw, ih)
    ctx.drawImage(avatarImg, (iw - sq) / 2, (ih - sq) / 2, sq, sq, cx - ir, acy - ir, ir * 2, ir * 2)
  } else {
    ctx.fillStyle = '#FCEFE6'
    ctx.fillRect(cx - ir, acy - ir, ir * 2, ir * 2)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '60px sans-serif'
    ctx.fillText(p.avatar_emoji || speciesEmoji(p.species), cx, acy + 2)
  }
  ctx.restore()
  ctx.beginPath()
  ctx.arc(cx, acy, ar, 0, Math.PI * 2)
  ctx.lineWidth = 5
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()

  // 名字。
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#3A3330'
  ctx.font = '700 27px sans-serif'
  ctx.fillText(truncate(ctx, p.name || '未命名', W - 56), cx, 220)

  // 物种 chip：emoji 品种（无品种则物种名），暖色圆角小标签。
  const spe = speciesEmoji(p.species)
  const spt = p.breed ? `${spe} ${p.breed}` : `${spe} ${speciesLabel(p.species)}`
  ctx.font = '600 12.5px sans-serif'
  const chipTxt = truncate(ctx, spt, W - 90)
  const chipW = ctx.measureText(chipTxt).width + 28
  const chipH = 26
  const chipX = cx - chipW / 2
  const chipY = 234
  roundRect(ctx, chipX, chipY, chipW, chipH, 13)
  ctx.fillStyle = 'rgba(255,255,255,0.7)'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(242,130,92,0.28)'
  ctx.stroke()
  ctx.fillStyle = '#C9542F'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(chipTxt, cx, chipY + chipH / 2 + 0.5)
  ctx.textBaseline = 'alphabetic'

  // 数据胶囊（动态：缺项不出，按实际数量居中）：🎂 年龄 / ⚖️ 体重 / 🏡 陪伴。
  const pills = []
  const age = petAge(p.birthday)
  if (age) pills.push(['🎂', '年龄', age])
  if (p.latest_weight) pills.push(['⚖️', '体重', p.latest_weight + 'kg'])
  const days = companionDays(p.home_date)
  if (days != null) pills.push(['🏡', '陪伴', days + '天'])
  if (pills.length) {
    const pw = 96
    const ph = 70
    const gap = 8
    const totalW = pills.length * pw + (pills.length - 1) * gap
    let px = cx - totalW / 2
    const py = 286
    pills.forEach(([icon, label, value]) => {
      const pcx = px + pw / 2
      roundRect(ctx, px, py, pw, ph, 16)
      ctx.fillStyle = 'rgba(255,255,255,0.78)'
      ctx.fill()
      ctx.lineWidth = 1
      ctx.strokeStyle = 'rgba(242,130,92,0.22)'
      ctx.stroke()
      ctx.textAlign = 'center'
      ctx.font = '19px sans-serif'
      ctx.fillStyle = '#3A3330'
      ctx.fillText(icon, pcx, py + 26)
      const vs = fitFont(ctx, value, pw - 16, 16, 11, '700')
      ctx.font = `700 ${vs}px sans-serif`
      ctx.fillStyle = '#C9542F'
      ctx.fillText(value, pcx, py + 48)
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#9A8E85'
      ctx.fillText(label, pcx, py + 63)
      px += pw + gap
    })
  }

  // 简介引用句（有才画，最多 2 行）：左侧装饰大引号 + 居中两行。
  if (p.intro && String(p.intro).trim()) {
    const quote = String(p.intro).trim()
    ctx.font = '13px sans-serif'
    const lines = wrapByWidth(ctx, quote, W - 72).slice(0, 2)
    ctx.save()
    ctx.textAlign = 'left'
    ctx.font = '34px Georgia, serif'
    ctx.fillStyle = 'rgba(242,130,92,0.3)'
    ctx.fillText('“', 38, 392)
    ctx.restore()
    let qy = 388
    ctx.font = '13px sans-serif'
    ctx.fillStyle = '#6B615B'
    ctx.textAlign = 'center'
    lines.forEach((ln) => {
      ctx.fillText(ln, cx, qy)
      qy += 20
    })
  }

  // 底部水印。
  ctx.fillStyle = '#C2B8AF'
  ctx.font = '10.5px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('🐾 PetsLog · 温暖记录', cx, 430)
  ctx.textAlign = 'left'
}
