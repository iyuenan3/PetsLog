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

## ADR-014 · pets 加初始身价 + 简介 + 当前身价派生 + foods 主粮模块建设 + 历史导入扩展 · 2026-06-10
- Problem: 轮3 导入开发者 Notion 真实数据时，用户要求把此前 ADR-013 决定不做的几项补上：① 初始身价（导出有「初始身价 / 当前身价」，是养宠成本叙事的一部分）；② 每宠自由文本简介；③ 主粮台账（家庭级喂粮历史，导出 12 条）；④ 绝育状态（导出无独立字段，散在病史 / 备注文本里）。
- Constraint: 保持 family 隔离；pets 字段可选 + 默认空兜底；导出「当前身价」= 初始身价 + 累计花费，是 Notion 自动算的派生值；foods 是家庭级、不分宠（ADR-013 模型已定）。
- Decision（锁定，部分反转 ADR-013）:
  - **pets 加 `price_base`（初始身价，number\|null）**：反转 ADR-013「身价不入库」。**仅存初始身价**；「当前身价」不落库，前端实时派生 = `price_base + 该宠 records.cost 累计`（与 ADR-013「累计花费由 cost 算」一脉，避免静态快照随记录变动而过时）。
  - **pets 加 `intro`（简介，自由文本）**：导出的「简介」列实为指向 Notion 页的链接（无文本），故 intro 为**新建自由文本字段、导入留空**，供用户后续填写。导出的「品种常见病」（品种科普长文）非本宠真实数据，不入库。
  - **foods 模块建设**（从 ADR-013 deferred 占位转正）：新增 foods 集合 + foods 云函数（list / add / update / delete，family 隔离，assertMember）+ UI 台账（增删改查、当前主粮高亮、设新「当前」自动取消旧「当前」）。字段沿用 ADR-013：`{family_id, name, start_date, end_date, current, note}`。导入 12 条历史（日期区间 → start/end，最近一条 current=true）。
  - **绝育导入文本识别**：导出无绝育字段 → 从病史 + 备注识别「已绝育 / 绝育」关键词预填 `neutered=true`，其余 false，用户档案页可改（模型字段 neutered 已存在，不改 schema）。
- Alternatives（否决）: 初始 + 当前都静态存（当前身价是派生值，存了会随后续记录过时，违背单一真相源）；简介导入「品种常见病」（品种通用科普非本宠数据，且长）；foods 塞 records（家庭级非 per-pet，概念不符，ADR-013 已否）；绝育留全 false 手填（部分宠物病史已明示，识别预填省手工且可改）。
- Tradeoff: ① 身价 / 简介使 pets 字段继续渐增，但都可选默认空；② 当前身价派生需前端聚合该宠 records.cost（档案页已加载记录算体重曲线，顺带求和，成本低）；③ foods 是本项目第 4 个业务集合 + 第 10 个云函数，UI 加一处台账，范围可控；④ 绝育文本识别有边界（关键词漏判 / 误判），用户可手改兜底。完整字段见 SPEC 数据字典。

## ADR-015 · 录入防错别字（意图驱动建档 + 服务端模糊兜底）+ 头像 emoji 自定义 + 手动建宠入口 · 2026-06-11
- Problem: ① 自然语言录入时宠物名错别字 / 同音字会绕过「优先匹配已有宠物」的提示词，saveRecord 见名字不在库就无条件建档，产出幽灵宠物（is_new 只是「名字不在列表」的派生标志，不代表用户意图）；② 宠物头像默认固定 🐱/🐶，无法个性化区分同物种多宠；③ 建宠只能靠自然语言侧路（「新来的橘猫…」），没有显式按钮入口。
- Decision（锁定，用户已确认两处分叉）:
  - **建档凭意图不凭名字**：parse 输出加 `new_pet`（LLM 判定的显式新增意图：「新来的 / 添加宠物 / 捡到 / 新成员」类表述才 true）；`is_new` 语义改为「new_pet 且名字不在列表」（确认卡片 🆕 将建档只在此时显示）。saveRecord 只在 `new_pet=true` 时建档。
  - **错别字三层防线**：① LLM prompt 强化归一规则 + 错别字 few-shot（主力）；② parseRecord 服务端模糊匹配兜底（编辑距离 ≤1 或包含关系、按 Unicode code point 算防 emoji 名代理对误判、**唯一候选才 snap**，歧义不猜；snap 结果展示在确认卡片上，用户可见可复核）；③ 都不中且非新增意图 → parse 标 `pet_unknown`、saveRecord 拒以 `PET_UNKNOWN`（不写任何数据，附名单 + suggest），确认卡片列出家庭宠物 chips 让用户点选（用户选定方案）。**saveRecord 落库层不做静默 snap**（评审硬化：落库时名字不在库属异常态〔名单已变 / 绕过 UI〕，静默改派 = 把医疗记录写进别的宠物档案）；**reminder 通道同享防线**（提醒错别字同样 PET_UNKNOWN + 卡片选宠，否则提醒挂幽灵名永远关联不上）；**0 宠家庭首录视同新增**（无可匹配对象 = 无错别字风险，不放行则首录死端；确认卡片显示「🆕 将建档」，点确认即同意建档）。
  - **头像 emoji 自定义**：pets 加 `avatar_emoji`（自选 emoji，编辑表单 emoji 网格 + 照片上传并存）；显示优先级 **照片 > 自选 emoji > 物种默认 emoji**（用户选定方案）。
  - **手动建宠入口**：宠物网格末尾「＋ 添加宠物」卡片 → pet.vue 创建模式（`?mode=new` 复用编辑表单，pets add 落库）。
