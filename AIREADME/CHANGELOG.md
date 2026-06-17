# CHANGELOG — PetsLog
<!-- 版本史，倒序，append-only。为何→DECISIONS；未来→ROADMAP；commit 流水→git；踩坑→MEMORY。 -->

> 仍为内测开发期，未正式 release；下方按里程碑记录主要进展。

## 宠物档案卡富化：性别 + 绝育 + 体重趋势 · 2026-06-17
- Added: **档案卡加性别 / 绝育 / 体重趋势曲线（ADR-025）**：① 新增 `pets.gender` 字段（male / female / ''，pets EDITABLE + `normGender` sanitize），pet.vue 编辑表单加性别分段（公 ♂ / 母 ♀ / 未填）+ 详情页性别行，卡上名字后画 ♂(蓝) / ♀(粉) 符号；② `neutered=true` 时物种 chip 追加「· 已绝育」；③ 卡 `CARD_H` 440→480，3 胶囊下加整宽「体重趋势」band（`paintPetCard` 加 `weightSpark` 参数，≥2 点画珊瑚 sparkline + 末点 + 末值 + 升降箭头，否则占位「📈 记录体重看趋势」）。**不加身价**（费用衍生，守可分享红线）。
- Changed: **体重曲线方案 b（冗余 weight_spark，as-built 改自方案 c）**：用户真机看到轮播占位「记录体重看趋势」在有体重的宠上误导 → 改为 `pets.weight_spark` 冗余近 12 个体重点（saveRecord `recomputeWeightSpark` 落体重记录时维护 + 建档初始化单点）。index.vue 轮播传 `pet.weight_spark`、`cardSig` 签名补 `gender / neutered / weight_spark` → **轮播卡也显真曲线**；pet.vue 分享卡仍传 `this.series` 全量。swiper / 离屏 canvas 高度按 480/320 比例自适应。
- Added: **importNotion `backfill_profile` 一次性回填（admin）**：从 `profile_backfill.json`（gitignore，随函数部署私有云端）回填 9 宠 `gender`（来源：本地简介卡性别栏 + 个别宠物病历 + 用户口述）+ `neutered=true`（用户口述全家已绝育，病历 / Notion 佐证）+ `intro`（简介卡性格文案，仅填空不覆盖）+ 从 records 算 `weight_spark`。DevTools 云测试 admin 登录态触发。
- Tested: `tests/pets` 加性别枚举 sanitize（add + update 两路 male/female 保留 / 非法落空串），pets 单测全绿；全仓 9 套测试 0 失败。`build:mp-weixin` 通过。档案卡新版式经 SVG 镜像 → headless Chrome 截图自验（公 + 已绝育 + 曲线 / 母 + 占位 band 两态，无重叠）。顺手把 pets 测试里残留的两处历史真名向前脱敏成示例占位。**已 commit + push（2bc83bd）**；待真机验（确认存量宠 neutered 字段、各物种 ♂/♀ 字形渲染、band 观感）。

## 动画三项 + tl-item 抽全局修病程列表裸奔 · 2026-06-17
- Added: **微交互动画三项**：① 列表项按下反馈（`:active` 轻压回弹，时间线 / 健康 / 宠物卡通用）；② 上拉加载「三点」loader（翻页时底部三点呼吸，替代生硬文案）；③ 身价 count-up（宠物详情进页时当前身价数字滚动到位，`priceShow` 影子值逐帧逼近 `priceNow`）。均走 GPU transform / opacity，不触 setData。
- Fixed: **病程列表 course.vue mp-weixin 裸奔（页样式不跨页根因）**：`.tl-item` 时间线卡样式原只在 timeline.vue 的 `<style>` 内，mp-weixin 把每页样式各编进自己的 .wxss、**不跨页**，故 course.vue 复用 `.tl-item` class 时无样式（裸奔）。抽 `.tl-item` 全套 + `ev-*` 病程配色到 `App.vue`（→ app.wxss 全局），course / timeline 同源。系统普查全 11 页仅此一处裸奔 + 一处死类，一并清。
- Hardened: 提交前 ultracode 22-agent 评审（6 维 finder / 3 视角对抗 / 完整性批判）must-fix 0。两处教训：动画 `fill-mode: both` 会占住 transform 压死后续 `:active` 按下 scale → 改 `backwards`（仅 delay 段防闪、播完释放）；count-up 展示值 `priceShow` 须以 `priceNow` 兜底，否则弱网 / 派生失败时闪 ¥0。
- Committed: 已 commit + push（484ceb2）。待真机验微交互观感。

## 全局宣纸纹理底 + 过渡动画 + 时间线分页 / 跨年日期 · 2026-06-16
- Added: **全局宣纸纹理背景**：竖版单图 `cover`（非 `repeat`，防拼接缝）；mp-weixin wxss 不支持本地 `url()` → 纹理图 base64 内联进 App.vue；不支持 `fixed` 定位，故颗粒随页长自然延伸。温暖治愈 UI 再进一层。
- Added: **过渡动画 1+2+3**：① 列表 stagger（列表项逐条错峰淡入上移）；② 空状态浮动（空态插画轻微上下浮 breathe）；③ 录入卡滑入（确认卡片从下滑入）。GPU 加速；mp-weixin 路由转场无法自定义（原生），只能做页面内元素动画。
- Added: **时间线分页（修「50 条无翻页」backlog）**：timeline `list` action 加 `skip / hasMore / _id 兜底序`，前端 `onReachBottom` 续页 + 去重；跨年记录日期显示补年份（防同月日跨年混淆）。
- Hardened: 4 维评审抓 1 must-fix：共享 `list` 的 limit 原钳 100，误伤 pet.vue `loadWeight`（取该宠全量算身价 / 体重，需 limit 1000）→ 放行 1000 + 补回归守卫（单宠记录数现最大 92 < 100，限值休眠但守卫在）。
- Committed: 已 commit + push（b655539）。

