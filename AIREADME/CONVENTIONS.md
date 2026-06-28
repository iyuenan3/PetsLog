# CONVENTIONS · PetsLog
<!-- 本项目特有约定。共享/通用基线只链过去，不抄。 -->

## 工程形态
- 前端 uni-app **CLI 工程**（Vue3 + Vite，JS 非 TS）；目标端先 mp-weixin。
- 开发循环：`npm run dev:mp-weixin` 编译 + 监听 → 产物 `dist/dev/mp-weixin/` → 微信开发者工具导入该产物目录运行。
- 云函数源码放仓库根 `cloudfunctions/`；vite 插件构建时把它拷进 mp-weixin 产物，`manifest.json` 声明 `cloudfunctionRoot`，DevTools 即识别小程序 + 云函数。
- 云函数依赖**不拷进产物**：vite 插件 cpSync 拷 `cloudfunctions/` 时用 filter 跳过 node_modules（否则 11 函数依赖共数百 MB / 数万文件灌进 DevTools 监视的产物目录，引发不停刷新 + 拖慢构建，详见 MEMORY）。部署走 DevTools「上传并部署:**云端安装依赖**」，微信读各函数 package.json 在云端装 wx-server-sdk。新增云函数只需建目录 + package.json（列好 dependencies），无需本地装依赖。

## 命名
- 云数据库集合：`pets` / `records` / `meds` / `reminders` / `foods` / `parse_log` / `att_log` / `families` / `family_members` / `invites` / `users`（前七按 family 隔离，users 按 openid，family_* 是多租户骨架；`foods` 主粮台账见 ADR-014/027，`att_log` 附件审计日志见 ADR-011）。
- 云函数：`parseRecord`（解析）/ `saveRecord`（落库）/ `pets`·`timeline`·`meds`·`reminders`·`foods`（CRUD）/ `attachment`（附件服务端复核 + 配额 + 级联清理，ADR-011）/ `family`（家庭 CRUD + 集中 assertMember/assertAdmin 守卫）/ `user`（个人档案）/ `importNotion`（历史导入，ADR-014）。
- **隔离键须显式写**：云函数服务端 add【不会】自动注入 `_openid`（仅小程序端 SDK 会），凡按身份/家庭隔离的写入，隔离键（`family_id` 或显式 `_openid`/`openid`）必须显式落库，否则按它永远查不回。见 MEMORY。

## 多租户隔离（红线）
攻击者 = 合法登录用户，`OPENID` 由 `cloud.getWXContext()` 取（不可伪造），但 `event` 里的 `family_id` / 记录 id / `record_id` / `openid` / `pet` 等客户端入参一律不可信。四条隔离不变式，每个涉及家庭数据的 action 都须满足（审计 2026-06-14 全绿，见 `tests/isolation.e2e.test.js`）：
1. **鉴权闸前置零例外**：触库前必先 `assertMember(OPENID, familyId)`（写敏感 / 管理操作过 `assertAdmin`）；连解析、限流计数、只读列表都不放过。
2. **family_id 作用域闭合**：所有 `where` 带 `family_id`；不存在「只按 name/pet 跨家庭查」（唯二按 name 的查询 saveRecord 宠物名、attachment 重算体重都带 `family_id`）。
3. **IDOR 防护**：凡 `doc(clientId).get/update/remove`，clientId 不可信，必先取文档校验 `doc.family_id === familyId`（或 id 来自 `family_id` 受限查询）。reminders 用 `own()`、foods/attachment 用 `getOwnedRecord`、pets 内联校验、saveRecord 体重回写用 `family_id+name` 查出的 `_id`。
4. **openid 单一可信源**：身份一律取 `getWXContext` 的 `OPENID`；客户端 `event.openid` 只能当「操作对象」（removeMember/transferAdmin 的 target），绝不当身份。闸用的 `familyId` 必须与后续所有查询同一个变量（无「闸 A 查 B」短路）。