- Alternatives（否决）: 落库前总弹宠物选择器（多数输入名字正确，平添一步）；无匹配自动选最相似（歧义场景如近形名错一字会静默归错宠，医疗数据不可猜）；拼音相似度库（云函数加依赖重，编辑距离 + 包含已覆盖主案，LLM 兜同音）；头像只换默认 emoji 集不让选（不解决同物种多宠区分）。
- Tradeoff: ① 服务端两份模糊匹配函数复制（云函数目录隔离，无共享包），改动须同步两处；② 双字名编辑距离 1 容易歧义（小X 系列互距 1）→ 歧义保守交用户选，宁多点一下不归错档；③ avatar_emoji 再加一列，可选默认空。接口变更见 SPEC（parse 输出 new_pet/pet_unknown、saveRecord PET_UNKNOWN、pets.avatar_emoji）。

## ADR-016 · LLM 上游改火山方舟 Coding Plan 直连，弃自建网关中转（反转 ADR-003）· 2026-06-11
- Problem: 自建 newapi 网关是 AI 录入链路的单点（中转站故障 → 解析服务整体不可用，ADR-003 当年自认的 tradeoff ①），且其自签 root CA 是跨项目 pinned 约束（不可轮换，变更要联动），运维负担与脆弱面都大于收益。
- Decision（反转 ADR-003）: parseRecord 直连**火山方舟 Coding Plan**（OpenAI 兼容协议 `https://ark.cn-beijing.volces.com/api/coding/v3`，模型 `doubao-seed-2.0-pro`）。配置瘦身为唯一机密 `ARK_API_KEY`（config.local.js / 云函数环境变量，环境变量优先）；端点与模型是公开信息，直接进代码做默认值（`ARK_BASE_URL` / `ARK_MODEL` 可覆盖）；**删除自签 CA 信任逻辑**（方舟是公网正规证书）。方舟另有 Anthropic 兼容端点（`/api/coding`）供 coding 工具用，本项目消费 OpenAI 形状不涉及。
- Alternatives（否决）: 保留网关 + 直连做 fallback（仍要维护中转基础设施，双路径复杂度不值）；继续中转只换上游（单点不解决）。
- Tradeoff: ① 失去网关的多模型路由与统一用量统计 → Coding Plan 自带用量管理，且本项目单一上游足够，换模型改一行配置即可；② ADR-003 的「换模型不改码」收益由 ARK_MODEL 配置项保留；③ CORE / RELATIONS / DEPLOYMENT 中「自签 CA pinned 联动」约束随之作废（本次同步清理），跨项目耦合减一。

