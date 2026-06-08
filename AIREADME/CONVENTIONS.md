# CONVENTIONS — PetsLog
<!-- 本项目特有约定。共享/通用基线只链过去，不抄。 -->

## 工程形态
- 前端 uni-app **CLI 工程**（Vue3 + Vite，JS 非 TS）；目标端先 mp-weixin。
- 开发循环：`npm run dev:mp-weixin` 编译 + 监听 → 产物 `dist/dev/mp-weixin/` → 微信开发者工具导入该产物目录运行。
- 云函数源码放仓库根 `cloudfunctions/`；vite 插件构建时把它拷进 mp-weixin 产物，`manifest.json` 声明 `cloudfunctionRoot`，DevTools 即识别小程序 + 云函数。
- 云函数依赖（node_modules）装在**源码** `cloudfunctions/*/`（`.gitignore` 的 `node_modules` 规则忽略，不入库），构建时随 cpSync 自动进产物，避开 vite emptyOutDir 每次清 dist 导致依赖丢失（详见 MEMORY）。新增云函数：建目录 + package.json 后从别处 `cp -R node_modules` 过去。

## 命名
- 云数据库集合：`pets` / `records` / `meds` / `reminders` / `parse_log`（均按 openid 隔离）。
- 云函数：`parseRecord`（解析）/ `saveRecord`（落库）/ `pets`·`timeline`·`meds`·`reminders`（CRUD）。

## 偏好模式
- LLM 调用收敛到单个云函数 `parseRecord`，便于换模型、限流、改 prompt。
- AI 强制 JSON：强提示词 + temperature 0 + 云函数 `extractJson` 容错解析（不用 response_format，见 DECISIONS ADR-005）；非健康 / 非药品内容返回 `valid=false`。
- 录入分流：解析输出 `kind`（record / med_stock / reminder），`saveRecord` 据此落 records / meds / reminders。
- 二次确认：解析后弹确认卡片，用户确认才落库；新宠物自动建档（卡片上可纠正猫 / 狗）。
- 幂等自建集合：`parseRecord` 入口 `db.createCollection`，集合缺失自动补，省去手动在控制台新建。

## UI / 设计令牌
- 视觉方向「温暖治愈」（珊瑚 #F2825C + 暖米 #FAF6F0），见 DECISIONS ADR-007。
- 设计令牌（色 `--c-*` / 阴影 `--sh-*` / 圆角 `--r-*` / 间距 `--sp-*` / 字号 `--fs-*`）统一挂 `App.vue` 的 `page`，各页只用 `var(--c-*)`，绝不硬编码色值，改主题只动 App.vue 一处。
- 阴影一律用暖棕投影 `rgba(196,124,86,…)`，不用黑灰（温暖调性的关键）。
- 提醒 / 时间线的类型标签用拉丁 class（med/vaccine/deworm/other），不用中文 class 名（wxss 选择器兼容性）。
- canvas（体重曲线 / 兽医图）绘制乘 `pixelRatio` 防糊；离屏画布用 `left:-9999px` 不用 `display:none`。

## 机密处理
- 网关 endpoint / token / CA 只进 `cloudfunctions/parseRecord/config.local.js`（`.gitignore` 排除 `**/config.local.*`），随云函数上传到私有云端，绝不入库、不进前端。
- 信任自签网关用 https 的 `ca` 选项，不用 `rejectUnauthorized:false`。

## 禁用模式
- 不在前端写任何 LLM 调用 / key（见 CORE 红线 + ARCHITECTURE 禁改项）。
- 不放开 AI 自由对话（严守「结构化提取机器」定位）。
- prompt 示例不夹真实宠物名（用「示例猫 / 示例狗」占位）。
