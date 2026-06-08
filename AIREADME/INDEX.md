# PetsLog · AIREADME
> 多宠家庭 AI 健康记录工具（微信小程序 · 自然语言录入 → AI 结构化归档）｜ 生命周期: building（MVP 主链路 + 增强 + UI 重设计 · 内测）
> last-synced: 工作区（基于 6843d77，本次 R1-3 功能 + UI 未提交）· 2026-06-08   <!-- update 靠它算 delta；INDEX 不列自己 -->

<!-- 路由器：只指路，不放实质内容。符号：✅已填 / ⚑占位 / —N/A -->

## 状态
| 文件 | 状态 | 摘要 |
|---|:--:|---|
| CORE | ✅ | 身份 / 三阶段演进 / Non-Goals / 红线（含合规 + 猫狗口径 + LLM 网关 CA 依赖）|
| RELATIONS | ✅ | 依赖自建 LLM 网关 + 其自签 root CA（不可轮换约束）|
| SPEC | — | 无对外集成接口（PetsLog 是消费方，非被集成方）；AI 解析 JSON schema → PRD/ARCHITECTURE |
| ARCHITECTURE | ✅ | uni-app + 微信云开发（6 函数 / 5 集合）+ 自建 LLM 网关 数据流 + 设计令牌 + 禁改项 |
| DEPLOYMENT | ✅ | 已上微信云开发 cloud1-…（6 云函数 + 5 集合），内测部署中 |
| PRD | ✅ | MVP 5 功能 + 增强 4（编辑/曲线/提醒/截图）+ AI 解析字段（kind 三分流）+ 成功指标 |
| ROADMAP | ✅ | Now=家庭多租户改造（ADR-008）/ Next=内测+准确率+真推送 / Later=会员·全平台 |
| CONVENTIONS | ✅ | uni-app CLI 工程 / 命名 / 强制 JSON / config.local 机密 / 幂等建集合 / 设计令牌 / 依赖随源码 |
| DECISIONS | ✅ | ADR-001~005（范式/云开发/网关/MIT/强制JSON）+ 006 提醒先站内 + 007 UI 令牌 + 008 家庭多租户/隔离键改造 |
| MEMORY | ✅ | 云函数部署一串坑 + git push 撞坏代理 + node_modules 随构建丢失 + canvas 出图注意 |
| CHANGELOG | ✅ | v0.2.0-dev（增强 + UI 重设计）；正式 release 待上线 |

## 按任务读
- 跨项目了解 → CORE + RELATIONS
- 改架构 → ARCHITECTURE + DECISIONS
- 部署/运维 → DEPLOYMENT
- 加功能 → PRD + ROADMAP + CONVENTIONS