## ADR-017 · 结构化直填：确认卡片改可编辑 + 手动录入入口（不调 LLM）· 2026-06-11
- Problem: ① 录入只有「自然语言 → LLM 解析」一条路，用户想精确填一条记录（明确知道哪只宠、哪天、什么类型）也得过 LLM，慢、耗配额、离线 / 上游故障时无法录入；② 确认卡片只读，AI 解析错一个字段（如体重识别错）只能「返回修改」改原文再调一次 LLM，多一次调用 + 等待。
- Constraint: 不新增云函数 / 集合 / 字段 —— **saveRecord 已是落库校验边界**（normalizeDate / numOrNull / event_type 枚举 / weight 类型 / fuzzyMatchPet + PET_UNKNOWN 全部在落库前重新归一校验），前端拼出同形 record 直接调即可，服务端原样兜底；守 ADR-015「建档凭意图不凭名字」：录入侧不开自由建宠侧门，建新宠仍走 pet.vue `mode=new`。
- Decision（锁定，用户已确认两处分叉：① 确认卡片改可编辑〔而非单独表单页 / 最小版〕；② 语音输入留下一轮）:
  - **确认卡片全字段可编辑**（三种 kind：record / reminder / med_stock）：宠物 = picker（已有宠物名单，record 必选 / reminder 可选 / med_stock 无）、时间 / 到期 / 过期 = date picker、类型 = selector（event_type 7 桶 / rem_type 4 桶）、重复 = selector（不重复 / 每天 / 每周 / 每两周 / 每月 / 每季 / 每半年 / 每年）、体重 / 费用 / 数量 = 数字 input、用药 / 医院 / 病程 / 描述 / 药名 / 功效 / 事项 = 文本 input。**一份 UI 两用**：手动直填 + AI 结果内联改（改错字段不重调 LLM）。
  - **点＋弹出「记录」入口卡**（原拟名「记一笔」，本批统一改为「记录」；as-built，经多版线框图评审选定「A 三入口卡」）：中央＋仍 `navigateTo /pages/record`，该页入口态呈【暗背景遮罩 + 居中卡】——自然语言 textarea **居中为主入口**（记录 → parseRecord 解析），下方「或换种方式」分隔线 + 结构化 / 语音**两个次级入口**：结构化点开即建空白可编辑表单（顶部 [记录|提醒|入库] 分段切 kind，不经 parseRecord、不写 parse_log，不耗配额，直接 saveRecord，手动拉 `callFn('pets',{action:'list'})` 供 picker）；语音禁用占位（toast「敬请期待」，留下一轮）。点暗背景空白处 / ✕ → navigateBack 关闭。**关键：入口卡走普通文档流（非 `position:fixed` 浮层）**，原生 textarea 不踩同层渲染穿透坑——这也是不选「每个 tab 内置 fixed 全局浮层」的原因（微信原生 custom-tab-bar 无干净通道触发 Vue 浮层 + 原生 input 进 fixed 浮层必穿透，等于重挖刚填的坑）；「弹卡」由目标页入口态视觉实现，代价是 iOS navigateTo 为右滑入而非底部弹起（可接受）。
  - **表单整页内联，废弃底部弹层**（as-built）：结构化直填与 AI 结果确认共用同一张**整页内联表单**（替代原 `sheet-mask` 弹层）；原生 input/picker 不再放进 `position:fixed` 弹层，规避其层级穿透 / 上滑动画跳位的真机风险（文件原注释「确认弹层弹出时隐藏背景 textarea 规避层级穿透」即此问题，内联后根除）。
  - **宠物字段三态**：① is_new（AI 建档意图，名字不在库）→ 名字 input + 🆕 将建档 + 种类 chips（保留 ADR-015 唯一建档通道，可改名）；② 其余 → picker 选已有宠物（0 宠时空状态引导去宠物页建档，record 不放行）；③ 落库前 record 必须有 pet（非 is_new），reminder pet 可空（保持「提醒不一定绑宠」）。
  - **数字字段出站强制 numOrNull**：可编辑后 input 给的是字符串，confirmSave 用本地 numOrNull 把 weight / cost / med_quantity 转 number\|null 再发（否则 saveRecord 的 `typeof==='number'` 兜底会把 "4.2" 判空丢值）。
- Alternatives（否决）: 单独手动表单页（与确认卡片重复一套字段 UI，且 AI 结果仍只能返回改原文重解析，不能内联修正）；最小版只「选宠 + 选时间 + 选类型 + 体重」（医院 / 费用 / 病程 / 描述等用户真实在用的字段缺位，手动录入不完整）；手动录入侧开放自由建宠（违 ADR-015，幽灵宠物风险）；前端不转数字直接发（"4.2" 被 saveRecord 判非 number 丢失）。
- Tradeoff: ① 确认卡片从只读变全可编辑，模板控件显著变多（picker / input 三 kind 各一套），但无新后端 / schema，风险集中在前端 UI + 真机 picker 兼容；② 手动多一个入口 + kind 分段，录入页略复杂；③ 语音输入（同声传译插件 → 填文本走解析）拆下一轮单独真机验（录音模拟器测不了）。接口无变更（沿用 records / reminders / meds 既有 schema），SPEC 仅补「录入双路：LLM 解析 / 手动直填，二者在 saveRecord 汇合」一句。

## ADR-018 · records.time 精确到分 + created_at 由事件时间派生 · 2026-06-11
- Problem: 录入时间只到「日」（records.time = 'YYYY-MM-DD'，结构化表单只有 date picker），用户要求事件时间精确到分；同时主时间线按 created_at 排序，而新记录 created_at = `Date.now()`（录入时刻），补录 / 回填旧事件会错排到时间线顶。
- Constraint: 不破坏库内 217 条历史（time 纯日期、created_at = 事件日 + 12:00 noon 约定）；字典序排序（兽医小结按 time、体重图按 created_at）不能失真；前端多处按 time 切片展示（timeline `slice(5)`、体重图轴标 `slice(2,10)`、兽医小结 `slice(5)`）不能崩。
- Decision（锁定）:
  - **records.time 升为 'YYYY-MM-DD HH:mm'（精确到分）**，缺时刻则保持纯日期（旧数据 / AI 未给时刻）。`normalizeDateTime`（saveRecord + parseRecord 两处同步）保留时分或回退纯日期；日期段定长零填充使字典序仍单调。
  - **created_at 由事件时间派生**（`createdAtFromTime`，仅 record 分支）：有分用准点（`T HH:mm:00+08:00`）；仅日期用当日 **12:00**（延续历史导入约定，避免补录旧记录排到顶）；都不是回退当前时刻。`latest_weight_date` 仍存纯日期段（`slice(0,10)`），体重回写比较也用日期段。
  - **结构化表单时间 = 日期 picker + 时刻 picker（mode=time，到分）**，默认当前日期时间；AI 解析进确认卡片时 `ensureEventClock` 补当前时刻（卡片显示即落库值）。prompt 教 LLM「说了时刻（下午3点半 / 14:20）→ 输出 HH:mm，没说只输出日期」+ 1 条 few-shot。reminder 到期 / 药品过期仍只到日（非「时刻」语义）。
  - **展示零改**：timeline `slice(5)` 天然带出 'MM-DD HH:mm'，体重图轴标 `slice(2,10)` 天然停在时间前（纯日期），气泡 / 详情页显示完整到分。
