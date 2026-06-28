# DEPLOYMENT · PetsLog
<!-- 跑哪/怎么跑/共享什么。key→哪都不写。共享底座属本项目就写这；消费别人的只在 RELATIONS 指属主。 -->

体验版 0.4.13 已发布（2026-06-28）。后端已上微信云开发环境 `cloud1-d5g69cxtta6c18918`（envId 非机密，存 `src/config.js`）；11 个云函数（parseRecord / saveRecord / pets / timeline / meds / reminders / family / user / attachment / foods / importNotion）+ 11 个集合（pets / records / meds / reminders / parse_log / att_log / families / family_members / invites / users / foods）+ 云存储（附件 / 头像），录入主链路 + 提醒 + 家庭多租户 + 个人中心 + 附件 + 主粮 + 养护（多物种 8 枚举 + event_type 第 8 桶）+ 多宠批量记录 + 药品类型字段真机跑通。前端走体验版，未正式上架。

## 当前部署
- **环境**：微信云开发免费环境（内测期免费；正式上线后第 15 天到期需买 ¥19.9/月 基础套餐）。
- **云函数部署首选 `@wxcloud/cli`（命令行，2026-06-10 起）**：`wxcloud function:upload cloudfunctions/<函数名> -e <envId> -n <函数名> --remoteNpmInstall`。鉴权走「CLI 密钥」（云开发控制台 → 设置 → 权限设置 生成，管理员扫码一次；`wxcloud login -a <AppID> -k <密钥>` 后长期有效），绕开 DevTools CLI 的 IDE 签名通道（后者签名失败只能 GUI，详见 MEMORY）。直接传**源码目录**（无需先重构建 dist），云端装依赖（自动忽略 node_modules），部署后轮询到 Active 才返回。兜底仍可走 DevTools GUI「上传并部署:云端安装依赖」。注意：CLI 只更新代码，**超时 / 内存等函数配置仍须控制台改**。
- 微信读各函数 package.json 在云端装 `wx-server-sdk`。构建产物**不带 node_modules**（vite 插件 cpSync filter 掉，否则数百 MB / 数万文件拖垮 DevTools 监视致不停刷新，详见 MEMORY）。
- **集合自动创建**：parseRecord 幂等 `db.createCollection`（pets / records / meds / parse_log / reminders），无需手建。
- **LLM 机密**：`cloudfunctions/parseRecord/config.local.js`（gitignore 排除，随云函数上传到私有云端），唯一机密 = `ARK_API_KEY`（火山方舟），不入库。云函数控制台环境变量同名项优先。
- **⚠️ 云存储自定义安全规则（控制台配置、不进版本库，迁环境必重设，ADR-034）**：默认「仅创建者可读写」会让家庭成员**读不到对方上传的头像**（跨用户读失败显默认）。须升付费版后（¥19.9/月，免费版改不了权限）在 **控制台 → 存储 → 权限设置 → 自定义安全规则** 贴入按路径分级规则，`avatars/`（宠物 + 成员头像）全员可读、其余（`att/` 病历附件医疗隐私）仅创建者：
  ```json
  { "read": "/^avatars\\//.test(resource.path) || resource.openid == auth.openid", "write": "resource.openid == auth.openid" }
  ```
  读规则对已有文件即时生效；云函数 admin 删旧头像 / 附件不受 write 限制。**迁新环境务必重贴此规则**，否则头像跨用户回归。

## 计划形态
- **后端 = 微信云开发环境**（Serverless）：无独立主机、无服务器、无域名、无 ICP 备案、无 SSL。云函数 + 云数据库 + 云存储托管在微信生态内，按量计费（自用 + 小圈子量级预计在免费额度内）。
- **前端 = 微信小程序**：开发者工具上传 → 微信审核 → 发布。当前走体验版（0.4.13 已发布，免提审、受体验成员名单约束）；收会员费需企业主体 + 个体工商户营业执照 + 微信支付（远期）。

## 内测发布（体验版）
内测走「体验版」：免 ICP 备案、免提审，受体验成员名单约束。正式公开（线上版）才需 ICP 备案 + 提审 + 类目资质。

**前端代码版（CLI / GUI 流程，与云函数 wxcloud 部署是两条独立链路）：**
- 出生产包：`npm run build:mp-weixin` → `dist/build/mp-weixin`（≈0.65MB，远低于 2MB 主包上限，无需分包）。
- DevTools 导入 `dist/build/mp-weixin` → 工具栏「上传」→ 填版本号 + 备注 → 进 mp.weixin.qq.com 版本管理「开发版本」。**上传只传小程序代码，不含 cloudfunctions**（云函数走 `wxcloud function:upload`，互不影响）。
- mp 后台：开发版本 → 「选为体验版」生成二维码；成员管理 → 体验成员加微信号；发二维码给内测者扫码进。

