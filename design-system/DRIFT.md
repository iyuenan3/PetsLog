# DRIFT ,设计体系一致性清单（含收敛结果）

> 建镜像 + 渲染质量审计时揪出的跨页 / 重复 / 漂移。每条标注最终处置。
> 收敛执行于 2026-06-20（接渲染锐化批次之后）。

---

## ✅ 已收敛

### #1 养护 care 色硬编码 → 令牌化〔已做，含 2 处 latent〕
**原**：care 色 `#4fa89b`/`#3c8579`/`rgba(79,168,155,0.x)` 散落硬编码，其它四类提醒走 `--c-rt-*` 令牌。
**做法**：App.vue 加第五类色对令牌
```
--c-rt-care: #4fa89b;  --c-rt-care-bg: rgba(79,168,155,0.14);  --c-rt-care-ink: #3c8579;
```
**6 处全部令牌化**（审计原报 4 处，grep 复扫又揪出 record-detail 的 2 处 latent 同根因点一并收）：
- `App.vue` `.tl-dot.ev-care` / `.tl-chip.ev-care`
- `health.vue` `.rm-card--care::before` / `.chip-tag--care`
- `record-detail.vue` `.head__dot.ev-care` / `.head__chip.ev-care` ← 审计漏报、复扫补收
非定义处硬编码复扫 = 0。

### #5 rec__btn 按钮高度 96 → 92〔已做〕
`record.vue` `.rec__btn` 96rpx → 92rpx，与全局 `.btn-primary` 一致。

### （边框）装饰描边 + tabbar 顶边 + border-bottom 分隔 → 整数 px〔已做，渲染批次〕
9 个彩色闭合框/胶囊 `border: 2rpx solid` → `1px`；tabbar 顶边 `border-top: 2rpx` → `1px`；9 处 `border-bottom: 2rpx` → `1px`（整数物理 px 才锐）。`transparent` 占位 + 3rpx 虚线保留（整数化会改线宽）。

---

## ⊘ 复核后判定「非真漂移」，不动（内容驱动的差异，强行统一会回归/受损）

### #2 两套 chip 词汇（tl-chip.ev-* vs chip-tag--*）
**为何不合并**：看似等价，但 **`chip-tag--other` = 紫（`--c-rt-other`，"其它提醒"是真类别）≠ `tl-chip.ev-other` = 灰（`--c-text-2`，时间线"未分类"兜底）**。合并会把提醒"其它" chip 由紫变灰，是色彩回归。两套语义不同，保留。

### #3 两套表单行（field-row vs f-row）label 宽 120 vs 150
**为何不统一**：label 宽是**内容驱动**，record 标签多为 2 字（宠物/类型/体重），health 主粮有"喂给谁"3 字需 150。强行取齐会让 3 字标签挤行或 2 字标签留白。非漂移。

### #4 两处 sheet__title（block vs inline-flex）
**为何不统一**：record 的须 inline-flex（标题带图标 `<text>…</text><image>`），health 的是纯文本 block。差异由"有无图标"决定，非漂移；且 block→inline-flex 改 margin 流式行为有回归风险。

---

## ⊘ 重导大图资产：复核后判定「收益边际 + 离线不可行」，暂不做
**为何**：① 头号 canvas dest 修复后，位图最坏情况仅 ~1.3x 上采样（空状态图标 144→显示 186 物理 px；头像 256→canvas 内 ~330），**勉强偏软、肉眼难辨**，非主要糙源；② 头像 256 对 DOM 用法已够（最大 150rpx=225 物理 px < 256）；③ 本地无 Seedream 头像原图，重导要 Seedream 8 张重画（风险打破现有 kawaii 套系一致性）+ 图标要 Iconify（海外、当前网络不稳）。**性价比不抵风险，先搁置**；真要做，走 Seedream（ARK 国内）整套重画头像 + Iconify 重栅格图标，见 [[reference-petslog-avatar-assets]]。

---

## 注
本轮先做了**渲染锐化批次**（真正影响观感）：canvas 导出 dest 参数（档案卡/分享卡/兽医小结去糊，头号）+ 去宣纸纹理（对齐镜像干净）+ font-smoothing + 描边整数化。一致性收敛（本文件）是次要的可维护性整理，多数"漂移"复核后其实是内容驱动的合理差异。