## emoji 换扁平 kawaii 图标（9 透明 PNG）· 2026-06-16
- Changed: **门面位 emoji 换扁平 kawaii 图标**：tab 栏 / 空状态插画 / 录入门面位 9 处 emoji 替换为成套扁平 kawaii 透明 PNG（Seedream 出图 + 白底角点 floodfill 抠透明，描边当屏障保内部浅色）。小尺寸内联徽标位仍留 emoji（图标辨识度不划算）；tab 选中态仍仅文字变色（图标不切两套）。素材风格 DNA + 抠图做法见 reference。
- Committed: 已 commit + push（a3ea60a）。待真机验图标观感。

## 物种扩展 A 档 + B 档 B2 + 默认头像 · 2026-06-16
- Changed: **解除「仅猫狗」红线 → 8 类物种枚举（ADR-023）**：cat / dog / rabbit / rodent / bird / reptile / fish / other（非法 / 旧值落 other）。落库总闸 `pets/index.js` 二元钳制 `species==='dog'?'dog':'cat'` 改 `normSpecies` 白名单（saveRecord / importNotion / parseRecord/index.js 同步，含修了 record.vue / pet.vue 几处漏网钳制）；前端抽 `src/species.js` 单一真相源（SPECIES / normSpecies / speciesLabel / speciesEmoji / avatarStatic）。猫狗为主 + 常见宠物（A 档：一套统一记录模型，不为物种分叉医疗）。
- Added: **8 物种默认头像（ADR-023）**：扁平 kawaii 矢量图标风（Seedream doubao-seedream-5-0 生成，正面坐姿团子 + 侧面金鱼 + 爪印），放 `src/static/avatar/<species>.png`（256² PNG）；头像优先级 **照片 > 自选 emoji > 物种静态图 > emoji 兜底**（pet.vue 头部三级降级 + petCard.js `loadSpeciesDefault` + index.vue 骨架）。
- Added: **B 档 B2 养护数据维度（ADR-024）**：「养护」= event_type 第 8 桶；养护参数落 `records.params`（schemaless 对象，saveRecord `sanitizeParams` 兜垃圾 + event_type=养护 门控）；爬宠温湿度 / 鱼水质（pH / 氨 / 亚硝酸盐 / 水温）；`src/speciesProfile.js` 每物种 profile 驱动物种感知录入（event_type / 提醒分类按物种收敛 + 养护参数表单 + curSpecies 推导）；timeline / record-detail 渲染参数 chip + 养护配色 ev-care。**Q2 锁定纯用户自定义周期，绝不内置疫苗 / 驱虫周期建议值（守医疗红线）**。
- Tested: `tests/pets` 加物种白名单覆盖、`tests/saveRecord` 加养护 / params 门控 / 键数截断、`tests/parseRecord.prompt` 加物种 / 养护断言；11 套全绿。`build:mp-weixin` 通过。两轮对抗式 review（上轮 12 条 + 提交前全量）修复落地。**已 commit + push（89b5b78）**；待真机验（多物种 / 养护录入回归）。

## 宠物档案卡 + 首页轮播门面 · 2026-06-15
- Added: **宠物档案卡（ADR-021）**：pet.vue 顶部「🪪 档案卡」一键生成温暖治愈风海报图（头像 / 名 / 物种品种 / 年龄 / 最新体重 / 陪伴天数 / 简介），离屏 canvas 出图 → 浮层（长按转发）+ 存相册，复用兽医小结导出管线；头像照片走 `wx.cloud.downloadFile` → `canvas.createImage` 圆形 aspectFill，失败回退 emoji；萌宠 + 轻健康，绝不含费用 / 医院 / 病史 / 病程 / 用药。（修了体重曲线 `canvas type=2d` 穿透档案卡浮层 → `overlayOpen` 计算属性 + v-if 摘 canvas、关后重绘。）
- Changed: **档案卡改版 A·精致留白（ADR-022）**：头像加暖色径向光晕 + 放大（r52→58），物种行改圆角小 chip（🐱 品种），三胶囊加图标（🎂/⚖️/🏡）+ 圆角加大，去突兀大爪印换轻 ✨ + 小爪点缀，简介前加装饰引号，年龄胶囊值**自适应字号**（完整「2岁3个月」放不下逐级降字号、不省略 / 不截断）。
- Added: **首页（宠物 tab）轮播门面（ADR-022）**：主视图从 2 列宠物网格重做成档案卡左右滑轮播（`<swiper>` 邻卡露边 + 当前卡放大、邻卡缩小变暗 + 指示点 + 末张「＋ 添加宠物」+ 点卡进详情）；一块离屏 `#petCardCanvas` 顺序出图 → 各宠 `<image>`，按 8 字段签名缓存（仅脏 / 缺图重渲，再次进 tab 命中缓存零重画），出图前骨架占位。
- Refactored: **抽共享渲染模块 `src/petCard.js`**（`paintPetCard` / `loadPetAvatar` / `CARD_W/CARD_H`）：详情页分享卡与首页轮播卡共用同一份绘制，**逐像素同款、所见即所分享**，根治两处设计漂移；pet.vue 迁出 paintCard / loadAvatarImage / companionDays / roundRect（vet 小结仍用的 ageText / truncate / wrapByWidth 保留）。
- Verified: `npm run build:mp-weixin` 通过（重构无语法错）；档案卡 A 版经 SVG 镜像 → headless Chrome 截图自验版式（占位「示例猫」）。**已 commit + push（7079d64）**；待真机验轮播交互。

