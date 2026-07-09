# PetsLog · AIREADME
> 多宠家庭 AI 健康记录工具（微信小程序 · 自然语言录入 → AI 结构化归档）｜ 生命周期: building（多物种 + 养护 + 主粮多宠化 + 多宠批量 + 药品类型 + 全仓扫描缺陷修复 · 体验版 0.4.14 待发布）
> last-synced: 5360e2c · 2026-07-09   <!-- update 靠它算 delta；INDEX 不列自己 -->

<!-- 路由器：只指路，不放实质内容。符号：✅已填 / ⚑占位 / N/A 不适用 -->

## 状态
| 文件 | 状态 | 摘要 |
|---|:--:|---|
| CORE | ✅ | 身份 / 三阶段演进 / Non-Goals / 红线（含合规 + 多物种 8 枚举口径 + LLM key 不进前端/不入库）|
| RELATIONS | ✅ | 依赖火山方舟 doubao-seed-2.0-pro 直连（OpenAI 兼容，ADR-016 已弃自建网关 + 自签 CA）|
| SPEC | ✅ | 数据字典（11 集合：字段 / 类型 / 隔离键，foods 已落地非占位）；对外 API = N/A（消费方非被集成方）|
| ARCHITECTURE | ✅ | uni-app + 微信云开发（11 函数 / 11 集合）+ 火山方舟直连 数据流（4 tab + 中央录入键）+ 设计令牌 + 禁改项 |
| DEPLOYMENT | ✅ | 已上微信云开发 cloud1-d5g69cxtta6c18918（11 云函数 + 11 集合 + 云存储），体验版 0.4.14 待发布（pets/user/reminders 已部署）|
| PRD | ✅ | MVP 5 功能 + 增强（编辑/曲线/提醒/截图/家庭/个人中心/导航重构/多物种/养护/主粮多宠化/多宠批量/药品类型）+ AI 解析字段（kind 多分流）+ 成功指标 |
| ROADMAP | ✅ | Now=多物种+养护+主粮多宠化+多宠批量+药品类型+全仓扫描缺陷修复落地（ADR-023~037）/ Next=扩成员发码+解析评测+真推送 / Later=会员·全平台·每物种深度知识库 |
| CONVENTIONS | ✅ | uni-app CLI 工程 / 命名 / 强制 JSON / config.local 机密 / 幂等建集合 / 设计令牌 / 依赖云端安装 / 隔离键显式写 / 物种枚举三处同步 |
| DECISIONS | ✅ | ADR-001~037（含 023 多物种 8 枚举 / 024 养护 / 025 档案卡富化 / 026 图标系统 / 027 主粮多宠化 / 028 渲染锐化 / 029-030 多宠批量 / 031 药品 CRUD+raw / 032 离开拦截 / 033-034 家庭同步加固 / 035 药品类型 / 036 语音改键盘听写 / 037 全仓扫描缺陷修复批次）|
| MEMORY | ✅ | 部署一串坑 + git 代理 + node_modules 随构建丢 + canvas dest 几何 + 云函数 add 不自动注入 _openid + tcb where 丢 undefined 键退化 + 真机 bug 先拉 live DB 验尺 |
| CHANGELOG | ✅ | 至体验版 0.4.14（全仓扫描缺陷修复批次：双击守卫 / multi 死循环 / 头像 fileID 越权 / 删宠级联 等 21 处）；append-only，正式 release 待上线 |

## 按任务读
- 跨项目了解 → CORE + RELATIONS
- 改架构 → ARCHITECTURE + DECISIONS
- 部署/运维 → DEPLOYMENT
- 加功能 → PRD + ROADMAP + CONVENTIONS
