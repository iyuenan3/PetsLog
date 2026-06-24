# CLAUDE.md — PetsLog
> 多宠家庭 AI 健康记录工具（微信小程序 · 自然语言录入 → AI 结构化归档）｜ Maxwell
> 真相源 = `AIREADME/`。本文件只做 router：状态 / 路由 / 红线指针 / 维护责任 / 命令 / 元信息。

## 当前状态（2026-06-24）
- **MVP 主链路 + 增强 + UI + 家庭多租户 + 个人中心 + 底部导航重构 + 字段扩展轮1 + 附件轮2 + 轮3（身价/简介/foods/历史导入）+ 轮4（录入防错别字/头像 emoji/手动建宠）+ 录入重做（结构化直填/确认卡片可编辑/三入口卡/时间到分）均已落地（真机内测，版本 0.4.5）**。栈：uni-app（mp-weixin）+ 微信云开发（11 云函数 + 11 集合 + 云存储，env cloud1-…）+ 火山方舟 Coding Plan 直连（OpenAI 兼容，doubao-seed-2.0-pro，ADR-016）。
- 增强：宠物档案编辑、体重曲线、用药·疫苗·驱虫提醒（站内）、一键截图给兽医；UI 走「温暖治愈」设计系统（CSS 令牌挂 page），见 `AIREADME/DECISIONS` ADR-006/007。
- 导航：底部 5 tab → 4 tab（宠物 / 时间线 / 健康 / 我的）+ 中央凸起「＋」全局录入键（自定义 tabBar）；提醒 + 药品合并「健康」分段页；录入从首页常驻输入条迁到独立录入页，见 ADR-010。家庭成员名 / 头像读时关联个人档案（users）。
- 字段扩展轮1（v0.3.1）：records 加就诊医院 / 费用 / 病程标签（双轴，时间线可按病程筛）+ event_type 增驱虫第 7 桶；pets 加到家日期 / 备注 / 头像，见 ADR-012/013。
- 附件轮2（v0.3.2）：记录挂图片 / 视频 / PDF（attachment 云函数服务端复核真实体积；配额：单条 ≤9、家庭 ≤1GB、日 ≤200MB）；录入卡片 + 新记录详情页双入口；缩略图省 CDN；删记录 / 解散家庭 / 换头像级联清理云存储，见 ADR-011。
- 轮3（v0.4.0/0.4.1）：pets 加初始身价 / 简介（当前身价前端派生）+ foods 主粮模块（集合 + 云函数 + 健康页台账）+ Notion 历史导入，见 ADR-014。**导入已执行完毕**（库内终态 9 宠 / 217 记录 / 12 主粮 / 46 附件，经 Notion MCP 实时全量核对 + fix_times 清洗，created_at 统一「事件日期 + 12:00」，stats 体检全绿）。体重曲线横滑重做（等间距 + canvas 物理宽夹紧防白屏）。
- 轮4（v0.4.2）：录入防错别字（建档凭意图不凭名字：parse 层归一 + 确认卡片选宠 + saveRecord PET_UNKNOWN 零写入，reminder 同防线）+ 头像 emoji 自定义（照片 > 自选 emoji > 物种默认）+ 手动建宠入口（网格 ＋ 卡片 → pet.vue mode=new），见 ADR-015。
- 录入重做（v0.4.5）：结构化直填（不调 LLM，前端拼同形 record 直走 saveRecord 落库校验边界）+ 确认卡片改全字段可编辑（AI 错字段内联改不重调）+ 点＋弹「记录」三入口卡（自然语言主入口 / 结构化 / 语音占位）+ records.time 精确到分、created_at 由事件时间派生（仅日期落中午 12:00），见 ADR-017/018。
- 病程视图 + tag 治理 + 解析 I/O 精准化（ADR-019/020）+ 多租户隔离审计回归（13-agent 审 11 云函数四不变式全绿 0 缺陷 + isolation.e2e 64 断言 + assertMember 多副本同步红线）+ 录入重做 v0.4.5 **已一并 commit + push（5b3a9de → origin/main，9 套 234 断言全绿）**。
- 档案卡 + 首页轮播门面（ADR-021/022）：档案卡海报图（pet.vue 复用兽医小结离屏 canvas 管线，修了体重曲线 canvas 穿透浮层）+ 改版 A·精致留白（头像光晕/物种 chip/图标胶囊/自适应年龄字号）+ 渲染抽共享模块 `src/petCard.js`（详情页分享卡 ↔ 首页轮播卡逐像素同款）+ 首页（宠物 tab）主视图重做成档案卡左右滑轮播（替换 2 列网格，一块离屏 canvas 顺序出图 + 签名缓存），**已真机验 + commit+push（7079d64）**。clean_tags 数据治理（ADR-019）**已执行**：dryRun 107 → 真改 cleared:107 → 复扫 matched:0（驱虫 52 / 记录体重 23 / 疫苗 9 / 到家 / 绝育各 7 / 体检 6 / 未知 3，真病程线零波及，幂等收口）。
- UI 打磨 Round 1 + 底部 tab 选中态修复（commit 84950a4）：tab 选中态原靠 custom-tab-bar 自身路由推算（uni-app 下卡默认 0、只「宠物」高亮）→ 改各 tab 页 onShow `this.$scope.getTabBar().setData`（`src/tabSync.js`）；点击命中（中央＋凸出热区 / 附件✕ / 编辑按钮 / 病程标签等）+ 视觉打磨（输入框 focus / 提醒卡类型彩条 / 卡圆角统一 / 个别硬编码色归令牌）。
- UI Round 2 已收尾（commit eef9afd + b742f84）：`.btn-primary/.btn-ghost`(+press) + 空状态 `.empty*` + health 次级按钮 `.op` 抽 App.vue 全局去重（删 ~130 行重复、各类组件单一真相源）。主动弃 canvas 色令牌化（canvas 读不了 CSS 变量）/ 间距全量归一（位移肉眼难辨），后续按需定点打磨。
- 物种扩展 A 档（ADR-023，**已 commit + push 89b5b78、待真机验**）：解除「仅猫狗」红线 → 8 类固定枚举（猫 / 狗 / 兔 / 小宠 / 鸟 / 爬宠 / 鱼 / 其他）+ other 兜底。落库开闸 = `pets/index.js` 二元钳制改枚举白名单（saveRecord/importNotion/parseRecord 同步，含修了 parseRecord/index.js + record.vue + pet.vue 几处漏网钳制）；前端抽 `src/species.js` 单一真相源（label/emoji/默认头像路径）；pet.vue 物种 chip 扩 8 + 头部头像三级降级（照片 > emoji > 物种静态图 > emoji 兜底）；parseRecord prompt 扩物种枚举 + 默认 other + 非猫狗 few-shot；petCard / 兽医小结物种显示走 species.js。**8 物种默认头像已就位（Seedream 扁平 kawaii 出图，`src/static/avatar/<species>.png`，优先级 照片 > 自选 emoji > 物种静态图 > emoji 兜底）**。
- 物种扩展 B 档 = B2 全量含养护数据（ADR-024，**已 commit + push 89b5b78、待真机验**）：用户选 B2 + **周期纯用户自定义（不内置疫苗 / 驱虫周期建议值，规避医疗红线）**。新增 `src/speciesProfile.js`（每物种 event_type / 提醒分类 / 养护参数配置表 + PARAM_META/formatParams）；**「养护」= event_type 第 8 桶**；养护参数落 `records.params`（schemaless 对象，saveRecord sanitize；爬宠 温/湿，鱼 pH/氨/亚硝酸盐/水温）；录入页物种感知（event_type/提醒分类按物种收敛 + 养护展开参数表单 + curSpecies 推导）；timeline/record-detail 渲染参数 chip + 养护配色（ev-care）。每物种深度医疗知识库仍未做（B2 之外，按需另起）。**A+B 两档：11 套测试全绿（saveRecord 加养护/params/reminder 3 例）+ build 通过 + PII 复扫空**。
- UI 打磨续 + 档案卡富化（均已 commit + push）：全局宣纸纹理底 + 过渡动画 1+2+3 + 时间线分页 / 跨年日期（b655539）；emoji 换扁平 kawaii 图标 9 透明 PNG（a3ea60a）；微交互动画三项（列表按下 / 上拉三点 / 身价 count-up）+ `.tl-item` 抽全局修 course 病程列表 mp-weixin 裸奔（484ceb2）；**档案卡富化（ADR-025，2bc83bd）= 性别 ♂♀ / 绝育 chip / 体重趋势曲线（方案 b 冗余 `pets.weight_spark`，写 / 删两侧维护 + `backfill_profile` 回填 9 宠 gender/neutered/intro）+ 卡加高 480**。教训：mp-weixin 页样式不跨页（跨页复用 class 必须进 App.vue）、动画 fill-mode both 压死 `:active` 须改 backwards、count-up 展示值须兜底防弱网 ¥0。
- 图标系统统一（ADR-026，**已 commit + push fbb3d1d、真机验过**）：装饰性 + 档案卡 emoji 全量换双档图标系 = 表达型 Fluent-emoji-flat 彩色（卡片 / 标题 / 按钮 / 空状态 / tab）+ 功能型 Phosphor-duotone 暖染珊瑚（时间线 / 病程行内 chip）；Iconify 取图 + headless Chrome 栅格透明 PNG，27 张入 `src/static/icon`；petCard.js `loadCardIcons` 预加载 + drawImage（带 emoji 兜底，陪伴用 sparkling-heart 爱心）；App.vue 加 `.ic/.ic--sm/.ic--lg` 全局类、`.tl-note` 改 inline-flex / `.btn-primary` 加 flex 居中；a3ea60a 9 张 kawaii 同名覆盖退役（原引用零改自动换图）。红线保留物种头像 / emoji / 性别 / 控件符号。两轮对抗评审 9 agent 0 must-fix + 三处可视化自验。
- 真机渲染质量对齐 HTML 镜像（ADR-028，**已 commit 21f50c1 + 待真机验**）：建 Claude Design HTML 镜像（`design-system/` 23 卡逐字镜像 App.vue 令牌 / 各页 WXSS / petCard.js，已入公开仓）当「质量标尺」反向校真机 + 46-agent 渲染审计定位「差距≈渲染非设计」→ **① canvas 导出补 dest 几何**（type=2d 默认按 CSS 逻辑尺寸导出、丢 dpr backing store，是档案卡 / 分享卡 / 兽医小结三处全糊的真根因，`index.vue`+`pet.vue×2`，见 MEMORY）② 去宣纸纹理底对齐镜像干净 ③ font-smoothing ④ 描边整数化（`2rpx→1px`）⑤ care 色 **6 处令牌化**（`--c-rt-care/-bg/-ink`，含 record-detail 2 处 latent）。复核判 chip / 表单行 / sheet__title / 重导大图为非真漂移不动（详见 design-system/DRIFT.md）。build 零错 + 10 套测试绿 + 产物核实。
- 多宠批量记录 Round 1 = 同事件 fan-out（ADR-029，**已 commit c568eac · 已部署 · 待真机验**）：真机两天实测反馈「无法同时为多只宠物记录」→ 多宠家庭高频「一起驱虫 / 疫苗 / 体检 / 换粮 / 称重」。用户「两种都要」分两轮，Round 1 同事件批量。落库 `saveRecord` 加批量分支（`record.pets=[…]` fan-out 复制 N 条，抽 `buildDoc`/`updateExistingPetWeight` 单宠批量同源，**任一不在库整批拒 PET_UNKNOWN 零写入**沿 ADR-015、批量不建档 / 不收错别字 / 不落养护 params、体重各自回写）；解析 prompt 加 `pets[]` + few-shot、main 逐只 fuzzyMatch snap（不猜、<2 清空）；前端 record.vue 正常态选宠 单选 picker → **多选 chips**（`selectedPets`+`isBatch`+`togglePet`），建档 / 错别字 / 提醒 / 药品保持单宠，选 >1 隐藏附件 + 养护输入行。**不带 pets = 原单宠路径逐字不变**。
- 多宠批量记录 Round 2 = 一句话拆多条不同记录（ADR-030，**待 commit、待真机验**）：「示例猫吐了，示例狗拉稀」拆 2 条不同内容。**只拆 record**（不混 reminder/med_stock）、拆出的都是**已有宠**（multi 不建档）、与 Round 1 `pets[]`（同事件）语义划清。解析 prompt 加【多事件拆条】+ 对比 few-shot（保守拆）、抽 `normalizeRecordFields`、main 每条 snap + 标 pet_unknown；落库抽 `writeRecordOne`（单条主路径 + multi 共用，**逐字等价重构**）+ `saveMulti`（逐条独立写、**部分成功** `{saved,count,results}`、每条守零写入、`allowCreate=false` 不建档、results 与入参严格同序同长）+ `kind=multi` 分流；前端 record.vue 加 `kind=multi` 确认区 = **N 张精简可编辑卡**（宠物单选 + 类型 + 体重 + 描述 + 删卡，稳定 `_k` key），records=1 降级单条、部分失败留失败卡重试。10 套测试全绿（saveRecord 62→89/29→32/25→31 加 multi）+ fail-first 证非假绿 + 重构先证不破 + build 零错 + **三轮评审**（pre-commit 2 agent + multi-agent workflow 8 维 ×2-skeptic ×完整性批判 29 agent，ADR-029+030 一并审）**0 must-fix**，修预提交 3 处收紧 + workflow 8 confirmed should-fix + 2 critic 漏网（双击/竞态守卫 / **派生体重回写 throw 吞掉防假失败重试重复** / multi 空 pet 服务端拒写无主 / raw 契约下发 / 非数组 INVALID）+ 补 6 例红线测试。
- 三阶段演进：v1 Cursor（已下线）→ v2 OpenClaw（未上生产）→ v3 本仓库。详见 `AIREADME/CORE`。
- 下一步：**部署 saveRecord/parseRecord 云函数（Round 2）+ 真机内测回归**（**ADR-030 多事件：「A 吐 B 拉稀」拆 2 条内容各异 / 删卡 / 部分失败留卡 / records=1 降级单条**；**ADR-029 批量：多选勾减 / AI 预选多只 / 批量落 N 条 / 批量隐附件 / 单只不回归**；录入三路 / 时间到分 / 多物种 + 养护录入 / 档案卡富化版式 ♂♀ 字形 / 体重 band / 过渡动画 / 病程视图；**ADR-028 渲染锐化：档案卡 / 分享卡 / 兽医小结变清〔dpr3 真机才显〕+ 去纹理干净度 + 描边**；图标系统 ADR-026 已真机验过）→ 加体验成员 + 发码邀友；**主粮多宠化（ADR-027，已实现 c9d1117，已部署 foods+pets + 已迁移 12 条（2026-06-19，backfill changed:12）：foods 物种默认 + 单宠覆盖 + brand/model 拆分 + 台账按物种分组 + pet.vue 当前主粮；主粮编辑弹层 tabBar 遮挡/滚动穿透真机修复）**；后续 ADR-020 Phase 2 解析评测 + pet.vue 该宠病程入口 + 提醒真推送（订阅消息）+ 语音录入；UI 按需定点打磨。见 `AIREADME/ROADMAP`。
- **本仓库已开源**（MIT · github.com/iyuenan3/petslog）：仅放架构 / 产品设计 / prompt；完整商业代码 / key / 部署配置不入库。