## 安全审计 · 家庭多租户隔离回归 E2E · 2026-06-14
- Audited: **13-agent workflow 审计 11 个云函数 + 前端的家庭多租户隔离**，四条不变式（① 鉴权闸触库前零例外 ② `family_id` 作用域闭合 ③ IDOR 按 id 直操作前校验 `doc.family_id` ④ openid 单一可信源 `getWXContext`，闸与查询同一变量）全绿，**0 可利用缺陷**；每条 finding 经对抗式复核（默认怀疑、按设计的安全写法判 false-positive）。
- Verified: 系统性横向比对 9 份手工复制的 `assertMember` 副本语义一致（family 拆 `getMembership`+`assertAdmin`、importNotion 用更严的 `resolveFamily` 反查 admin 家庭），无漂移、无漏 where 条件、无吞错误返 falsy；跨函数契约 parse→save 由 `saveRecord` 用自己的 `event.family_id` 独立再过一次闸把关（攻击者篡改 save 的 family_id → `NOT_MEMBER`，落不进别家）。
- Added: **`tests/isolation.e2e.test.js`（64 断言，9 组安全契约）**：可变 `CUR_OPENID` 模拟攻击者改包，串真实云函数验 A 鉴权闸跨家庭 8 函数全 `NOT_MEMBER` / B 空 family_id → `NO_FAMILY` / C IDOR 删改读别家文档被归属校验挡 / D parse→save 篡改链 / E importNotion 越权（`NOT_ADMIN`/`NOT_FOUND`/`AMBIGUOUS`）/ F 角色身份混淆 / G 邀请码加入 + 被踢后旧码 `BAD_CODE` / H 同名宠物不串档（`PET_UNKNOWN`）/ I 最后一人退出即解散且只清自己家。接入 `npm test`（9 套共 **234 断言**全绿）。
- Added: **`tests/README.md`**：三层测试哲学（单函数集成 / 功能契约 E2E / 安全契约 E2E）+ `Module._load` mock 基建 + 各套覆盖表 + mock 内存 DB 能力边界（无 `_.lt`，故隔离测试邀请码用不限次）+ 真机层抓不到什么。
- Hardened: **CONVENTIONS 新增「多租户隔离（红线）」节**：四条不变式写成契约 + 立 **assertMember 多副本同步红线**（非共享 lib，改任一份必须 N 份同步 + 跑隔离回归通过才提交，防单函数静默失守）。
- Note: 本次为安全审计 + 测试 + 文档，无云函数 / 前端代码改动；3 处改动（isolation.e2e.test.js / tests/README.md / CONVENTIONS）随 v0.4.5 批次 **已 commit + push（5b3a9de）**。