- Alternatives（否决）: time 保持纯日期、另存时刻到 created_at（事件时间被拆两字段，且 created_at 语义过载「录入时刻 / 事件时刻」）；新增 event_at 时间戳字段（多一字段 + 迁移，created_at 派生已够）；缺时刻默认当前时刻而非中午（与历史导入约定不一致，且会让仅日期补录排到当日实际时刻而非稳定中午）。
- Tradeoff: ① time 字段出现两种形态（到分 / 纯日期），消费方按是否含空格 + 时分判别（切片点已验证兼容）；② created_at 不再等于「录入物理时刻」而是「事件时刻」，与历史导入语义统一（本就如此），但失去「何时录入」的审计值（现无此需求）；③ saveRecord / parseRecord 各一份 normalizeDateTime（云函数目录隔离，改动须同步两处，与既有 normalizeDate / fuzzyMatchPet 同例）。

## ADR-019 · 病程完整视图 + tag 收敛为病程线（(宠,tag) 病程模型 + 存量治理）· 2026-06-12
- Problem: ADR-012 的 tag（病程标签）落地后暴露两层问题：① 病程视图只有「时间线按 tag 筛选」的简版，受主时间线 50 条上限截断，早于第 50 条的同病程记录看不到（ADR-012 已留「完整视图后续」）；更隐蔽的是 tag chip 本身从已加载的前 50 条去重算，老病程的 chip 根本不出现，用户在时间线上无入口。② tag 是自由文本（ADR-012 tradeoff ②「后续可补规整」），真实使用 / 导入后语义过载：相当一部分 tag 不是病程线，而是与 event_type 桶重复（驱虫 / 疫苗 / 体重）、可归 event_type 就医的体检、或本有专用字段的里程碑（到家↔home_date / 绝育↔neutered）；把这些当病程线做聚合（起止 / 累计花费 / 体重曲线）会产出跨多宠混合的无意义统计。
- Constraint: 不改 schema（沿用 records.tag 自由文本 + family 隔离 + 与 event_type 双轴，ADR-012/013）；存量历史记录的原文 raw / 描述 desc / 记录本身绝不改动，治理只动 tag 字段；治理对线上库用幂等维护动作（不 clear 重导，延续 ADR-014 导入收口的幂等纪律）；病程视图守红线（猫狗 only、每入口 assertMember family 隔离、不碰诊断 / 不外露费用）。
- Decision（锁定，用户确认「先治理 tag 再上完整版」+「做轻量治理」）:
  - **tag 语义收敛为「病程线」**（细化 ADR-012 的 tag 定义、承接其 tradeoff②「后续可补规整」；不反转、schema 与双轴不变，tag 语义此后以本 ADR 为准）：tag 只表达「把同一慢病 / 疗程的多次记录串起来的主题词」（如示例猫的嗜酸性肉芽肿 / 尿闭 / 软骨病）。event_type 已表达的事件类别（驱虫 / 疫苗 / 体重）、可归「就医」桶的体检、或已有专用字段的里程碑（到家 / 绝育）不再用 tag 表达 —— 类别浏览归 event_type 轴，里程碑归各自字段，双轴真正正交。
  - **病程建模为 (宠, tag) 二元组**，不是单 tag：一条病程线 = 某只宠 + 某 tag。病程视图按 (宠,tag) 取记录，天然不跨宠混合（多宠家庭两只各自的同名病程是两条独立线）；同义碎裂在此模型下多为假象（同一宠同一病的多条记录本就同 tag），故不做批量合并，个别想改名归并由用户在视图内手动改（不批量猜医学归类）。
  - **存量 tag 轻量治理（幂等维护动作，importNotion 加 action）**：清空「非病程」tag —— 与 event_type 重复的（驱虫 / 疫苗 / 记录体重，「记录体重」是库内实际 tag 值）、可归就医的（体检）、已有专用字段的里程碑（到家 / 绝育）、无意义的（未知）；其余病程 tag 原样保留、不合并。只改 tag 字段，raw/desc/记录全留；可逆（data.json 为源，改错重跑）。
  - **防未来污染**：parseRecord prompt 加 tag 反污染规则（event_type 已表达的类别别重复写进 tag，tag 只在多次记录串成疗程时填）+ 输入喂该家庭已用病程 tag 候选（详见 ADR-020）。
  - **病程完整视图（治理后建）**：新建独立页 `/pages/course/course.vue`（**非 tabBar 页**，规避 tabBar 页 navigateTo 自跳的真机不确定性）；timeline 云函数加 `course` action，入参 (tag, family_id, pet)，assertMember 后按 (family_id, tag, pet) 一次取该病程全量（limit 放宽到远超现实病程长度的安全上限）并服务端顺手算聚合（起止日期 / 跨度 / 记录数 / 有 cost 的累计花费 / 有 weight 的体重序列）。UI = 病程概览卡 + 迷你体重趋势（**新写无交互静态 canvas，不复用 pet.vue 带拖动平移的曲线**，避免重引其物理宽白屏坑；新 canvas 仍须套 MEMORY 记的物理宽夹紧 ≤4000，防超长病程白屏）+ 竖向时间轴（沿用 timeline 卡片 + 📎 角标，点单条进 record-detail）。入口：时间线 tag chip 点进 + 宠物档案该宠病程。**chip 全集改由 timeline 云函数新增 `list_tags` action 供给**（入参 family_id，assertMember 后去重列全部 tag，不受主时间线 50 条窗口限制，修复老病程无入口的 bug；这份 distinct tag 同时喂 ADR-020 的 LLM tag 候选，一份两用）。
