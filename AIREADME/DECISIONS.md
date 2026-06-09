# DECISIONS — PetsLog
<!-- ADR，append-only，只追加不改历史。运行时事故→MEMORY。 -->

## ADR-001 · v3 范式 = 保留小程序、砍掉填表式录入（非砍掉 UI / 非微信机器人+Notion）· 2026-06-07
- Problem: v3 的「自然语言录入」反思曾被简历叙事演绎成「根本不需要小程序，砍掉小程序，对接微信机器人 + Notion API」，与 4/4 落地文档（仍做小程序）冲突。开工前必须定一个。
- Constraint: 要既吸收「自然语言录入」这个 v3 灵魂，又不牺牲就医溯源展示（时间线/体重曲线/截图给兽医）与商业化（给朋友用/会员）。
- Decision: 走微信小程序 + 自然语言输入框。砍掉的是「选宠物-选日期-填表」交互，不是前端本身。
- Alternatives（否决）: 微信机器人 + Notion —— 个人微信挂机器人违反协议易封号、需常驻挂机；Notion API 海外不稳 + 无法多租户做会员；就医溯源展示弱。
- Tradeoff: 比纯机器人方案开发量大（要写完整前端 + 云函数 + 过审），但换来可展示、可商业化、合规可控。简历叙事待产品定型后微调（「砍填表」而非「砍小程序」）。

## ADR-002 · 后端用微信云开发（Serverless），不自建云服务器 · 2026-06-07
- Problem: 小程序后端形态二选一：微信云开发（免运维）vs 自建云服务器（可控）。
- Constraint: 微信小程序强制后端走 HTTPS + ICP 备案域名；开发者当前无可用备案域名（备案需 1-3 周）；希望今天就能开工。
- Decision: 用微信云开发（云函数 + 云数据库 + 云存储）。无需域名 / 备案 / SSL；自带 openid 登录态；按量计费，自用量级近免费。
- Alternatives（否决）: 自建云服务器（阿里云 sh/bj 已有机）—— 卡在备案，且要自做登录态 + 数据库运维。用户对自建无硬诉求（「微信云也可以」）。
- Tradeoff: 绑微信生态，未来扩独立 APP/Web 时云函数需改写成普通 HTTP API；但那是 6 个月后的事，不应让「可能的未来」拖累「今天开工」。

## ADR-003 · LLM 走自建 OpenAI 兼容网关，不直连厂商 API · 2026-06-07
- Problem: AI 自然语言 → JSON 结构化的 LLM 从哪调。
- Constraint: 想换模型不改小程序代码、想统一用量统计、符合既有基础设施分层；该自建网关当前对外入口为 IP 直连 + 自签证书（私有坐标不入库）。
- Decision: 云函数调自建 OpenAI 兼容网关。云函数 Node 不受小程序合法域名白名单限制，可达任意公网 IP:端口；信任网关自签 root CA（`ca` 选项 / `NODE_EXTRA_CA_CERTS`）。开工前在网关建 PetsLog 专属 token。
- Alternatives（否决）: 直连厂商 API —— 换模型要改码、用量与其它项目混、不走分层。
- Tradeoff: ① 网关成单点，挂则录入不可用（自用可接受，远期再评估 fallback 直连厂商 API）；② 多挂一个依赖约束——网关 root CA 在属主侧不可轮换/重置，变更则 PetsLog 同步中断，调整须联动本项目（见 CORE/RELATIONS）。

## ADR-004 · 开源协议选 MIT，不选非商业 / 保留所有权许可 · 2026-06-07
- Problem: 仓库开源（GitHub public），公开的是架构 / 产品 / prompt 文档而非完整商业代码，需定许可证；同时计划远期商业化（会员订阅），须想清楚开源是否削弱壁垒。
- Constraint: 既要社区可学习 / 引用 / 二次开发（作品集展示价值），又不希望许可证本身成为传播阻力。真正的商业壁垒在不入库的完整代码 + 私有部署坐标，不在文档许可。
- Decision: 用 MIT。任何人可自由使用 / 修改 / 再分发本仓公开的设计与 prompt，只需保留版权声明（Copyright 2026 Maxwell）。
- Alternatives（否决）: CC BY-NC（禁商用）、All Rights Reserved（仅展示）、Apache-2.0（含专利 / 商标条款）。对纯文档 + 展示场景，限制性许可降低传播与社区友好度；而商业壁垒本就不依赖文档许可，故不采用。
- Tradeoff: 他人可商用本仓公开的设计 / prompt；但完整商业代码、密钥、部署配置不入库，护城河不在文档侧，可接受。

