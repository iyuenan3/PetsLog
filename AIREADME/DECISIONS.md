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