## v0.4.5 · 2026-06-12 · 录入重做：结构化直填 + 确认卡片可编辑 + 点＋弹「记录」入口卡 + 时间精确到分（ADR-017/018）
- Added: **结构化直填（不调 LLM，ADR-017）**：录入新增「结构化逐项填」一路，不过 parseRecord、不写 parse_log、不耗解析配额，前端拼同形 record 直接调 saveRecord（**saveRecord 本就是落库校验边界**，normalizeDate / numOrNull / event_type 枚举 / fuzzyMatchPet + PET_UNKNOWN 服务端原样兜底，故零新增云函数 / 集合 / 字段）。明确知道哪只宠 / 哪天 / 什么类型时可精确录入，离线或上游故障时也能录。
- Added: **确认卡片改全字段可编辑（ADR-017）**：AI 解析结果卡片从只读变可编辑，三种 kind（record / reminder / med_stock）全字段 picker / selector / input 内联改 —— AI 错一个字段（如体重识别错）直接改卡片即可，不再「返回改原文重调一次 LLM」。一份 UI 两用：手动直填 + AI 结果内联修。宠物字段三态守 ADR-015（is_new 建档意图保留唯一建宠通道，其余 picker 选已有，record 落库前必须有 pet）；数字字段出站强制本地 numOrNull（input 给字符串，否则 saveRecord 的 `typeof==='number'` 兜底把 "4.2" 判空丢值）。
- Changed: **点＋弹「记录」入口卡（as-built，多版线框图评审选定「A 三入口卡」；入口卡 / 录入键文案由原拟名「记一笔」统一改为「记录」，涉导航标题 / 入口卡 / 确认卡 / 首页空状态按钮 4 处）**：中央＋仍 navigateTo /pages/record，入口态呈暗背景遮罩 + 居中卡，自然语言 textarea 居中为主入口，下方「或换种方式」分隔线 + 结构化 / 语音两个次级入口（语音禁用占位 toast「敬请期待」，留下一轮）。**入口卡走普通文档流（非 `position:fixed` 浮层）**，原生 textarea 不踩同层渲染穿透坑；表单整页内联，废弃原底部弹层（`sheet-mask`）—— 同因规避原生 input/picker 进 fixed 浮层的层级穿透 / 上滑跳位真机风险。点暗处 / ✕ → navigateBack 关闭。
- Changed: **records.time 精确到分 + created_at 由事件时间派生（ADR-018）**：time 升为 `'YYYY-MM-DD HH:mm'`（缺时刻保留纯日期），`normalizeDateTime`（saveRecord + parseRecord 两处同步）日期段定长零填充保字典序；created_at 由事件时间派生（`createdAtFromTime`）：有分用准点（东八区），仅日期用当日 **12:00**（延续历史导入约定，避免补录旧记录排到时间线顶）。结构化表单时间 = 日期 picker + 时刻 picker（mode=time，到分）；AI 进卡片时 `ensureEventClock` 补当前时刻。prompt 教 LLM 说了时刻才输出 HH:mm + 1 条 few-shot。库内 217 条历史（纯日期 + 中午派生）不受影响，展示零改（timeline `slice(5)` 天然带出到分、体重图轴标 `slice(2,10)` 天然停在日期）。
- Tested: saveRecord 集成测试加 2 组（时间 / created_at 到分 + latest_weight_date 仍纯日期；仅日期 → created_at 落中午 12:00），saveRecord 套 27 → 32 断言；五套共 114 断言（npm test 全绿）。
- Deployed: saveRecord / parseRecord 已 `wxcloud function:upload` 重新部署；前端产物 `dist/build/mp-weixin`（≈0.65MB）走体验版内测。AIREADME 同步：DECISIONS 加 ADR-017/018、SPEC 改 records.time / created_at 字段说明、DEPLOYMENT 加内测发布（体验版）+ 用户隐私保护指引清单。
- Committed: v0.4.5 前端（record.vue 等）+ 云函数源码 **已 commit + push（5b3a9de，与隔离审计回归同批）**；待内测真机回归（录入三路 / 时间到分 / 解析可编辑）。

## v0.4.4 · 2026-06-11 · LLM 上游切换：火山方舟 Coding Plan 直连（弃自建网关，ADR-016 反转 ADR-003）
- Changed: parseRecord 上游从自建 newapi 网关中转改为**火山方舟 Coding Plan 直连**（OpenAI 兼容 `https://ark.cn-beijing.volces.com/api/coding/v3`，模型 `doubao-seed-2.0-pro`），消灭中转站单点（挂则 AI 录入整体不可用）。配置整套换名 `GATEWAY_*` → `ARK_*`，端点 / 模型进 config.local.js 可改（换后端 LLM 不动代码），唯一机密 ARK_API_KEY；**删除自签 root CA 信任逻辑**（方舟公网正规证书），「CA pinned 不可轮换」跨项目约束随之作废（CORE / RELATIONS / ARCHITECTURE / DEPLOYMENT / CLAUDE.md 同步清理）。
- Fixed: dist/dev 与 dist/build 残留的旧 newapi config.local.js 副本（含退役 token + 自签 CA）覆盖清理。
- Tested: 直连冒烟两用例 200（正常录入 + 错别字归一「示列猫」→「示例猫」模型层直接生效），延迟约 4s（旧网关复杂输入曾 20s+），JSON 干净含 new_pet 字段。已部署。

## v0.4.3 · 2026-06-11 · 体重曲线交互重做（拖动平移 + 点按数据点详情）
- Changed: **体重曲线第三版交互**：弃用「scroll-view 套宽 canvas」（canvas 同层渲染失败时触摸被原生组件吞掉、横滑手势到不了 scroll-view，模拟器 / 真机表现不一，真机已证伪），改为 **canvas 固定视口宽 + 手指拖动平移重绘**（touch 事件直接绑 canvas，任何渲染模式都触发）。顺带连根消掉 4096 物理宽上限问题（画布恒为视口宽）、scroll-left 时序 hack、flex min-width 坑；拖动走普通实例属性不触发 setData。
- Added: **点按数据点显示详情气泡**（完整日期 + 体重，深色圆角气泡 + 高亮圈）：8px 累计位移阈值区分拖动 / 点按，点空白收起，贴边夹紧 / 贴顶翻下 / 拖出视口跳过绘制，气泡随平移跟随。
- Hardened: 轻量对抗评审（35 agent）修 5 处：慢速横拖被误判点按（_tx 双职责污染，阈值基准改独立 _sx）；touchend 异步回调期间平移量变化命中错点（同步快照 off）；ly 上界未排除日期标签区；选中点拖出视口气泡贴边悬空；layoutAndDraw 重试封顶 10 次（防退页后逻辑层空转）。记录取舍：catchtouchmove 会吞画布区域的竖向页面滚动（无下拉刷新冲突，已核实未启用）。