- Alternatives（否决）: 只做「看全」不治理 tag（聚合对半数非病程 tag 产出混宠噪声，上线即废）；做 tag 同义归并 / 字典（现状按 (宠,tag) 看无真碎裂，归并是为不存在的问题付成本，且批量猜医学归类有误并风险）；加 is_course 标记 / 独立病程字段（改 schema，(宠,tag) 模型 + 清非病程 tag 已够，YAGNI）；病程视图复用 timeline tabBar 页加参数（同页双语义状态易混 + tabBar 自跳真机不确定）；按 (tag) 不带 pet 聚合（跨宠混合）；复用兽医小结 exportVet 按病程出图（exportVet 是 MAX=10 / 按 time 排的版式，喂数十条病程是重写非复用，canvas 高度可能超限白屏，本轮不做）。
- Tradeoff: ① tag 治理是一次性幂等动作 + prompt 改，存量清空约半数噪声 tag（只动 tag，全可逆）；② 新增一页 + 一个云函数 action + 聚合计算，迷你曲线需新写静态 canvas（增量集中在拼装，不碰已踩平的拖动 canvas）；③ 累计花费仅加总有 cost 的记录（多数记录 cost 为空，概览偏低且与宠物档案「当前身价 = price_base + 该宠全部 records.cost 累计」口径范围不同 —— 病程口径更窄 = 仅该宠该 tag 下有 cost 的记录，视图内须注明「本病程已记花费」避免与身价数混淆）；④ 病程极端超 limit 仍可能截断（远超现实，若真出现再升级为游标分页，平滑演进不返工）。

