# ARCHITECTURE — PetsLog
<!-- 内部结构 + 不能动什么。决策理由→DECISIONS(这里只放结论+链接)；对外契约→SPEC。 -->

## 组件 + 数据流
```
微信小程序 (uni-app 一套代码，目标端先小程序，后可扩 APP/H5)
  ├─ 首页：宠物卡片（头像/名字/年龄/最新体重）+ 底部固定自然语言输入框
  ├─ 单宠 / 全宠健康时间线（症状/用药/疫苗/体重/就医，可截图给兽医）
  ├─ 体重曲线（迭代功能）
  └─ 家庭药品库存（药名/功效/数量/过期，不绑单宠）
        │ wx.cloud.callFunction（自动带 openid，免自建登录态）
        ▼
微信云开发 (Serverless)
  ├─ 云函数：录入解析 / 时间线读写 / 药品 CRUD / 频率限制
  ├─ 云数据库（文档型）：pets / records / meds，按 openid 隔离
  └─ 云存储：宠物头像等
        │ 云函数 outbound（Node，不受小程序合法域名白名单约束）
        │ POST <自建 LLM 网关>/v1/chat/completions
        │ （OpenAI 兼容，key 存云函数环境变量，信任网关自签 root CA）
        ▼
自建 OpenAI 兼容 LLM 网关 → 上游文本模型
```
> 网关 endpoint / CA / token 属私有部署机密，不入库（见 DEPLOYMENT）。

录入主链路：用户说「花轮今天吐了，体重 4.2kg」→ 云函数组 prompt（含已有宠物名单）调 LLM 网关 → LLM 返回强制 JSON（宠物身份/时间/事件类型/用药/体重）→ 云函数落库到对应宠物时间线 → 小程序刷新。

## 关键技术选型
- **前端 uni-app**：一套代码多端，AI 最擅长生成。目标端先微信小程序。
- **后端微信云开发（非自建服务器）**：无服务器 / 无备案域名 / 自带登录态。→ DECISIONS ADR-002。
- **LLM 走自建 OpenAI 兼容网关（非直连厂商 API）**：换模型不改码 + 用量统计 + 基础设施分层。→ DECISIONS ADR-003。
- **录入 = 小程序内自然语言输入框（非微信机器人 / 非填表）**：→ DECISIONS ADR-001。

## 禁改项 / Forbidden Refactors
- **LLM key 不得移到前端**：必须留在云函数环境变量（红线，见 CORE）。
- **云函数调 LLM 网关必须信任其 root CA**（`ca` 选项 / `NODE_EXTRA_CA_CERTS`），不得为图省事长期用 `rejectUnauthorized:false`（仅 MVP 临时可），更不得把该自签 CA 当可随意替换项——属主侧为 pinned 约束。
- **数据按 openid 隔离**：不得跨用户读写（多宠 → 多用户后的隐私边界）。
- **AI 严格定位为「结构化提取机器」**：system prompt + 强制 JSON 不得放开成自由对话（防滥用 + 控成本 + 合规）。