## ADR-005 · AI 强制 JSON 靠强提示词 + 解析容错，不用 response_format；默认模型 auto-llm · 2026-06-07
- Problem: 怎么保证上游 LLM 稳定输出可解析的 JSON。
- Constraint: 网关默认入口 `auto-llm`（映射 doubao）实测不支持 OpenAI 的 `response_format={type:"json_object"}`，返回 400 InvalidParameter。
- Decision: 不发 response_format；用 system prompt 强约束「只输出一个 JSON 对象」+ temperature 0 + 云函数 `extractJson`（剥 markdown 围栏、截首尾大括号）容错解析。默认模型 `auto-llm`。
- Alternatives（否决）: 依赖 response_format（上游不支持）；function calling / tools（doubao 支持度不稳，MVP 不引入额外复杂度）。
- Tradeoff: 少一层协议级强约束，靠提示词 + 容错；实测 doubao 输出稳定（症状 / 疫苗 / 体重 / 药品入库 / 相对日期均正确）。未来换支持 response_format 的模型可再加一层兜底。

## ADR-006 · 用药/疫苗/驱虫提醒先做站内，微信订阅消息真推送延后 · 2026-06-08
- Problem: 提醒功能要不要一步到位做「到期微信主动推送」。
- Constraint: 微信订阅消息需申请消息模板 + 用户逐次授权（一次性订阅）+ 定时触发器云函数轮询到期项，链路重且依赖平台审核；MVP 内测期价值密度低。
- Decision: 先做站内提醒闭环：自然语言设提醒（含每周 / 每月 / 每年周期）→ reminders 集合 → 独立「提醒」tab（逾期红 / 今天橙高亮、完成自动顺延、延后、删除）+ 首页到期横幅。真推送留作后续。
- Alternatives（否决）: 一步到位接订阅消息（模板审批 + 授权率低 + 定时触发器，MVP 不值当）。
- Tradeoff: 用户需主动打开小程序才看到到期提醒（无主动 push）；换来快速闭环、零平台依赖。后续补订阅消息模板 + 定时触发器即可升级为真推送。

## ADR-007 · UI 视觉走「温暖治愈」+ CSS 自定义属性令牌系统 · 2026-06-08
- Problem: 初版 UI 是 uni-app 默认蓝（#3a7afe）+ 冷灰，朴素无品牌感；作品集展示 + 小而美商业化需要一套统一、有调性的视觉。
- Constraint: uni-app mp-weixin 的 wxss 子集，不能引外部字体 / 切图，backdrop-filter 等不可靠；要能一处改主题、全站联动。
- Decision: 视觉方向定「温暖治愈」（珊瑚 #F2825C + 暖米 #FAF6F0，圆润柔和、暖棕投影、纯 CSS + emoji）。落地用 CSS 自定义属性令牌：全部色 / 阴影 / 圆角 / 间距 / 字号挂 `App.vue` 的 `page`，各页 `var(--c-*)` 继承，改主题只改一处。设计规范由资深设计师 Agent 产出后逐页落地。
- Alternatives（否决）: 清爽健康（蓝绿科技感）、活力清新（薄荷渐变），开发者选了温暖治愈；scss 变量方案（需各组件 lang="scss"，不如 page 上 CSS 变量全局继承省事）。
- Tradeoff: 依赖微信对 CSS 自定义属性的支持（当前基础库通用无虞）；强调全靠字重 + 字号 + 颜色（无外部字体）。两处 canvas（体重曲线 / 兽医小结图）需手动按令牌色值绘制并乘 dpr 防糊。

