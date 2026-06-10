# ARCHITECTURE — PetsLog
<!-- 内部结构 + 不能动什么。决策理由→DECISIONS(这里只放结论+链接)；对外契约→SPEC。 -->

## 组件 + 数据流
```
微信小程序 (uni-app 一套代码，目标端先小程序，后可扩 APP/H5)
  底部 4 tab（自定义 tabBar）+ 中央凸起「＋」全局录入键（任意 tab 可录，ADR-010）
  ├─ 宠物（首页 tab）：宠物卡片（头像/名字/年龄/最新体重）+ 到期提醒横幅（去常驻输入条，录入走中央＋）
  ├─ 时间线：单宠 / 全宠健康流水（症状/用药/疫苗/驱虫/体重/就医，含医院/费用/病程，可按病程筛），可截图给兽医
  ├─ 健康：顶部分段 [提醒 | 药品]，提醒（到期高亮 + 横幅，真推送待订阅消息）+ 家庭药品库存（药名/功效/数量/过期，不绑单宠）
  ├─ 我的 / 个人中心：个人档案昵称头像 / 家庭管理·切换·邀请码·成员名头像（读时关联 users）/ 用户·隐私协议
  ├─ ＋ 录入页（pages/record）：自然语言 → AI 解析 → 二次确认 → 落库（独立全屏页）
  └─ 宠物档案（卡片点入）：编辑 / 删除 / 体重曲线 / 一键截图给兽医
        │ wx.cloud.callFunction（自动带 openid + 客户端注入 active family_id，免自建登录态）
        ▼
微信云开发 (Serverless)
  ├─ 云函数（9）：parseRecord 解析 / saveRecord 落库 / pets·timeline·meds·reminders CRUD / family 家庭+鉴权守卫 / user 个人档案 / attachment 附件配额+级联 / 频率限制
  ├─ 云数据库（文档型，10 集合）：pets / records / meds / reminders / parse_log / att_log / families / family_members / invites / users，按 family 隔离（users 按 openid）
  └─ 云存储：记录附件（图片 / 视频 / PDF，家庭 ≤1GB，ADR-011）+ 宠物 / 用户头像
        │ 云函数 outbound（Node，不受小程序合法域名白名单约束）
        │ POST <自建 LLM 网关>/v1/chat/completions
        │ （OpenAI 兼容，key 存云函数环境变量，信任网关自签 root CA）
        ▼
自建 OpenAI 兼容 LLM 网关 → 上游文本模型
```
> 网关 endpoint / CA / token 属私有部署机密，不入库（见 DEPLOYMENT）。

录入主链路：用户说「示例猫今天吐了，体重 4.2kg」→ 云函数组 prompt（含已有宠物名单）调 LLM 网关 → LLM 返回强制 JSON（宠物身份/时间/事件类型/用药/体重）→ 云函数落库到对应宠物时间线 → 小程序刷新。

## 关键技术选型
- **前端 uni-app**：一套代码多端，AI 最擅长生成。目标端先微信小程序。
- **后端微信云开发（非自建服务器）**：无服务器 / 无备案域名 / 自带登录态。→ DECISIONS ADR-002。
- **LLM 走自建 OpenAI 兼容网关（非直连厂商 API）**：换模型不改码 + 用量统计 + 基础设施分层。→ DECISIONS ADR-003。
- **录入 = 小程序内自然语言输入框（非微信机器人 / 非填表）**：→ DECISIONS ADR-001。
- **UI 设计令牌**：全局 CSS 自定义属性挂 `App.vue` 的 `page`，各页 `var(--c-*)` 继承，一处改主题全站联动（温暖治愈方向）。→ DECISIONS ADR-007。
- **底部导航 = 4 tab + 中央凸起「＋」全局录入键**：自定义 tabBar 用微信原生组件四件套 `src/custom-tab-bar/index.{js,json,wxml,wxss}`（uni-app 当拷贝目标，不编译 .vue；选中态各 tab 独立实例按路由算）。录入从首页常驻输入条迁到独立录入页 `pages/record`，提醒 / 药品合并「健康」分段。→ DECISIONS ADR-010。

## 禁改项 / Forbidden Refactors
- **LLM key 不得移到前端**：必须留在云函数环境变量（红线，见 CORE）。
- **云函数调 LLM 网关必须信任其 root CA**（`ca` 选项 / `NODE_EXTRA_CA_CERTS`），不得为图省事长期用 `rejectUnauthorized:false`（仅 MVP 临时可），更不得把该自签 CA 当可随意替换项，属主侧为 pinned 约束。
- **数据隔离不得绕过**：正从 openid 隔离过渡到 family 隔离（见 DECISIONS ADR-008）。家庭模型落地后，每个云函数必须入口先 `assertMember(openid, family_id)` 再读写，客户端传入的 family_id 一律不可信；不得跨家庭读写。
- **AI 严格定位为「结构化提取机器」**：system prompt + 强制 JSON 不得放开成自由对话（防滥用 + 控成本 + 合规）。
