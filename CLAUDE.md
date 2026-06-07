# CLAUDE.md — PetsLog
> 多宠家庭 AI 健康记录工具（微信小程序 · 自然语言录入 → AI 结构化归档）｜ Maxwell
> 真相源 = `AIREADME/`。本文件只做 router：状态 / 路由 / 红线指针 / 维护责任 / 命令 / 元信息。

## 当前状态（2026-06-07）
- **v3 立项 pre-code**。技术栈已定：uni-app（微信小程序）+ 微信云开发（Serverless）+ 自建 OpenAI 兼容 LLM 网关。
- 三阶段演进：v1 Cursor（已下线）→ v2 OpenClaw（未上生产）→ v3 本仓库。详见 `AIREADME/CORE`。
- 下一步：MVP 内测版（录入主链路 + 5 功能）。见 `AIREADME/ROADMAP`。
- **本仓库已开源**（MIT · github.com/iyuenan3/petslog）：仅放架构 / 产品设计 / prompt；完整商业代码 / key / 部署配置不入库。

## 加载路由（任务 → AIREADME/）
- 跨项目了解 / 红线 → `CORE` + `RELATIONS`
- 改架构 / 选型 → `ARCHITECTURE` + `DECISIONS`
- 加功能 / 产品意图 → `PRD` + `ROADMAP` + `CONVENTIONS`
- 部署 / 运维 → `DEPLOYMENT`
- 节奏 → `ROADMAP`；踩坑 → `MEMORY`；版本史 → `CHANGELOG`

## 红线（详见 AIREADME/CORE「绝不」）
- 不碰医疗诊断 / 处方（严守工具属性）。
- **宠物口径仅猫狗**：产品 / 文档对外一律以猫狗为准，不纳入其它宠物类型。
- LLM key 不进前端（走云函数环境变量）。
- **私有部署坐标不入库**：LLM 网关 endpoint / 自签 CA / token 走私有配置，绝不进公开仓库。
- LLM 网关 root CA 在属主侧不可轮换，变更须联动本项目。

## 维护责任（什么变 → 更新哪个）
架构·选型→ARCHITECTURE（+ DECISIONS 记理由）｜部署·入口→DEPLOYMENT｜产品方向→PRD｜接口→SPEC｜优先级→ROADMAP｜踩坑→MEMORY｜release→CHANGELOG。append-only 三件套（DECISIONS / MEMORY / CHANGELOG）只追加。

## 常用命令
```bash
# MVP 动手后补：微信开发者工具 / 云函数部署 / 云数据库操作
```

## 元信息
- 立项 v3：2026-06-07（AIREADME 体系铺底）。
- 历史仓库：Cursor-PetsLog（v1）/ OpenClaw-PetsLog（v2），见 AIREADME/CORE。
- 开源仓：github.com/iyuenan3/petslog（MIT · public）；架构 + 产品 + prompt 公开，完整代码私有。