## ADR-008 · 引入「家庭 + 用户」多租户模型，隔离键 openid → family（含安全模型转变）· 2026-06-08
- Problem: 现状每个微信用户（openid）是数据孤岛，无法支撑「多宠家庭多人协作记录」这一核心定位（家人共同维护同一批猫狗的健康档案）。
- Constraint: 一个家庭多个用户、一个用户可加入多个家庭（多对多）；家庭创建者默认管理员、可转让；微信云函数各自独立部署，不能共享 require。
- Decision（锁定）:
  - **数据归属 / 计费单位 = 家庭**：pets / records / meds / reminders 归 family，新增隔离键 `family_id`；parse 限流按 `family_id + day`；未来会员订阅以家庭为单位（成员共享日配额）。
  - **隔离键 openid → family**：原 `where({_openid})` 改为 `where({family_id})`；`_openid`（云函数 add 自动写入 = 调用者）降级为「谁记的」署名。
  - **安全模型转变（最关键）**：family_id 由客户端传入、可伪造，隔离不再天然安全。每个云函数入口必过集中守卫 `assertMember(openid, family_id)`（管理操作再加 `assertAdmin`），先校验成员资格再碰数据。守卫 ~10 行复制进每个函数（或 common 目录拷贝）。
  - **权限 = 全员共享读写**：任何成员可加 / 改 / 删家庭数据（破坏性操作二次确认）；管理员专属:改名 / 踢人 / 转让 / 删家庭 / 生成邀请码。
  - **邀请 = 邀请码**：管理员生成 6 位码（可过期 / 限次），成员输码直接加入，无审批。
  - **Onboarding 无感**：用户首次无家庭时自动建个人家庭「我的家」（他是管理员），单人体验完全保留，「家庭」概念在主动邀请前不暴露。
  - **单管理员**可转让；管理员离开前必须先转让（不留无主家庭）。
  - 数据模型新增：`families`{_id,name,owner,created_at} / `family_members`{family_id,openid,role,nickname,joined_at}（多对多真相源）/ `invites`{code,family_id,expires_at,max_uses,used_count}。当前家庭放客户端（每次带 active family_id，服务端必校验），暂不单建 users 表，成员昵称存 family_members。
  - 现有内测数据清空重来，不写迁移。
- Alternatives（否决）: 按用户计费（共享场景计费归属混乱）；按创建者归属的权限模型（每个写路径查 owner，对家庭高信任场景过重）；微信分享卡片邀请（卡片可被任意转发，先做邀请码）；写数据迁移（内测脏数据不多，清空更干净）。
- Tradeoff: ① 安全性从「openid 天然兜底」变成「应用层成员校验兜底」，任一函数漏 assertMember = 跨家庭泄露，纪律要求陡升 → 靠集中守卫 + 轮 B 末尾单人回归把关；② 成员共享家庭日配额，恶意成员可耗尽（家庭高信任可接受）；③ 改造大，触及全部 6 个现有函数 + 新 family 函数 + 前端切换 / 管理 / 邀请，分三轮（地基 → 打通隔离 → 协作 UI）推进。

## ADR-009 · 轮 C 协作 UI 收敛到「个人中心」页：补 users 集合 + 个人档案（昵称 / 微信头像）+ 用户 / 隐私协议 · 2026-06-09
- Problem: 家庭多租户后端就绪但前端无任何入口（用户「看不到家庭」）；同时小程序上架硬性要求隐私协议。
- Constraint: 微信头像走新规 `chooseAvatar` 组件 + 云存储 fileID；协议内容涉合规与工具属性红线，我非法务。
- Decision: 新增「我的」第 5 个 tab 作个人中心，聚合：个人档案（昵称 + 微信头像）、当前家庭 / 切换、家庭管理（成员 / 角色 / 邀请码 / 改名 / 转让 / 踢人 / 退出 / 创建 / 输码加入）、用户协议、隐私协议、关于。
  - 补 `users` 集合 `{_openid, nickname, avatar(云存储 fileID), created_at, updated_at}`（ADR-008 当初省的全局档案，个人中心需要它），新增 `user` 云函数（me / update，按 openid 隔离自有档案，无需 assertMember）。
  - 头像走 `<button open-type="chooseAvatar">` → `wx.cloud.uploadFile` 存云存储 → fileID 写 users.avatar。
  - 协议由我起草中文模板（覆盖工具属性 / 不做医疗诊断 / PIPL 合规 / 家庭数据共享 / 数据存微信云），文末标注「模板，上架及正式运营前需法务 / 属主终审」，放 `src/agreements.js`。
