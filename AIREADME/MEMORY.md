# MEMORY — PetsLog
<!-- 踩坑/失败/事故，append-only。别重复踩坑。决策→DECISIONS。 -->

## 微信云函数首跑一串部署坑（一次踩穿）· 2026-06-07
真机跑录入主链路时，按出现顺序踩了 4 个坑，逐一根治：
- **FUNCTION_NOT_FOUND（-501000）**：函数没部署。须在 DevTools 部署云函数。
- **CLI 部署签名失败 `getCloudAPISignedHeader ... ret 41002 system error`**：`cli cloud functions deploy` 卡在上传签名（env / functions 等只读 CLI 操作正常，仅 upload 签名被微信后端拒），重试无效。诱因之一是 cloudfunctionRoot **未在 IDE 绑定云环境**（右键「当前环境:(无)」，需先点工具栏「云开发」初始化再绑）；但绑定后 CLI 仍签名失败 → 改用 **GUI 右键「上传并部署」**（不同签名通道，可成）。结论：云函数部署走 GUI，别指望 CLI。
- **Cannot find module 'wx-server-sdk'**：用「所有文件」上传但本地没装依赖 / 「云端安装依赖」没生效。根治：在产物函数目录 `npm install`（wx-server-sdk 纯 JS 可跨平台），改「所有文件」把 node_modules 带上。
- **collection not exists（-502005）**：微信云数据库集合不随写入自动创建。根治：`parseRecord` 入口 `db.createCollection` 幂等自建 `pets/records/meds/parse_log`，从此免手建。
- 教训：微信云开发「部署 + 依赖 + 集合」三件都有坑，按上面顺序一次配齐。

## 本机 git push 撞坏代理 `HTTP2 framing / Empty reply` · 2026-06-07
- 现象：`git push` 到 GitHub 报 HTTP2 framing layer / Empty reply from server。
- 根因：会话 env 代理 `127.0.0.1:49512` 对 github CONNECT 返回 502；本机 Clash `127.0.0.1:7897` 正常（先验尺：分别 curl 经代理 / 直连 / 指定 7897）。
- 结论：本仓库 `git config http.proxy http://127.0.0.1:7897` 固化走 Clash；GitHub 是公网域名不在 no_proxy 内，须显式走能用的代理。

> 预埋提醒（已验证）：
> - 云函数调自签网关用 https `ca` 选项（PEM 文本）即可信任，无需 `rejectUnauthorized:false`（本会话实测 auto-llm 调通）。
> - 上游 `auto-llm`(doubao) 不支持 `response_format=json_object`（返回 400）→ 见 DECISIONS ADR-005。
> - v1 uniCloud 因空间没续费下线 → 关注微信云开发额度：内测期免费环境，正式上线后第 15 天到期需买 ¥19.9/月 套餐。