跨函数契约：`parseRecord` 从不写库，`saveRecord` 收到 parse 结果后用自己的 `event.family_id` **独立再过一次闸**并以服务端变量 stamp 每条写入，绝不取 record 里的 client 字段（攻击者篡改 save 的 family_id → `NOT_MEMBER`）。`importNotion` 不收客户端 family_id，按 `OPENID + role:'admin'` 反查家庭名（同名 `AMBIGUOUS` 拒）。

**⚠️ assertMember 是各云函数手工复制的多份副本**（family/pets/timeline/saveRecord/parseRecord/reminders/meds/foods/attachment 各一份，family 拆 `getMembership`+`assertAdmin`，importNotion 用更严的 `resolveFamily`），**非共享 lib**。当前全部语义一致，但任意一份被单独改动（去掉 `family_id` 条件、把 `throw` 改成 `return`、漏判 0 命中）都不会被编译期发现，会让该函数整体失守。**红线：改任一份 assertMember 必须 N 份同步 + 跑 `npm test`（含 `tests/isolation.e2e.test.js` 隔离回归）通过才提交。**

## 偏好模式
- LLM 调用收敛到单个云函数 `parseRecord`，便于换模型、限流、改 prompt。
- AI 强制 JSON：强提示词 + temperature 0 + 云函数 `extractJson` 容错解析（不用 response_format，见 DECISIONS ADR-005）；非健康 / 非药品内容返回 `valid=false`。
- 录入分流：解析输出 `kind`（record / med_stock / reminder），`saveRecord` 据此落 records / meds / reminders。
- 二次确认：解析后弹确认卡片，用户确认才落库；建档凭意图不凭名字（parse 层归一 + 确认卡片选宠 + saveRecord `PET_UNKNOWN` 零写入，ADR-015），物种走 8 类固定枚举（猫 / 狗 / 兔 / 小宠 / 鸟 / 爬宠 / 鱼 / 其他，other 兜底，卡片上可纠正，ADR-023）。
- 幂等自建集合：`parseRecord` 入口 `db.createCollection`，集合缺失自动补，省去手动在控制台新建。

## UI / 设计令牌
- 视觉方向「温暖治愈」（珊瑚 #F2825C + 暖米 #FAF6F0），见 DECISIONS ADR-007。
- 设计令牌（色 `--c-*` / 阴影 `--sh-*` / 圆角 `--r-*` / 间距 `--sp-*` / 字号 `--fs-*`）统一挂 `App.vue` 的 `page`，各页只用 `var(--c-*)`，绝不硬编码色值，改主题只动 App.vue 一处。
- 阴影一律用暖棕投影 `rgba(196,124,86,…)`，不用黑灰（温暖调性的关键）。
- 提醒 / 时间线的类型标签用拉丁 class（med/vaccine/deworm/care/other，care = 养护第 8 桶 ADR-024；药品 tab 另有用药 / 疫苗 / 驱虫 / 养护 / 其它类型桶复用 reminders TYPES，ADR-035），不用中文 class 名（wxss 选择器兼容性）。
- canvas（体重曲线 / 兽医图）绘制乘 `pixelRatio` 防糊；离屏画布用 `left:-9999px` 不用 `display:none`。

## 机密处理
- 火山方舟 endpoint / ARK_API_KEY 只进 `cloudfunctions/parseRecord/config.local.js`（`.gitignore` 排除 `**/config.local.*`，控制台环境变量优先），随云函数上传到私有云端，绝不入库、不进前端（ADR-016 已弃 newapi 自建网关 + 自签 root CA 直连方舟 OpenAI 兼容端，原 token / CA pinning 约束随之作废）。
- 多 key 容错：主 `ARK_API_KEY` 配额耗尽 429 自动切 `ARK_API_KEY_2` / `ARK_API_KEYS`（Coding Plan 5h 滚动配额，见 reference 记忆）。

## 禁用模式
- 不在前端写任何 LLM 调用 / key（见 CORE 红线 + ARCHITECTURE 禁改项）。
- 不放开 AI 自由对话（严守「结构化提取机器」定位）。
- prompt 示例不夹真实宠物名（用「示例猫 / 示例狗」占位）。