**用户隐私保护指引（上内测前必填，否则隐私接口直接 fail）：** mp 后台 → 设置 → 用户隐私保护，按下表声明（按实际代码扫描，2026-06-11）：

| 个人信息类型 | 用途 / 收集场景 | 触发接口 |
|---|---|---|
| 相册（选取的图片 / 视频） | 给健康记录挂病历照片 / 视频、设宠物头像 | `wx.chooseMedia`（attachments.js / pet.vue） |
| 摄像头 | 拍照 / 录像作病历附件或头像 | `wx.chooseMedia`（sourceType=camera） |
| 选中的文件 | 选微信聊天里的 PDF 病历作附件 | `wx.chooseMessageFile`（attachments.js） |
| 保存到相册 | 把生成的「兽医小结」图存到相册 | `wx.saveImageToPhotosAlbum`（pet.vue，scope.writePhotosAlbum） |
| 微信头像 / 昵称 | 个人中心填头像（chooseAvatar）/ 昵称 | `open-type=chooseAvatar`（profile.vue）/ `input type=nickname` |
| 微信 openid | 账号体系 + 家庭多租户隔离键 | 云开发登录态自动获取（非主动授权接口，但建议在指引中说明） |

- **语音录入（ADR-036）**：已改用键盘自带听写（系统输入法语音转文字），零后端、不申请录音 / 麦克风权限、不接同声传译插件，原「待补语音轮（`scope.record`）」项作废。
- 类目避开「医疗 / 健康（诊断）」受限类目，选「工具」类，守「不碰医疗诊断 / 处方」红线。

## 域名 / 入口
- 不需要域名（云开发免备案）。这是选云开发而非自建服务器的关键原因之一（开发者当前无可用 ICP 备案域名）。→ DECISIONS ADR-002。
- 前端只走云调用（`wx.cloud`），LLM 出网在云函数服务端（不受小程序域名白名单限制），故「合法域名 / 业务域名」基本无需配置。

## 共享底座引用
- LLM 直连火山方舟 Coding Plan（OpenAI 兼容 `https://ark.cn-beijing.volces.com/api/coding/v3`，模型 `doubao-seed-2.0-pro`，ADR-016）。端点 / 模型公开，唯一机密是 API Key。

## 备份 / 升级 / 回滚
⚑ 待定。云数据库依赖微信云开发自带能力 + 定期导出（MVP 后定方案）。`tools/wxdump` 已有 live DB 全量导出 + 备份实践（服务端 HTTP API 直连只读，删改前完整备份可恢复，详见下文「直连读 live DB / 数据维护」）。

## 运维约束
- 部署前在火山方舟控制台拿 API Key 填入 config.local.js（或云函数环境变量 ARK_API_KEY）。
- 上游可用性随方舟官方 SLA（不再有自建中转单点，ADR-016）。

## 直连读 live DB / 数据维护（只读 + 定点维护，`tools/wxdump`）
- **读库**：微信云 live DB 可经**服务端 HTTP API 直连只读**（绕过 openid/family 隔离 = admin 级读全 env），免 DevTools / 真机。机制：`GET cgi-bin/token`（AppID + AppSecret 换 access_token）→ `POST tcb/databasequery`（`{env, query:'db.collection("X").skip().limit().get()'}` 分页）。`tools/wxdump/dump.mjs` 导出 pets / records / foods 到 `out/`，供与 Notion 等源逐条核对（见 CHANGELOG 2026-06-18）。
- **凭证 / 隐私**：AppSecret 只进 `tools/wxdump/config.local.json`（**gitignore**），脚本读、绝不回显；`out/` 含真实数据亦 gitignore，均不入库。AppSecret 重置对本项目无影响（云函数走 openid 鉴权、不用它）。微信端点走直连（国内可达，Node fetch 默认不走代理；curl 须剥代理前缀）。
- **定点维护**：`tcb/databasedelete` 可按精确 `_id` 删（如 `delete_orphans.mjs` 清无 family_id 孤儿）。**红线**：删前逐条核验归属（孤儿须 family_id 为空、真数据须属本家庭）+ 完整备份可恢复 + 绝无批量 where；**永久删除由人工确认执行**。
