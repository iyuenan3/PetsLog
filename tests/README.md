# tests — PetsLog 云函数测试

> 真相源仍是 `AIREADME/`。本文件只说明 `tests/` 怎么跑、分几层、覆盖什么、抓不到什么。

## 为什么云函数能离线测

云函数是纯 Node 逻辑，唯一外部依赖是微信的 `wx-server-sdk`（数据库 / 云存储 / `getWXContext`）和解析用的 `https`（LLM 上游）。测试用 `Module._load` 钩子把这两个换成内存实现，就能让**真实的 `index.js`** 跑完整路径并断言，不需要云环境、不需要部署。

```js
Module._load = function (request) {
  if (request === 'wx-server-sdk') return fakeCloud   // 内存 DB + getWXContext + 云存储 stub
  if (request === 'https') return fakeHttps           // mock LLM 上游
  if (request === './config.local') return {}         // 不加载真 key
  if (request === './data.json') return {}            // 安全：绝不加载含真实宠物名的 data.json
  return origLoad.apply(this, arguments)
}
```

`fakeCloud.getWXContext()` 返回一个可变的 `CUR_OPENID`，测试通过切它模拟「不同登录用户 / 攻击者」。多个云函数 `require` 进同一进程时共享同一个内存 DB，于是能把它们串成链验跨函数契约。

## 怎么跑

```bash
npm test                          # 跑全部 9 套（package.json 的 test 串起来）
node tests/isolation.e2e.test.js  # 单跑一套（迭代时更快）
```

每套自打印 `结果：N 通过 / M 失败`，有失败 `process.exit(1)`，故 `npm test` 任一套挂即整体非零退出。

## 三层

| 层 | 文件 | 形态 | 验什么 |
|---|---|---|---|
| **单函数集成** | `*.cloudfn.test.js` `parseRecord.prompt.test.js` | 一个真实云函数跑在 mock 之上 | 安全闸 / 配额 / 回滚 / 并发分支 / 字段归一 / prompt 拼装 |
| **功能契约 E2E** | `e2e.flow.test.js` | 多个真实云函数串一条链、共享一个内存 DB | 跨函数契约：parse 输出形状 ↔ save 入参 ↔ course 读取 ↔ clean_tags 治理 |
| **安全契约 E2E** | `isolation.e2e.test.js` | 多函数 + 可变 `CUR_OPENID` 模拟攻击者改包 | 家庭多租户四条隔离不变式 + 跨家庭越权 |

单函数 mock 抓不到「parse 给的字段 save 不认」这类跨边界问题，故有 E2E 层；功能 E2E 走的是「正常用户」，抓不到「攻击者伪造 family_id」，故有隔离 E2E 层。

## 各套覆盖（共 292 断言，全绿）

| 套 | 断言 | 覆盖 |
|---|---|---|
| `attachment.cloudfn.test.js` | 40 | 附件登记 / 删除 / 配额（单条 ≤9 / 家庭 ≤1GB / 日 ≤200MB）/ 服务端体积复核 / 级联清云存储 / 归属校验 / 删体重记录两侧重算 latest_weight + weight_spark（纯日期口径，ADR-018/025）|
| `importNotion.cloudfn.test.js` | 45 | 历史导入 / clear 级联 / clean_tags（非病程 tag 清空，trim）/ backfill_profile（gender·neutered 覆盖 / intro 仅填空 / weight_spark 升序 / admin 鉴权）/ resolveFamily 鉴权 |
| `foods.cloudfn.test.js` | 15 | 主粮 CRUD / current 单选互斥 / family 隔离 / IDOR |
| `saveRecord.cloudfn.test.js` | 45 | 三分支落库 / PET_UNKNOWN 零写入 / suggest / 0 宠放行 / reminder 防线 / 日期·费用·时间归一 / 物种白名单 / 养护 params 门控 + 截断 / emoji 名 / trim |
| `pets.cloudfn.test.js` | 16 | 建宠查重 / 服务端 trim / 字段类型收紧 / 物种 8 枚举白名单 / gender sanitize |
| `parseRecord.prompt.test.js` | 26 | buildMessages 物种标注（8 枚举）/ tag 候选喂入 / raw 移除 / 养护 few-shot / SYSTEM 收紧（ADR-020）|
| `timeline.cloudfn.test.js` | 23 | list_tags 全集 / course 聚合（起止·花费·体重序列）/ 跨宠不混画 / pet 下钻 / family 隔离 / 缺 tag 拒 / 分页 skip·hasMore·去重 |
| `e2e.flow.test.js` | 18 | 自然语言 → parse（raw 服务端逐字 / tag 候选 / 物种）→ save → course / list_tags → clean_tags，跨函数契约 |
| `isolation.e2e.test.js` | 64 | 家庭多租户隔离（下表 9 组）|