## v0.4.2 · 2026-06-11 · 轮4：录入防错别字（意图驱动建档）+ 头像 emoji 自定义 + 手动建宠入口
- Added: **录入防错别字三层防线（ADR-015）**：① parseRecord prompt 强化「错别字 / 同音 / 简称必须归一到已有宠物名」+ 新增 `new_pet` 意图字段（仅「新来的 / 添加宠物 / 领养 / 捡到」类明确表述为 true）+ 错别字与新增两个 few-shot；② parse 层服务端模糊兜底（编辑距离 ≤1 / 互含、按 Unicode code point 算防 emoji 名代理对误判、唯一候选才 snap，结果展示在确认卡片可复核）；③ saveRecord 建档凭意图不凭名字：只在 `new_pet=true` 或 0 宠首录时建档，名字不在库一律拒 `PET_UNKNOWN`（零写入，附名单 + suggest），确认卡片「❓ 没找到这只」+ 已有宠物 chips 点选。**reminder 通道同享防线**（评审抓的：错别字提醒原来会挂幽灵名）。
- Added: **头像 emoji 自定义**：pets 加 `avatar_emoji`（编辑表单 16 格 emoji 选择器 + 照片上传并存）；显示优先级 照片 > 自选 emoji > 物种默认 🐱/🐶；选 emoji 自动清照片并删旧云文件。
- Added: **手动建宠入口**：宠物网格末尾虚线「＋ 添加宠物」卡片 + 空状态「或手动添加宠物档案」链接 → pet.vue 创建模式（`?mode=new` 复用编辑表单，建档后原地变身详情页）。
- Hardened: 67-agent 对抗式评审（4 视角 × 3 票表决）确认 17 条、修 9 处：0 宠空状态录入死端（HIGH，收紧建档 + 入口缺位叠加出的首跑死路 → 0 宠首录视同新增 + 空状态入口）；saveRecord 落库层静默 snap 会把记录改派给别的宠物（→ 只 suggest 不 snap）；reminder 绕过防线；pets add / 改名无查重无 trim 可建重名档案（→ 服务端 trim + family+name 查重）；pickEmoji / 创建取消 / 反复换图三条云存储孤儿头像路径（→ discardTempAvatar 统一清理，传成后再删旧）；单 emoji 名绕过单字护栏互距 1 误 snap（→ code point 切分）；parse 不 trim 与 save 不一致；new_pet 没名字被静默吞（→ 拦截提示补名）；avatar_emoji 类型收紧 slice(0,8) + saveRecord 建档字段集与 pets add 对齐。
- Tested: 新增 `tests/saveRecord.cloudfn.test.js`（27 断言：PET_UNKNOWN 零写入 / suggest / 0 宠放行 / reminder 防线 / emoji 名 / trim / 隔离）+ `tests/pets.cloudfn.test.js`（8 断言：查重 / trim / 类型收紧）；五套共 109 断言（npm test）。
- Changed: pets / parseRecord / saveRecord 已 CLI 重新部署；SPEC 补宠物名解析契约 + avatar_emoji 字典。

## v0.4.1 · 2026-06-11 · 轮3 导入执行收口 + Notion 实时全量核对清洗 + 体重曲线横滑
- Added: importNotion 增 4 个一次性运维动作：`import_foods`（首轮 import 在 foods 集合未建处崩的续传，带 FOODS_NOT_EMPTY 护栏）、`backfill_weight`（从 records 按事件日期回填 pets.latest_weight，导入绕过 saveRecord 回写所致）、`fix_times`（删无日期记录 + 导入记录 created_at 统一「事件日期 + 12:00」）、`stats`（只读体检：计数 + noon 校验 + 脏记录扫描，count 全兜底集合不存在）。主 import 同步：写 pets 自算 latest_weight、created_at 改 12:00 派生、写 foods 前 createCollection 兜底。
- Changed: 体重曲线重做：等间距（每点 ≥56px）+ scroll-view 横滑（固定 y 轴不随滑动跑）+ 默认滚到最新（实测滚动偏移二次校验，绕开同值赋值不生效）+ 日期标签按间距挑点画（≥70px，带日防同月重复）。**canvas 物理宽夹紧 ≤4000px**：微信 canvas 2d 有单边上限（文档 1365×1365，实测 ~4096），某宠 27 个体重点 × dpr3 = 4440 已越线，不夹真机整块白屏（评审 HIGH）。
- Fixed: **Notion 实时全量核对**（21 agent 经 Notion MCP 拉全部 240 页逐字段 diff data.json）：档案 / 记录字段 / 费用对账 / 主粮全一致；修 3 处：CSV 尾部空行混入的全空记录、2 条 Notion 源头漏填日期的体重记录（经用户确认删除）、created_at 全在 00:00 → 12:00（约定缺时间默认中午）。库内终态 9 宠 / 217 记录 / 12 主粮 / 46 附件，stats 全绿。
- Fixed: 导入执行三连坑：importNotion 超时默认 3s 中途被杀（控制台调 60s）；**partial import 后再 clear 会把半写入记录引用的 staged 附件当旧文件删掉**（7 个附件重传，注意 `storage:upload -r` 传目录不能传完整键，否则 key 变 `key/文件名`）；foods 集合未建 import 崩在写 foods（集合不自动创建）。
- Fixed: transform.py 日期必填护栏补齐健康 + 驱虫双循环（无日期行跳过并打印）；首页 openPet 跳转加 fail 弹窗（真机偶发不跳转可见原因）。
- Hardened: 对抗式评审（58 agent，4 视角 × 3 票表决）确认 16 条：修 6 条（canvas 上限 HIGH、padX 24/32 不一致末点高亮圈被裁、stats count 无 catch、scrollLeft 单次定时不可靠、y 轴 rpx/px 错位、ptTime 死代码 + 标签重复）；4 条「验证通过」结论（fix_times 的 imported:true 过滤完整、分页先收集后变更无跳行、backfill 与 saveRecord 逻辑一致、import_foods 无双计）；驳回 2 条。