## ADR-020 · LLM 解析 I/O 精准化（raw 服务端逐字落库）+ 准确率评测先行 · 2026-06-12
- Problem: 「记录」的解析准确率要冲 ≥90%，现状有两类问题：① 原文失真风险：prompt 让 LLM「raw 原话原样回填」，抽取模型可能顺手改错别字 / 吞字，raw 不再是用户字面原文（与历史导入那批 raw===desc「被消毒」同类病根）；用户明确要求原文逐字保留。② 失分点无尺可量：parseRecord 无单元 / 评测覆盖（tests 只覆盖 saveRecord 落库层），改 prompt 是绿是红全凭感觉；最难的几条（kind 三分流、tag 病程识别、pet 错别字归一）服务端救不回，只能靠 LLM I/O 调。
- Constraint: 上游火山方舟 doubao-seed-2.0-pro（不依赖 response_format，温度 0，ADR-016）；隐私红线：parse_log 现仅存 family_id/day/at 不含原文，任何「记录线上脱敏 raw 做语料」须过 ADR + 知情同意（不在本轮）；评测语料只用导入样本的结构化真值在本地演化合成 input，**评测集本体（合成 input + 真值）不入公开仓**，只有 prompt 规则 / few-shot 进仓且一律占位名（示例猫 / 示例狗、脱敏费用）；两份归一 / 模糊匹配函数 parseRecord 与 saveRecord 各持一份，改须同步（ADR-015 既有约束）。
- Decision（锁定）:
  - **raw 由服务端逐字落库，不经 LLM**：parseRecord 拿到 LLM 输出后，raw 一律覆盖为用户输入的字面值（服务端已持有 text），desc 保留 LLM 的清洗描述。原文（raw，保真 / 给审计 / 不外露）与干净描述（desc，给兽医小结）两份分立，根治原文失真，并省 LLM 回填 raw 的 token 与一处失败面。**落地动作**：parseRecord 把现状 `raw: o.raw || raw` 改为强制服务端 raw；prompt 同步删 raw 回填指令 + few-shot 输出去掉 raw 字段（坐实省 token、不再生成废弃字段）；saveRecord 侧收到的 r.raw 已是服务端覆盖值，不重复改（避免落地误改两处）。
  - **输入增强（喂 LLM 的上下文）**：今天日期 + 已有宠物名单（已有）基础上加 ① 该家庭已用过的病程 tag（治理后的 distinct，ADR-019）作候选，软约束「优先复用，确属新病程才新建」（tag 准确率最大杠杆；动态取该家庭、新家庭为空，**不喂跨家庭静态全集**以免污染 / 教 LLM 乱打 tag）；② 宠物名带物种标注（如 `示例猫(cat)`）助 species 判断与同名消歧。
  - **输出收紧（prompt 规则 + few-shot）**：tag 反污染规则（event_type 已表达的类别别重复写进 tag）；补 kind 三分流对照 few-shot（已发生→record / 买囤→med_stock / 将来→reminder，kind 服务端无救急、few-shot 是唯一可调路）；event_type 歧义例（注射疫苗→疫苗 / 打针消炎→用药）；cost 多笔相加填总额（钉口径，与「累计花费 = cost 求和」下游一致）；med 只填药名。
  - **评测先行，混合诚实 + 端到端**（验证 I/O 改动、守 ≥90% 不假绿）:
    - 语料：以导入样本的结构化真值（pet / event_type / tag / cost / weight 等人工核对过）为 ground truth，反向合成口语 input（补宠物名 / 错别字 / 相对日期 / 口语费用），产出离线评测集（含手工补的 kind 边界 + med_stock / reminder 少量样本）。
    - 判分：分两类 —— 闸门字段（kind / pet / event_type，服务端救不回、错了后果重）单独报命中率；加权字段（time / cost / tag / weight，有 normalize 兜底）按容差判等，tag 报「精确」与「在候选集」两档。**诚实标注**：导入样本的 kind 字段为空、med_stock / reminder 零样本、raw 已消毒，故 kind 维度真值不足、指标待真实样本，不据合成自评宣布 kind 达标。
    - 跑批两层：确定性层 mock 上游、只测服务端兜底（normalize / numOrNull / normalizeDateTime / fuzzyMatchPet），进 CI 守回归；LLM 层 node 脚本直连方舟跑全集（读 config.local.js 的 key，绕云函数鉴权 / 限流，温度 0 结果稳定可对比）。**eval 必须端到端跑完整后处理链**（callGateway → normalize → fuzzyMatchPet → pet_unknown），不只测 LLM 裸输出 —— pet 归一恰因有 fuzzyMatch + saveRecord 二检可端到端可信测，作首阶段重点。
  - **暂不做**：二次自纠 / 双调用（latency 4s→8s，留 eval 看缺口再定，阶段2）；线上脱敏 raw 语料（待合成集失真到不够用时另立 ADR + 知情同意）；置信度评分 / pet 拼音排序（阶段3）。温度保持 0（抽取任务确定性优先，非待调项）。
- Alternatives（否决）: 继续让 LLM 回填 raw（原文失真 + 多一处失败面）；先调 prompt 后补评测（无尺，改完无从判断，违「先有尺再下结论」）；整条 all-or-nothing 判分（太粗无法定位，desc 措辞差异污染）；喂静态历史 tag 全集（含非病程噪声 + 跨家庭污染）；eval 只测 LLM 裸输出（pet 最终正确性由后处理链决定，裸输出不代表用户所见）；硬约束 tag 改可选 chips（破自然语言录入体验）。
- Tradeoff: ① raw 服务端覆盖后，LLM 输出的 raw 字段废弃（保留兼容，落库以服务端为准）；② 输入加 tag 候选 + 物种使 prompt 略长（精选不堆量，token / 延迟轻增）；③ 评测集为合成口语，与真实用户措辞有 gap（缓解：内测真实失败例脱敏后逐步并入同一格式 —— 但须先过本 ADR Constraint 的「脱敏 raw 入语料 = ADR + 知情同意」闸门，通过后方可并入，本轮不并；并入时须冻结当时 today 以免相对日期评分逐日漂移）；④ LLM 层评测需本地方舟 key（读 gitignore 的 config.local.js，绝不硬编码、不进无密钥 CI）；⑤ 两份 normalize / normalizeDate / normalizeDateTime / fuzzyMatch 改动仍须 parseRecord / saveRecord 同步（ADR-015/018 既有）。