- Alternatives（否决）: 仅昵称不做头像（用户要完整档案）；占位协议骨架 / 用户自备文本（用户选我起草）；家庭管理散落各页（聚到个人中心更内聚）。
- Tradeoff: 协议为模板非法务定稿（已显式标注，上架前需终审）；多一个 users 集合 + user 函数 + 第 5 tab；头像上传依赖云存储（占额度，量小可接受）。

## ADR-010 · 底部导航重构：4 tab + 中央凸起「＋」全局录入键，自定义 tabBar，提醒/药品合并「健康」· 2026-06-09
- Problem: 底部 5 个纯文字 tab（首页/时间线/提醒/药品/我的）过多且无图标，不够清爽也无品牌感；录入入口（首页常驻输入条）与功能页组织待优化。
- Constraint: mp-weixin wxss 子集，原生 tabBar 不支持中央凸起按钮、需 PNG 切图；要保留 switchTab 语义与各 tab 的 onShow 刷新；录入是核心动作，须任意页可达；本次改动纯前端，不动云函数 / 集合。
- Decision（锁定）:
  - **4 个真 tab：宠物 / 时间线 / 健康 / 我的**（原「首页」更名「宠物」，定位为宠物档案页）。
  - **中央凸起「＋」= 全局录入键（非第 5 tab）**：珊瑚渐变圆形凸起，点击 navigateTo 独立录入页 `pages/record`，从任意 tab 可录。
  - **录入入口迁移（改签名交互）**：原「首页底部常驻自然语言输入框」下线，AI 解析 + 二次确认流程整体抽到 `pages/record`；宠物页去掉常驻输入条，变纯档案（问候 + 到期横幅 + 宠物网格），更透气、无与＋重叠。本 ADR 就此点超越早期「首页底部常驻输入框」表述，CORE / ARCHITECTURE 落地后同步 as-built。
  - **提醒 + 药品 合并为「健康」tab**：新页 `pages/health`，顶部分段控件 [提醒 | 药品]（默认提醒），两列表逻辑从原 reminders / meds 页内联迁入；原两 tab 页下线，首页到期横幅 switchTab 重指「健康」。
  - **tabBar 改自定义（as-built）**：`pages.json` 设 `tabBar.custom=true` + 4 项 list，新增 `src/custom-tab-bar/index.{js,json,wxml,wxss}`（微信原生组件四件套，非 .vue：uni-app 把 custom-tab-bar 当拷贝目标原样复制到产物根，不编译 vue，已查编译器源码确认），吃暖色令牌（`var()` 带字面量兜底，防原生组件不继承 page 令牌；选中珊瑚高亮、emoji 图标、中央凸起＋），无需 PNG 切图。选中态同步：每个 tab 页持有独立组件实例，`attached` 时按 getCurrentPages 末页路由算 selected 即恒定正确（`pageLifetimes.show` 兜底），无需事件总线 / getTabBar 代理。
- Alternatives（否决）: 3 tab（时间线下沉为分段，单页信息密度高，而时间线是就医溯源核心价值，保独立 tab）；保留原生 tabBar 仅加 PNG 线性图标（做不了凸起中键、需切图、样式受限）；＋仅作「跳回宠物页聚焦输入条」的快捷键（与输入条视觉重叠、其它 tab 录入要先跳页）；提醒 / 药品保持独立两 tab（5→4 收不动，二者同属「事务管理」可归一）。
- Tradeoff: ① 自定义 tabBar 引入选中态同步 + 真机兼容验证成本（靠每页独立实例 + getCurrentPages 路由匹配使 selected 恒定正确降风险）；② 录入多一次页面跳转（换来任意页可录 + 宠物页更干净）；③ 触及 pages.json + 新增 2 页（record / health）+ 1 组件，重指 switchTab，迁移并下线 reminders / meds 两页；④ 纯前端改动，无需重新部署云函数（仅重编译 + DevTools 预览）。

