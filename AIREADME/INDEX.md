# PetsLog · AIREADME
> 多宠家庭 AI 健康记录工具（微信小程序 · 自然语言录入 → AI 结构化归档）｜ 生命周期: planned（v3 立项 pre-code）
> last-synced: 002f9a2 · 2026-06-07   <!-- update 靠它算 delta；INDEX 不列自己 -->

<!-- 路由器：只指路，不放实质内容。符号：✅已填 / ⚑占位 / —N/A -->

## 状态
| 文件 | 状态 | 摘要 |
|---|:--:|---|
| CORE | ✅ | 身份 / 三阶段演进 / Non-Goals / 红线（含合规 + 猫狗口径 + LLM 网关 CA 依赖）|
| RELATIONS | ✅ | 依赖自建 LLM 网关 + 其自签 root CA（不可轮换约束）|
| SPEC | — | 无对外集成接口（PetsLog 是消费方，非被集成方）；AI 解析 JSON schema → PRD/ARCHITECTURE |
| ARCHITECTURE | ✅ | uni-app + 微信云开发 + 自建 LLM 网关 数据流 + 禁改项 |
| DEPLOYMENT | ⚑ | 未部署。计划微信云开发环境（无服务器/无备案域名）|
| PRD | ✅ | MVP 5 功能 + AI 解析字段 + 防滥用 + 成功指标 |
| ROADMAP | ✅ | Now=立项骨架 / Next=MVP / Later=会员·全平台 |
| CONVENTIONS | ⚑ | 编码约定待 MVP 动手时定（uni-app + 云函数）|
| DECISIONS | ✅ | ADR-001 保留小程序砍填表 / 002 云开发非自建 / 003 LLM 走自建网关 |
| MEMORY | ⚑ | 暂无（出事后追加）|
| CHANGELOG | ⚑ | 暂无 release（首版 MVP 上线后追加）|

## 按任务读
- 跨项目了解 → CORE + RELATIONS
- 改架构 → ARCHITECTURE + DECISIONS
- 部署/运维 → DEPLOYMENT
- 加功能 → PRD + ROADMAP + CONVENTIONS