### isolation.e2e.test.js 的 9 组（安全契约）

攻击者 = 合法登录用户，`OPENID` 不可伪造，但 `event` 里 `family_id` / 记录 id / `record_id` / `openid` / `pet` 全可伪造。

| 组 | 场景 | 预期 |
|---|---|---|
| A | 鉴权闸：改包 `family_id` 指向别家，8 个函数 | 全 `NOT_MEMBER`，别家数据不变 |
| B | 空 `family_id` | `NO_FAMILY`（前端已挡，服务端仍拒）|
| C | IDOR：用自己家过闸但 id 指向别家文档（reminders/foods/pets/timeline/attachment 删改读）| 归属校验挡下，目标不变 |
| D | parse→save 篡改链：合法 parse 后把 save 的 `family_id` 改别家 | save 独立闸拒 `NOT_MEMBER`；落自己家成功（正向对照）|
| E | importNotion 高权：非 admin / 别家名 / 同名歧义 | `NOT_ADMIN` / `NOT_FOUND` / `AMBIGUOUS` |
| F | 角色身份混淆：成员越权管理、admin 踢自己、跨家庭踢人 | `NOT_ADMIN` / 被拒 / `NOT_MEMBER` |
| G | 邀请码加入 + 被踢后旧码失效 | `BAD_CODE`，踢后再读 `NOT_MEMBER` |
| H | 同名宠物不串档：A 家记 B 家宠物名 | `PET_UNKNOWN`，B 家宠物不被串改 |
| I | 最后一人退出即解散 + 级联只清自己家 | `dissolved`，别家毫发无损 |

四条隔离不变式与 assertMember 多副本红线见 `AIREADME/CONVENTIONS.md`「多租户隔离（红线）」。**改任一份 assertMember 必须 N 份同步 + 跑本套通过才提交。**

## mock 内存 DB 的能力与边界

支持：`where`（等值）/ `_.in` / `_.neq` / `_.inc` / `field`（no-op，不投影）/ `orderBy`（no-op）/ `skip` / `limit` / `doc().get/update/remove` / `add`（可指定 `_id`）/ `count`。

不支持（写测试时绕开）：`_.lt` / `_.gt` 等比较命令（故隔离测试的邀请码用**不限次** `max_uses:0`，跳过 family `used_count: _.lt(...)` 的原子占名额分支，该分支由 `importNotion.cloudfn` / 真机覆盖）；`orderBy` 不真排序（断言别依赖跨条顺序）；`field` 不真投影（断言别依赖被裁字段不存在）。

> 例外：`attachment.cloudfn.test.js` 的 mock 更强，已实现**真 `orderBy` 排序 + `_.gt`**（删体重记录重算 latest_weight 依赖 `orderBy('time','desc').limit(1)` 真排序，用例 13 以「删最新 → 重算到次新」直测该路径）。在该套写依赖排序 / `_.gt` 的断言是安全的。

`Date.now()` / `Math.random()` 在 `node tests/*.js` 里是真实的（仅 Workflow 脚本里被禁），故 family 的 `genCode` / `created_at` 正常工作。

## 抓不到什么（仍须真机 / DevTools 云测试）

逻辑层 mock 覆盖闸 / IDOR / 作用域 / 配额 / 字段归一，但**带鉴权的真云端 E2E 用 CLI 驱动不了**（函数被各自 `assertMember` 闸在 openid 后，合法 member openid 只存在于小程序登录态）。这些只能真机 / DevTools 云测试：

- 真实 `wx.cloud.callFunction` 鉴权链路、改包伪造 `family_id` 的真实请求行为；
- 云存储真实 `getTempFileURL` / HEAD 体积 / `deleteFile`；
- 订阅消息推送、隐私接口后台声明；
- 前端切家庭后的数据刷新 / 竞态（`ensureFamily` in-flight 去重、`callFn` 注入 active family_id）。
- **录入页 `record.vue` 的前端竞态守卫（ADR-029/030，纯 UI 逻辑无单测，verify-the-fix 评审点名）**：① 快速双击「确认归档 N 条」/「确认归档」不重复落库（`confirmSave` 顶 `if(saving)return`）；② multi/batch 提交进行中点「删除」卡不报错、不丢数据（`delRec` saving 守卫 + 失败卡 `records.slice()` 快照）；③ multi 部分失败后失败卡显「没找到这只·请重选」且不可空转重提（per-item PET_UNKNOWN 回灌 `rec.pet_unknown`）；④ 批量服务端 PET_UNKNOWN 后失效宠名 chip 被剔除、可重选不死循环（含「全家宠物被并发删空」边界 → 退空态）。

真机回归清单见 `AIREADME/DEPLOYMENT.md`。
