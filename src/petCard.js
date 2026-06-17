// 宠物档案卡的共享 canvas 渲染（ADR-021 海报卡 + ADR-022 A 版改版 + ADR-023 多物种默认头像）。
// 详情页 pet.vue（按需出图分享）与首页 index.vue（轮播门面）共用同一份 paintPetCard，
// 保证「所见即所分享」WYSIWYG、杜绝两处各画一版的设计漂移。
// 守红线：对外分享物绝不含费用 / 医院 / 病史 / 病程 / 用药（纯萌宠 + 轻健康）。

import { petAge } from '@/utils'
import { speciesEmoji, speciesLabel, avatarStatic } from '@/species'

// 卡片逻辑尺寸（竖版海报）；dpr3 物理 960×1440 < 4096，不触发真机白屏。
export const CARD_W = 320
export const CARD_H = 480 // ADR-025：440→480，3 胶囊下增「体重趋势」band

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
// weightSpark（ADR-025，可选）：[{weight}] 或 [number] 体重点（已按时间排序）。
// 详情/分享卡传 this.series（全量历史）；首页轮播传 pets.weight_spark（方案 b 冗余的近 12 点，saveRecord 维护 + 一次性回填）。
// ≥2 点画趋势曲线，否则（该宠确无体重记录）走占位提示。
export function paintPetCard(ctx, W, H, pet, avatarImg, weightSpark) {
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

  // 名字（+ 性别符号，ADR-025）：名字 + ♂/♀ 作为整体居中（量总宽后左对齐起画），符号贴名字右侧、按性别上色、抬 3px 对齐名字视觉中线。
  ctx.textBaseline = 'alphabetic'
  const gsym = p.gender === 'male' ? '♂' : p.gender === 'female' ? '♀' : ''
  ctx.font = '700 27px sans-serif'
  const nm = truncate(ctx, p.name || '未命名', W - (gsym ? 72 : 56))
  const nmW = ctx.measureText(nm).width
  if (gsym) {
    ctx.font = '700 19px sans-serif'
    const gw = ctx.measureText(gsym).width
    const gap = 8
    const startX = cx - (nmW + gap + gw) / 2
    ctx.textAlign = 'left'
    ctx.font = '700 27px sans-serif'
    ctx.fillStyle = '#3A3330'
    ctx.fillText(nm, startX, 220)
    ctx.font = '700 19px sans-serif'
    ctx.fillStyle = p.gender === 'male' ? '#5B8DEF' : '#E86F9E'
    ctx.fillText(gsym, startX + nmW + gap, 217)
    ctx.textAlign = 'center'
  } else {
    ctx.textAlign = 'center'
    ctx.fillStyle = '#3A3330'
    ctx.fillText(nm, cx, 220)
  }

  // 物种 chip：emoji 品种（无品种则物种名）+ 已绝育（ADR-025，neutered 才追加），暖色圆角小标签。
  const spe = speciesEmoji(p.species)
  let spt = p.breed ? `${spe} ${p.breed}` : `${spe} ${speciesLabel(p.species)}`
  if (p.neutered) spt += ' · 已绝育'
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

  // 体重趋势 band（ADR-025）：3 胶囊下整宽一条。≥2 个体重点 → 珊瑚 sparkline + 升降箭头（不重复显示当前值，值在 ⚖️ 胶囊）；
  // 否则（该宠无 / 不足 2 点体重记录）→ 占位提示「记录体重看趋势」。
  {
    const bx = 24
    const by = 362
    const bw = W - 48
    const bh = 40
    roundRect(ctx, bx, by, bw, bh, 14)
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.fill()
    ctx.lineWidth = 1
    ctx.strokeStyle = 'rgba(242,130,92,0.22)'
    ctx.stroke()
    const ws = (weightSpark || [])
      .map((p2) => (typeof p2 === 'number' ? p2 : p2 && p2.weight))
      .filter((w) => typeof w === 'number' && w > 0)
      .slice(-12)
    if (ws.length >= 2) {
      // 左标签「体重」
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.font = '11px sans-serif'
      ctx.fillStyle = '#9A8E85'
      ctx.fillText('体重', bx + 14, by + bh / 2)
      // 升降箭头（末 vs 首）放最右，按方向上色（升珊瑚 / 降青 / 平灰）；不重复显示数值（当前值在 ⚖️ 胶囊）
      const last = ws[ws.length - 1]
      const first = ws[0]
      const arrow = last > first ? '↗' : last < first ? '↘' : '→'
      ctx.textAlign = 'right'
      ctx.font = '700 15px sans-serif'
      ctx.fillStyle = last > first ? '#C9542F' : last < first ? '#3C8579' : '#9A8E85'
      ctx.fillText(arrow, bx + bw - 14, by + bh / 2)
      // sparkline 占满「标签 → 箭头」之间（高 weight 在上）
      const sx0 = bx + 50
      const sx1 = bx + bw - 34
      const sw = Math.max(20, sx1 - sx0)
      const pad = 9
      const sy0 = by + pad
      const sh = bh - pad * 2
      const mn = Math.min(...ws)
      const mx = Math.max(...ws)
      const range = mx - mn || 1
      ctx.beginPath()
      ws.forEach((w, i) => {
        const x = sx0 + (sw * i) / (ws.length - 1)
        const y = sy0 + sh * (1 - (w - mn) / range)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.strokeStyle = '#F2825C'
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
      // 末点小圆
      const ey = sy0 + sh * (1 - (last - mn) / range)
      ctx.beginPath()
      ctx.arc(sx0 + sw, ey, 2.6, 0, Math.PI * 2)
      ctx.fillStyle = '#F2825C'
      ctx.fill()
    } else {
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '12px sans-serif'
      ctx.fillStyle = '#B7ACA3'
      ctx.fillText('📈 记录体重看趋势', cx, by + bh / 2)
    }
    ctx.textBaseline = 'alphabetic'
  }

  // 简介引用句（有才画，最多 2 行）：左侧装饰大引号 + 居中两行。
  if (p.intro && String(p.intro).trim()) {
    const quote = String(p.intro).trim()
    ctx.font = '13px sans-serif'
    const allLines = wrapByWidth(ctx, quote, W - 72)
    const lines = allLines.slice(0, 2)
    if (allLines.length > 2 && lines.length === 2) {
      // 截断更干净：去掉末行尾部悬挂的开括号 / 标点，再加省略号且保证不溢出（避免断在「等开引号上）
      let last = lines[1].replace(/[「『（(【〈《，、,.。．·\s]+$/u, '')
      while (last && ctx.measureText(last + '…').width > W - 72) last = last.slice(0, -1)
      lines[1] = last + '…'
    }
    ctx.save()
    ctx.textAlign = 'left'
    ctx.font = '30px Georgia, serif'
    ctx.fillStyle = 'rgba(242,130,92,0.3)'
    ctx.fillText('“', 38, 430)
    ctx.restore()
    let qy = 426
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
  ctx.fillText('🐾 PetsLog · 温暖记录', cx, 470)
  ctx.textAlign = 'left'
}