## v0.4.0 · 2026-06-10 · 字段扩展轮（初始身价 / 简介 / 绝育识别）+ foods 主粮模块 + Notion 历史导入（轮3）
- Added: pets 加 `price_base`（初始身价，反转 ADR-013「身价不入库」）+ `intro`（自由文本简介）；档案页编辑可设，只读展示「当前身价 = price_base + 该宠 records.cost 累计」（前端派生不落库），见 ADR-014。
- Added: **foods 主粮模块**（从 ADR-013 deferred 转正）：新增 foods 集合 + foods 云函数（list / add / update / delete，family 隔离，设 current 自动取消其它 current）；健康页加「主粮」分段（台账增删改查 + 当前在喂高亮 + 底部编辑弹层）。
- Added: **Notion 历史数据结构化导入（轮3，ADR-012/014）**：一次性 importNotion 云函数（clear 按家庭名 + assertAdmin 清空 pets/records/meds/reminders/foods + 云存储 + 归零 storage_bytes；import 灌入 9 宠物 / 220 记录 / 12 主粮 + 41 条记录的附件）。转换脚本 `tools/notion-import/transform.py`：CSV → 结构化 JSON（日期区间取起始、费用去 ¥、档案链取宠物名、名称→病程 tag、event_type 按内容映射 7 桶、品种→猫狗、初始身价、病史/备注识别绝育、驱虫多猫展开 per-pet、附件双重 URL 解码）；附件经 `wxcloud storage:upload` 预传 att/<recordId>/，import 探针拿 cloud:// 前缀拼 fileID + 逐个 getTempFileURL 验证（坏链中止不写库）。data.json gitignore（真实宠物名随函数部署到私有云端，不入公开仓）。
- Tested: 新增 `tests/importNotion.cloudfn.test.js`（mock SDK + data.json，6 场景 / 23 断言，npm test）：家庭解析安全（只动你 admin 的对名家庭、拒非管理员）、clear 只删目标家庭不碰别家、import 拼对 fileID + 坏链中止。
- Fixed: import 直接改 `require('./data.json')` 会污染 require 缓存（同容器二次 import 读到被删 key_name 的数据致 fileID 拼错）→ 克隆后再改（集成测试挖出）。
- Fixed: `normalizeDate` 正则锚死结尾 `(\d{1,2})$`，「2026年6月9日」这类带「日」尾的中文日期匹配不上 → 回退兜底致日期丢失（LLM 偶发输出中文日期、foods 若收到中文日期同此）。改 `\D*$` 容尾部非数字；parseRecord / saveRecord / foods 三处同步（foods 集成测试挖出）。
- Tested: 新增 `tests/foods.cloudfn.test.js`（13 断言）：add/list/update/delete、设 current 自动取消其它、family 隔离 + 跨家庭操作拒。三套云函数集成测试共 74 断言（`npm test`）。
- Hardened: 多 agent 对抗式评审（60 agent，6 视角 + 三视角表决证伪）修一批真问题：① **到家记录的费用列存的是购入身价（= 初始身价），误入 records.cost 致当前身价双重计入**（transform 对「到家」记录 cost 置 None；修后当前身价与 Notion 原值精确吻合）；② import 非幂等：未先 clear 重跑会写重复 pets + records 撞 dup _id 中途崩、无回滚 → 入口强制目标家庭 pets/records 为空否则 NOT_EMPTY 拒；③ 家庭解散 cascadeDeleteFamily 漏删新增的 foods 集合 → 补 'foods'；④ foods clearOtherCurrent 吞错致失败时静默两条 current → 去 catch 让其冒泡；⑤ 导入 records 的 created_at 全用 now 致主时间线乱序 + limit 50 截断 → created_at 由事件日期派生；⑥ num_or_null 多小数点 float 崩溃 + 负号翻正 → 防御；⑦ 当前身价 costSum 复用 limit 200 查询会截断超量宠物 → 提到 1000；⑧ clear 漏删 att_log、设在喂残留 end_date、绝育「未绝育」误判等 low 一并修。