## ADR-011 · 健康记录附件功能（云存储 + 共享配额限额 + CDN 优化）· 2026-06-09
- Problem: 用户（含开发者本人 7 猫 2 狗）有大量病历 PDF / 检测报告 / 症状照片 / 发病视频需挂到健康记录；PetsLog 当前记录无附件能力，导入历史数据与日常记录都缺这块。
- Constraint: ① 微信小程序不能自由读本地文件，图片 / 视频走 `wx.chooseMedia`，PDF / 文档只能 `wx.chooseMessageFile`（从微信聊天选）；② 云开发配额按环境共享（全体用户共用），免费版云存储 5GB + CDN 下行 1GB/月，放开多用户后是全站总量；③ 病历属敏感医疗信息，须按 family 隔离。
- Decision（锁定）:
  - 附件挂「健康记录」：records 加 `attachments:[{fileID,type,name,size,uploaded_at}]` + `att_count`；支持图片 / 视频 / PDF。
  - 上传入口两处：录入二次确认卡片（A）+ 新建「记录详情页」（B，事后补 + 看导入的历史附件）。
  - 压缩 / 省流量：图片 `wx.compressImage`（长边 ≤2000 + quality 80）+ 生成缩略图，列表只下缩略图、原图点开才下；视频 chooseMedia compressed + ≤30s / ≤30MB；PDF 端侧无法压缩，仅限 ≤10MB；看过的附件本地缓存，避免重复走 CDN。
  - 限额（内测按最高会员档，从宽）：单条 ≤9 个；**家庭总存储 ≤1GB**（family 文档加 `storage_bytes` 计数器，上传 +size、删除 −size）；**速度护栏 ≤200MB/天/家庭**（复用 parseRecord 的 family_id+day 限流模式）；enforcement = 客户端上传前预检 + 云函数按云存储真实体积复核（客户端报的 size 不可信），超限删文件回滚。
  - 查看：图片 previewImage、PDF downloadFile + openDocument、视频 video 组件。
  - 清理：删记录 / 解散家庭须级联删云存储文件并回收 `storage_bytes`，扩 cascadeDeleteFamily 与记录删除路径。
  - 隔离：fileID 只在 family 内下发（同头像模型），云存储文件访问控制靠不泄露 fileID。
- Alternatives（否决）: 只在导入时塞附件不做正式功能（用户日常也要、会员化也要）；不限额（共享池下一个用户即可撑满 5GB）；按「文件数」限速（限不住存储，体积才是约束）；端侧压 PDF（无 API；云函数 rasterize 需 ghostscript，不在运行时）。
- Tradeoff: ① 引入用量计数 + 预检复核 + 级联清理的复杂度，但共享配额下必需；② PDF 压不了只能限体积、且上传要先转发到微信，体验多一步；③ 缩略图略增存储换大幅省 CDN（1GB/月 是真瓶颈），划算；④ `storage_bytes` 计数器与真实用量可能漂移（并发 / 异常），以服务端真实体积复核 + 定期校准兜底。

## ADR-012 · records 扩展字段（就诊医院 / 费用 + 病程 tag 双轴）+ parseRecord 同步抽取 + Notion 历史数据结构化导入 · 2026-06-09
- Problem: ① 开发者真实记录里有「就诊医院 / 费用」两项 PetsLog 没设计；② Notion 的「名称」是病程线（示例猫嗜酸性肉芽肿跨 2 年 50+ 条），而 PetsLog event_type 是事件类型，两个不同轴，直接归并会丢病程结构；③ 89M / 200+ 条历史档案要无损导入。
- Constraint: PetsLog event_type 固定 6 桶（症状 / 用药 / 疫苗 / 体重 / 就医 / 其它）；AI 解析走 parseRecord 强制 JSON；导入数据已结构化（CSV），无需再过 LLM。
- Decision（锁定）:
  - records 加可选字段：`hospital`（就诊医院，文本）、`cost`（费用，数字 / 元）、`tag`（病程标签，如嗜酸性肉芽肿 / 尿闭 / 软骨病）。
  - **双轴并存**：event_type（受控枚举桶，管颜色 / 分类；桶数见 ADR-013 / SPEC）+ tag（病程线，可空），既看扁平时间线又能按病程筛。病程视图先做简版（时间线按 tag 筛选），完整视图后续。
  - parseRecord 的 prompt + 输出 JSON 同步抽取 hospital / cost / tag（record 分支）；saveRecord 落这三字段；record.vue 确认卡片展示。
  - cost 解锁后续「花费统计」（本月 / 单宠累计），tag 解锁慢病管理，均为差异化。
  - **Notion 历史导入 = 直接结构化导入**（非走 AI 重解析）：一次性转换，CSV（档案 / 猫猫健康记录 / 驱虫记录）→ 清洗（日期含区间取起始、双重 URL 解码、品种→猫 / 狗、event_type 按内容映射、名称→tag、医院 / 费用 / 描述 / 体重 / 用药）→ pets / records JSON → 灌入用户家庭（family_id + 署名 openid）；附件复用 ADR-011 上传到云存储。
