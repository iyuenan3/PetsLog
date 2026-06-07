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