## 加载路由（任务 → AIREADME/）
- 跨项目了解 / 红线 → `CORE` + `RELATIONS`
- 改架构 / 选型 → `ARCHITECTURE` + `DECISIONS`
- 加功能 / 产品意图 → `PRD` + `ROADMAP` + `CONVENTIONS`
- 部署 / 运维 → `DEPLOYMENT`
- 节奏 → `ROADMAP`；踩坑 → `MEMORY`；版本史 → `CHANGELOG`

## 红线（详见 AIREADME/CORE「绝不」）
- 不碰医疗诊断 / 处方（严守工具属性）。
- **宠物口径 = 猫狗为主 + 常见宠物（A 档，ADR-023）**：猫狗保留完整医疗语义，兔 / 小宠 / 鸟 / 爬宠 / 鱼 / 其他走统一记录模型；每物种定制医疗（B 档）见 ROADMAP。原「仅猫狗」红线已由 ADR-023 解除。
- LLM key 不进前端（走云函数环境变量）。
- **LLM API Key 不入库**：ARK_API_KEY 走 config.local.js / 云函数环境变量，绝不进公开仓库。

## 维护责任（什么变 → 更新哪个）
架构·选型→ARCHITECTURE（+ DECISIONS 记理由）｜部署·入口→DEPLOYMENT｜产品方向→PRD｜接口→SPEC｜优先级→ROADMAP｜踩坑→MEMORY｜release→CHANGELOG。append-only 三件套（DECISIONS / MEMORY / CHANGELOG）只追加。

## 常用命令
```bash
npm run dev:mp-weixin   # 编译+监听 → 产物 dist/dev/mp-weixin（微信开发者工具导入此目录）
wxcloud function:upload cloudfunctions/<函数名> -e cloud1-d5g69cxtta6c18918 -n <函数名> --remoteNpmInstall
                        # 云函数部署首选（@wxcloud/cli，传源码目录、云端装依赖；登录态已配，超时/内存仍走控制台，见 AIREADME/MEMORY）
# 兜底：DevTools GUI「上传并部署:云端安装依赖」（DevTools 自带 CLI 签名失败不可用）
# LLM 机密(方舟 ARK_API_KEY)在 cloudfunctions/parseRecord/config.local.js（gitignore，不入库）
```

## 元信息
- 立项 v3：2026-06-07（AIREADME 体系铺底）。
- 历史仓库：Cursor-PetsLog（v1）/ OpenClaw-PetsLog（v2），见 AIREADME/CORE。
- 开源仓：github.com/iyuenan3/petslog（MIT · public）；架构 + 产品 + prompt 公开，完整代码私有。
