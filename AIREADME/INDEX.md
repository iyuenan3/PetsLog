# PetsLog · AIREADME
> 多宠家庭 AI 健康记录工具（微信小程序 · 自然语言录入 → AI 结构化归档）｜ 生命周期: building（MVP 主链路打通 · 内测）
> last-synced: a897ca0 · 2026-06-07   <!-- update 靠它算 delta；INDEX 不列自己 -->

<!-- 路由器：只指路，不放实质内容。符号：✅已填 / ⚑占位 / —N/A -->

## 状态
| 文件 | 状态 | 摘要 |
|---|:--:|---|
| CORE | ✅ | 身份 / 三阶段演进 / Non-Goals / 红线（含合规 + 猫狗口径 + LLM 网关 CA 依赖）|
| RELATIONS | ✅ | 依赖自建 LLM 网关 + 其自签 root CA（不可轮换约束）|
| SPEC | — | 无对外集成接口（PetsLog 是消费方，非被集成方）；AI 解析 JSON schema → PRD/ARCHITECTURE |
| ARCHITECTURE | ✅ | uni-app + 微信云开发 + 自建 LLM 网关 数据流 + 禁改项 |
| DEPLOYMENT | ✅ | 已上微信云开发 cloud1-…（5 云函数 + 4 集合），内测部署中 |
| PRD | ✅ | MVP 5 功能 + AI 解析字段 + 防滥用 + 成功指标 |
| ROADMAP | ✅ | Now=主链路打通 / Next=内测完善 / Later=会员·全平台 |
| CONVENTIONS | ✅ | uni-app CLI 工程 / 集合命名 / 强制 JSON / config.local 机密 / 幂等建集合 |
| DECISIONS | ✅ | ADR-001 保留小程序砍填表 / 002 云开发非自建 / 003 LLM 走自建网关 / 004 开源协议 MIT / 005 强制 JSON 靠提示词 |
| MEMORY | ✅ | 云函数部署一串坑 + git push 撞坏代理（先验尺定位）|
| CHANGELOG | ⚑ | 暂无 release（首版 MVP 上线后追加）|

## 按任务读
- 跨项目了解 → CORE + RELATIONS
- 改架构 → ARCHITECTURE + DECISIONS
- 部署/运维 → DEPLOYMENT
- 加功能 → PRD + ROADMAP + CONVENTIONS