## ADR-021 · 宠物档案卡（可分享图片，海报风）· 2026-06-14
- Problem: 宠物详情页 pet.vue 已是完整功能档案（信息行 + 体重曲线 + 编辑），且已有「生成给兽医的小结」走离屏 canvas 出图存相册。但这两者都对内 / 对医生：详情页是滚动长页不便分享，兽医小结是临床数据朴素无情感。缺一张主人愿意对外晒的「毛孩子档案卡」，情感与社交向（发朋友圈 / 小红书，呼应 ROADMAP 推广），把一只宠物的身份浓缩成一张好看的图。
- Constraint: 守红线，猫狗 only；卡是对外分享物，绝不含费用 / 就诊医院 / 病史 / 病程 / 用药等医疗与花费信息（延续兽医小结「绝不外露 raw / 费用」纪律，但更严：连病史 chronic 也不上，纯萌宠 + 轻健康）；数据全用宠物档案现成字段 + 前端派生（年龄←birthday、陪伴天数←home_date），零新增云函数 / 集合 / 字段；canvas 守 MEMORY 的物理宽夹紧（dpr 缩放 + 尺寸 ≤4096 防真机白屏）；走温暖治愈设计令牌（珊瑚 #F2825C / 暖米 #FAF6F0）。
- Decision（锁定，用户确认「可分享图片 + 萌宠介绍 + 轻健康 + 海报风」）:
  - 形态 = 可分享图片卡（不是详情页重做、不是网格卡）：pet.vue 顶部「📋 生成给兽医的小结」旁加「🪪 生成档案卡」，点击离屏 canvas 渲染 → canvasToTempFilePath → 浮层展示（长按转发 / 保存）+ saveImageToPhotosAlbum，复用 exportVet 的整套管线（createSelectorQuery 取 node + dpr 缩放 + 重试 + 相册权限 deny→openSetting 兜底 + truncate/wrapByWidth 工具）。
  - 版式 = 竖版海报（固定 320×440 逻辑，dpr3 物理 960×1320 < 4096）：暖米珊瑚渐变背景 + 角落爪印 → 大圆头像 → 名字 → 品种·物种 → 三胶囊徽章（年龄 / 最新体重 / 陪伴 XXX 天）→ 简介引用句 → 底部水印「🐾 PetsLog · 温暖记录」。
  - 内容口径 = 萌宠介绍 + 轻健康：头像 / 名 / 物种 / 品种 / 年龄 / 最新体重 / 陪伴天数 / 简介 intro；明确排除 费用 / 医院 / 病史 / 病程 / 用药。
  - 头像照片入 canvas（兽医小结无此步，本卡新增的唯一复杂度）：pet.avatar 是 cloud:// fileID，用 `wx.cloud.downloadFile({fileID})` 直接取本地 tempFilePath（免 getTempFileURL + 免 downloadFile 域名白名单）→ `canvas.createImage` → 圆形裁剪 aspectFill drawImage。下载 / 解码任一失败回退到 自选 emoji / 物种默认 🐱🐶（与详情页头像同优先级），卡永不画崩。
  - 缺字段优雅降级：胶囊按可用项动态拼（体重未记 / 到家未填则该胶囊不出，按实际数量居中），无简介则省引用句，卡永远体面、不留「未填」字样。
- Alternatives（否决）: 详情页 pet.vue 头部直接重做成卡片观感（用户要的是可对外分享的产物，不是内部视觉打磨）；复用 exportVet 出图（那是 MAX=10 临床数据版式 + 含费用语义的近期记录，口径与对外分享相悖，是重写非复用）；卡带当前身价 / 趣味花费（间接外露累计花费，用户否决，守花费红线）；动态卡高随内容（海报固定版式留白更体面，省一处几何估算）；用 image + CSS 截图（小程序无 DOM 截图，canvas 是唯一稳路且已有管线）。
- Tradeoff: ① 新增离屏 canvas + 一组 export/render/paint/save 方法 + 一颗按钮 + 一个结果浮层，集中在 pet.vue（与 exportVet 并列，复用其工具函数）；② 头像照片异步加载引入一次 wx.cloud.downloadFile，失败回退 emoji（已兜底，最坏是卡上无照片用 emoji，不阻断出卡）；③ 卡仅萌宠 + 轻健康，主人若想晒病程 / 花费需另途径（本就不该对外，非缺陷）；④ 固定 320×440 在超长品种名 / 简介时靠 truncate + 换行夹住（与兽医小结同款工具，够用）。