- Alternatives（否决）: 只留 6 桶丢病程（示例猫那条线散没，丢失用户真实用法 + 慢病差异化）；走 AI 重解析导入（数据已结构化，重解析有损 + 耗 token + 引解析错）；医院 / 费用塞 raw（后续花费统计 / 检索做不了，正式字段更值）。
- Tradeoff: ① 多 3 字段 + parseRecord 抽取 + 一个病程筛选，模型 / 前端轻度变大；② tag 是自由文本（非受控枚举），病程线靠用户 / 导入一致命名，后续可补规整；③ 导入为一次性脚本，清洗（日期区间 / 编码 / 映射）有边界，需小样本先验再全量。

## ADR-013 · 数据模型定型：pets 扩展（到家日期 / 备注 / 头像）+ event_type 增「驱虫」第 7 桶 + 驱虫建模 + foods 模块占位 · 2026-06-09
- Problem: 导入 Notion 真实数据前先把数据模型定死。现状几处缺口：pets 缺到家日期 / 备注 / 真实头像；event_type 6 桶里疫苗有、驱虫无（不对称，而驱虫量极大）；驱虫的「做了」与「该做」如何落；家庭级喂粮历史（主粮）无处放。
- Constraint: 保持 family 隔离；event_type 是受控枚举（前端配色 / 分类依赖）；pets.name 改名已有级联 records / reminders；附件 / 头像走云存储（ADR-011）。
- Decision（锁定）:
  - **pets 加 3 可选字段**：`home_date`（到家日期，陪伴时长）、`note`（备注）、`avatar`（头像照片 fileID，云存储）。EDITABLE 白名单同步加。身价不入库，「累计花费」由 records.`cost` 聚合得出。
  - **event_type 增「驱虫」成 7 桶**（症状 / 用药 / 疫苗 / 驱虫 / 体重 / 就医 / 其它），与疫苗对称（都是周期性预防）；saveRecord 校验、前端配色、parseRecord 分类同步。
  - **驱虫建模**：做了的驱虫 = 一条 record（event_type=驱虫、med=外驱 / 内驱）；该驱虫 = reminder（type=驱虫）。两者本轮**松耦合**，「做了 → 自动顺延下次提醒」留作后续。
  - **批量录入**：给全家做同一件事（驱虫 / 疫苗）支持录入时**多选宠物 → 生成 N 条 record**（UX 便利，records 仍按宠物一条，不改 schema）。
  - **foods 模块（占位，排后建）**：主粮台账是家庭级喂粮历史 `foods{family_id,name,start_date,end_date,current,note}`，不分宠；模型先定，建设排在附件 / 字段 / 导入之后。
  - meds / reminders 本轮不动。
- Alternatives（否决）: 存身价（与健康无关，累计花费可由 cost 算）；驱虫塞「其它 / 用药」（与疫苗不对称，量大值得独立桶）；批量做成 batch 实体（records 仍 per-pet 更简单，多选只是 UX 层）；主粮塞 records（它是家庭级、非 per-pet，概念不符）。
- Tradeoff: ① event_type 加桶要同步前端配色 + parse 分类 + 老数据（历史无驱虫桶，旧驱虫散在其它，导入时归位）；② pets / records 字段渐增，保持可选 + 默认空兜底；③ foods 先记不建，SPEC 标 deferred，避免范围蔓延。完整字段见 SPEC 数据字典。