## v0.3.2 · 2026-06-10 · 附件轮2（健康记录挂图片 / 视频 / PDF + 配额限额 + 记录详情页 + 级联清理）
- Added: 健康记录附件（ADR-011）：records 加 `attachments[]`（fileID / thumb / type / name / size / bytes）+ `att_count`；新 `attachment` 云函数（register / remove / deleteRecord），登记前服务端按云存储真实体积复核（getTempFileURL + HEAD，客户端报的 size 不可信），超限删文件回滚。
- Added: 配额三道闸（共享环境生命线）：单条 ≤9 个；家庭总存储 ≤1GB（families.`storage_bytes` 原子计数）；日上传 ≤200MB/家庭（新 `att_log` 流水，复用 parse_log 的 family_id+day 模式）。单文件上限：图 10MB / 视频 30MB·30s / PDF 10MB。
- Added: 上传入口两处（ADR-011）：录入二次确认卡片选附件（确认归档后才上传，取消不留孤儿；上传失败记录仍在可补传）+ 新「记录详情页」事后补传。图片端侧压缩（长边 ≤2000 q80）+ 缩略图（360px），列表只下缩略图省 CDN 下行（1GB/月 真瓶颈）；视频 chooseMedia compressed；PDF 走 chooseMessageFile（小程序只能从聊天选文件）。
- Added: 记录详情页 `pages/record-detail`：全部结构化字段 + 附件九宫格（点开 previewMedia 图视频混滑 / PDF downloadFile+openDocument 带本地缓存、长按删）+ 删除整条记录；时间线行加 📎 角标、点击进详情；timeline 云函数加 `get` 单条（family 校验防跨家庭读）。
- Added: 级联清理（ADR-011 + 轮1 backlog 孤儿文件）：删附件 / 删记录回收 storage_bytes 并删云存储文件；解散家庭级联删全部附件 + 宠物头像（分页扫 records 防 100 条截断漏删）；宠物 / 用户换头像删旧 fileID、删宠物删头像（记录及其附件有意保留：删档案 ≠ 删病史）。
- Changed: 云函数部署切换 `@wxcloud/cli function:upload`（命令行直传源码目录 + 云端装依赖，绕开 DevTools CLI 签名失败；超时 / 内存配置仍走控制台），见 DEPLOYMENT / MEMORY。
- Hardened: 提交前多 agent 对抗式评审（6 视角找 + 逐条三视角表决证伪，93 agent）修一批真问题：① 安全：register 对客户端传入 fileID 零归属校验可删 / 读别家文件（high）→ 加「fileID 必须落在 att/<record_id>/ 路径 + record_id 经 getOwnedRecord 验权」双闸，验权前绝不删文件；② 并发：attachments 整组覆盖写改 `_.push`/`_.pull` 原子操作（防 last-write-wins 丢更新致孤儿 + 配额漂移），register 体积复核期间记录被删则 `stats.updated` 判 no-op 回滚；③ 健壮：register 调用包 try（弱网上传成功但调用失败补删文件防孤儿）、记录详情页补传加 try/finally（防异常锁页）、openDocument 加 fail 回调 + pdfCache 失效、getTempFileURL 链缓存加 TTL；④ 回归：deleteRecord 回写 pets.latest_weight（删最新体重记录后档案不失真）；⑤ 体积复核 HEAD 改并行 + 单次超时降 5s（防串行超云函数超时被杀）、日护栏求和分页（防 limit 1000 截断绕过）、解散家庭先删文档后删文件 + 宠物头像分页扫、图片客户端补 10MB 预检。

## v0.3.1 · 2026-06-09 · 字段扩展轮1（就诊医院 / 费用 / 病程 + 宠物到家日期 / 备注 / 头像 + 驱虫桶）
- Added: records 加 `hospital`（就诊医院）/ `cost`（费用元，number\|null）/ `tag`（病程标签，与 event_type 双轴）/ `desc`（干净事件描述，不含费用 / 医院 / 寒暄，给兽医小结拼接用）；event_type 6 桶 → 7 桶（增「驱虫」）。parseRecord 同步抽取 + 7 桶分类，saveRecord 落库 + `EVENT_TYPES` 受控枚举校验。见 ADR-012/013。
- Added: pets 加 `home_date`（到家日期）/ `note`（备注）/ `avatar`（头像云存储 fileID），EDITABLE 白名单同步；宠物档案页编辑可设三项（头像走 `wx.chooseMedia` → 云存储 fileID），宠物网格 / 档案头部展示真实头像（无则 emoji 兜底）。
- Added: 时间线展示 🏥医院 / 💰费用 / 🏷️病程，驱虫事件配色（ev-deworm）；顶部病程 tag 简版横向筛选条（点 tag 筛该病程线，点「全部」恢复）。
- Changed: 给兽医小结正文【只用结构化字段拼接（desc 描述 / 病程 / 用药 / 体重），绝不用 raw 原话】+【不展示费用 / 就诊医院】：raw 含费用 / 医院 / 寒暄，对不同医院 / 医生敏感（费用只留时间线）。新增 records.desc（parseRecord 抽干净描述）支撑；composeVetBody / paintVet 注释钉死防回归。
- Changed: 给兽医小结近期记录正文按列宽自动换行（不再单行截断，长记录 / 病程名看得全），最多展示最近 10 条、超出给「仅展示最近 N 条」提示，画布高度按换行行数动态算，避免图过长。
- Fixed: 自定义 tabBar 点「宠物」无法回宠物档案页：`switchTo` 早退判据从每实例可能残留默认 0 的 `this.data.selected` 改为按真实当前路由 `getCurrentPages` 判断（idx 0 = 宠物恰是默认值，故偏偏宠物被吞）。见 MEMORY。
- Fixed: 对抗式评审（多 agent 8 视角 + 逐条三视角表决证伪）修：cost 容错 `Number('')===0` 把无数字串（如「免费」）错判成 0 污染费用语义（saveRecord + parseRecord 两份 numOrNull 同步修）；tag / hospital 自由文本落库 trim 防同名病程线散裂；宠物头像 chooseMedia 缺 fail 兜底。
- Fixed: parseRecord 复杂长输入 20s 超时（-504003）：抽取字段变多（含 desc）后 LLM 生成更久，HTTP 请求超时 20s → 45s，云函数超时需控制台调到 60s。见 MEMORY。
- Fixed: 给兽医小结近期记录按录入时间(created_at)排序导致乱序（补录的旧事件排到最前）：timeline 加可选 `orderField`，小结按事件日期 `time` 由近到远（同日按 created_at 兜底）；默认仍 created_at，主时间线 / 体重图不传该参、行为不变。
- Hardened: 上条排序依赖 `time` 字典序==时间序，故 parseRecord / saveRecord 加 `normalizeDate` 把 LLM 日期（time / rem_date / med_expire）归一为定长零填充 'YYYY-MM-DD'（防偶发 '2026-6-9' 破坏字典序致静默错排 / 提醒误判到期）。对抗复核挖出（doubao 无 response_format，格式仅 prompt 约束）。