## ADR-022 · 首页宠物档案卡轮播（复用 ADR-021 档案卡 + paintCard 改版 + 抽共享渲染模块）· 2026-06-15
- Problem: ADR-021 的档案卡是宠物详情页 pet.vue 里「按需点按生成 → 浮层 → 存相册」的对外分享物，藏得深、单宠才看得到。首页（宠物 tab `pages/index/index`）现状是 2 列宠物网格（小头像 + 名 + 一行 meta），信息密度低、缺情感焦点。用户要把首页主视图改成「左右滑的档案卡轮播」，一屏一宠，把已做好的档案卡直接搬上首页当门面。同时档案卡初版（ADR-021）太空旷、背景平、胶囊朴素、右下角大爪印突兀，需先做好看再上首页。
- Constraint: 守 ADR-021 全部红线（猫狗 only、对外分享物绝不含费用 / 医院 / 病史 / 病程 / 用药、零新增云函数 / 集合 / 字段、canvas 物理宽夹紧 ≤4096、温暖治愈令牌）；首页轮播的卡必须与详情页可分享的卡**逐像素同款**（WYSIWYG，所见即所分享），不能两处各画一版（否则设计漂移，违 ADR-021「一处版式」精神）；首页无浮层，但有离屏 canvas，须避免 [[reference-wechat-mp-native-overlay]] 的 canvas 穿透（放 left:-9999px、首页本无浮层故无冲突）；多宠（家庭上限 ~9）渲染 N 张卡不能每次进 tab 全量重渲（性能 / 体验）。
- Decision（锁定，用户确认「直接用档案卡 + 按推荐 A 版改好看 + 整页轮播替换网格」）:
  - **抽共享渲染模块 `src/utils/petCard.js`**（根治两处漂移）：导出 `paintPetCard(ctx, W, H, pet, avatarImg)` + `loadPetAvatar(canvas, fileID)` + `CARD_W/CARD_H` 常量。pet.vue 的 renderCard 与 index.vue 的轮播渲染都调它，paintCard / loadAvatarImage / companionDays / roundRect 从 pet.vue 迁入模块（pet.vue 保留 vet 小结仍用的 ageText / truncate / wrapByWidth）。一处改版，两处同款。
  - **paintCard 改版（A·精致留白）**：头像加暖色径向光晕 halo + 放大（r52→58）；物种行改成圆角小 chip（🐱 品种）替原灰文字；三胶囊加图标（🎂 年龄 / ⚖️ 体重 / 🏡 陪伴）+ 圆角加大；去掉突兀大爪印，换轻 ✨ + 小爪点缀（低透明散布）；简介前加装饰引号 “；竖向节奏收紧。年龄胶囊值做**自适应字号**（默认完整「2岁3个月」，measureText 超格宽则逐级降字号到下限，不用省略号 / 不截断），解决长龄溢出。
  - **首页轮播（index.vue 重做主视图，替换 2 列网格）**：保留问候 + 到期提醒横幅，其下用 `<swiper>` previous/next-margin 露邻卡（轮播图观感）+ 当前卡 active 放大、邻卡缩小变暗；每张 `<swiper-item>` 显示 `<image>`（该宠档案卡的 canvasToTempFilePath 产物）；末张 = 「＋ 添加宠物」卡（普通 view，非 canvas）；下方一排指示点。点卡 → 该宠详情页（openPet 不变）。空状态（无宠）沿用原 empty。
  - **轮播卡渲染 = 一块离屏 canvas 顺序出图 + 签名缓存**：页内单个离屏 `#petCardCanvas`（left:-9999px），onShow 取 pets 后对每只宠按签名（avatar|name|species|breed|birthday|weight|home_date|intro 拼串）判脏，仅脏 / 缺图的宠重渲：顺序 await（loadPetAvatar → paintPetCard → canvasToTempFilePath）逐张填进 `cardImgs[petId]`，未出图先占位骨架。temp 路径会话内有效，缓存进页面 data，再次进 tab 命中缓存零重渲（只新增 / 改动过的宠重画）。
- Alternatives（否决）: 首页用 live DOM view 重画一版卡（违 WYSIWYG，与 canvas 分享版双维护必漂移，用户明确「直接用那个」）；每次 onShow 全量重渲所有卡（多宠卡顿，签名缓存几乎零成本就免了）；轮播放 N 个 canvas 各自渲（原生 canvas 多实例重 + 穿透风险，改用「1 canvas 顺序出图 → N 个 image」）；档案卡仍只留详情页、首页另做卡（用户要的就是把档案卡搬上首页当门面）；改版另开 ADR-021-bis（A 版是 ADR-021 版式的视觉细化、口径 / 红线 / 管线全不变，并入本 ADR 的「改版」子项即可）。
- Tradeoff: ① 抽 petCard.js 是一次性重构，pet.vue 迁出 4 个方法、改 renderCard 两行调用（vet 小结路径不动）；② 首页首次进入要顺序渲 N 张卡（含照片头像的 wx.cloud.downloadFile），有 ~秒级铺图过程，用骨架占位缓冲，缓存后续命中即时；③ 轮播卡是 image 快照非实时 DOM，宠物字段改动后靠签名失配触发重渲（已覆盖 8 个关键字段，漏签名字段会显示旧卡到下次匹配 —— 现有字段够用，新增展示字段记得补进签名）；④ swiper 固定高按屏宽 × 440/320 派生，超窄 / 超宽屏靠比例自适应；⑤ 档案卡版式此后以本 ADR 的 A 版为准（ADR-021 的「角落爪印 / 灰文字物种行 / 无图标胶囊」描述被本 ADR 改版取代，红线与内容口径不变）。
