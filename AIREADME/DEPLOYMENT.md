# DEPLOYMENT — PetsLog
<!-- 跑哪/怎么跑/共享什么。key→哪都不写。共享底座属本项目就写这；消费别人的只在 RELATIONS 指属主。 -->

内测部署中（2026-06-09）。后端已上微信云开发环境 `cloud1-…`（envId 非机密，存 `src/config.js`）；8 个云函数（parseRecord / saveRecord / pets / timeline / meds / reminders / family / user）+ 9 个集合（pets / records / meds / reminders / parse_log / families / family_members / invites / users）已部署，录入主链路 + 提醒 + 家庭多租户 + 个人中心真机跑通。前端走体验版，未正式上架。

## 当前部署
- **环境**：微信云开发免费环境（内测期免费；正式上线后第 15 天到期需买 ¥19.9/月 基础套餐）。
- **云函数部署首选 `@wxcloud/cli`（命令行，2026-06-10 起）**：`wxcloud function:upload cloudfunctions/<函数名> -e <envId> -n <函数名> --remoteNpmInstall`。鉴权走「CLI 密钥」（云开发控制台 → 设置 → 权限设置 生成，管理员扫码一次；`wxcloud login -a <AppID> -k <密钥>` 后长期有效），绕开 DevTools CLI 的 IDE 签名通道（后者签名失败只能 GUI，详见 MEMORY）。直接传**源码目录**（无需先重构建 dist），云端装依赖（自动忽略 node_modules），部署后轮询到 Active 才返回。兜底仍可走 DevTools GUI「上传并部署:云端安装依赖」。注意：CLI 只更新代码，**超时 / 内存等函数配置仍须控制台改**。
- 微信读各函数 package.json 在云端装 `wx-server-sdk`。构建产物**不带 node_modules**（vite 插件 cpSync filter 掉，否则数百 MB / 数万文件拖垮 DevTools 监视致不停刷新，详见 MEMORY）。
- **集合自动创建**：parseRecord 幂等 `db.createCollection`（pets / records / meds / parse_log / reminders），无需手建。
- **网关机密**：`cloudfunctions/parseRecord/config.local.js`（gitignore 排除，随云函数上传到私有云端），不入库。

## 计划形态
- **后端 = 微信云开发环境**（Serverless）：无独立主机、无服务器、无域名、无 ICP 备案、无 SSL。云函数 + 云数据库 + 云存储托管在微信生态内，按量计费（自用 + 小圈子量级预计在免费额度内）。
- **前端 = 微信小程序**：开发者工具上传 → 微信审核 → 发布。初期免费内测；收会员费需企业主体 + 个体工商户营业执照 + 微信支付（远期）。

## 域名 / 入口
- 不需要域名（云开发免备案）。这是选云开发而非自建服务器的关键原因之一（开发者当前无可用 ICP 备案域名）。→ DECISIONS ADR-002。

## 共享底座引用
- LLM 经自建的 OpenAI 兼容网关（私有基础设施）。本项目不复制其配置，只作为消费方信任其 root CA。
- **私有部署坐标（不入库）**：网关 endpoint、自签 root CA、PetsLog 专属 token 属部署机密，存私有配置 / 云函数环境变量，绝不进公开仓库。

## 备份 / 升级 / 回滚
⚑ 待定。云数据库依赖微信云开发自带能力 + 定期导出（MVP 后定方案）。

## 运维约束
- 部署前先在自建 LLM 网关建 **PetsLog 专属 token**（隔离用量统计），key 注入云函数环境变量。
- 关注 LLM 网关单点可用性：它挂则 AI 录入功能不可用（自用可接受；远期商业化再评估 fallback 直连厂商 API）。