## v0.3.0 · 2026-06-09 · 底部导航重构 + 家庭成员档案显示修复 + 构建瘦身
- Changed: 底部导航 5 tab → 4 tab（宠物 / 时间线 / 健康 / 我的）+ 中央凸起「＋」全局录入键；自定义 tabBar（微信原生组件四件套 `src/custom-tab-bar/index.{js,json,wxml,wxss}`，非 .vue）；提醒 + 药品合并「健康」分段页；录入从首页常驻输入条迁到独立录入页 `pages/record`；首页更名「宠物」变纯档案页。见 ADR-010。
- Fixed: 家庭管理成员显示「成员+openid 尾码」而非昵称：`family` listMembers 改为读时关联 `users` 集合取昵称 + 头像（fileID），family.vue 成员行用 `<image>` 渲染真实头像、无则回退首字；`family_members.nickname` 降为兜底。
- Changed: 构建产物不再拷云函数 node_modules（vite 插件 cpSync filter 掉，`dist/cloudfunctions` 586MB → 92K），根治 DevTools 监视巨型目录致「不停自动刷新」+ 拖慢构建；云函数部署改「上传并部署:云端安装依赖」。见 MEMORY。
- Fixed: 评审修健康页药品临期判定与提醒时间源不一致（统一服务端 today）、分段懒加载陈旧（onShow 刷两段）；版本号统一 0.3.0（manifest / package / 关于页）。

## v0.2.0 · 2026-06-09 · 家庭多租户 + 个人中心 + 评审硬化
- Added: 「家庭 + 用户」多租户（隔离键 openid → family，新增 family/user 云函数 + families/family_members/invites/users 集合 + 每函数 assertMember 守卫），见 ADR-008。
- Added: 个人中心「我的」tab（个人档案昵称 + 微信头像、家庭管理·切换·邀请码生成/输码加入·转让/踢人/退出、用户/隐私协议模板），见 ADR-009。
- Fixed: 全代码库对抗式评审修一批真问题，含 user 服务端 add 漏写 `_openid` 致档案永远读不回（根因，见 MEMORY）、补录旧体重覆盖最新（加日期守卫）、邀请码并发超限（原子占名额）、改名漏级联 reminders、家庭上下文失败静默全空白、README 破折号、版本号漂移等。

## v0.2.0-dev · 2026-06-08 · MVP 增强 + UI 重设计
- Added: 宠物档案编辑 / 删除（pets update·delete，改名级联历史记录）；体重曲线（档案页 canvas 折线）；用药·疫苗·驱虫提醒（新 reminders 集合 + 云函数 + 「提醒」tab + 首页到期横幅，自然语言设提醒含周期）；一键截图给兽医（canvas 出图 + 存相册 / 长按转发，含医疗免责）。
- Added: 整体 UI 视觉「温暖治愈」设计系统（珊瑚 + 暖米，CSS 自定义属性令牌挂 page；全 5 页重做 + tabBar 暖化），见 DECISIONS ADR-007。
- Changed: parseRecord 新增 `kind=reminder` 解析；saveRecord 增 reminder 分流；ensureCollections 增建 reminders。
- Fixed: 云函数 node_modules 随构建丢失（vite emptyOutDir 清 dist）→ 依赖移入源码 cloudfunctions/* 由 cpSync 自动带入，见 MEMORY。

<!-- 模板：
## v<x> · YYYY-MM-DD
- Added:
- Changed:
- Fixed:
- Removed:
- Deprecated:
-->

> 历史范式（v1/v2 非本仓库 release，仅备忘，详见 CORE「三阶段演进」）：
> - v1 · 2025.09 · Cursor + uni-app + uniCloud，内测后因空间没续费下线。
> - v2 · 2026.01 · OpenClaw 重构，8000 行 / 双端 / CI/CD，未上生产。
> - v3 · 2026.04 起 · 本仓库，自然语言录入 + AI 解析，立项中。
