# CHANGELOG — PetsLog
<!-- 版本史，倒序，append-only。为何→DECISIONS；未来→ROADMAP；commit 流水→git；踩坑→MEMORY。 -->

> 仍为内测开发期，未正式 release；下方按里程碑记录主要进展。

## 体验版 0.4.10 · 药品可编辑 + 删除 + 任何原话全路径落库 + 头像 1:1 裁剪 + 编辑页固定保存栏 · 2026-06-26（ADR-031，**saveRecord + meds 已部署 · 真机验过 · 体验版 0.4.10 已上传 2026-06-26**）
- Context: 真机内测反馈三处。① 药品入库后「过期 未填」改不了、名 / 数量录错也无法修正、用完 / 过期药一直堆着（药品卡是纯展示无编辑 / 删除入口）。② 用户原则:「任何原话都应记录，不只时间线」，`med_stock`/`reminder` 落库丢了 `raw`。③ 改宠物头像无法裁剪（要求强制 1:1）+ 上传后头像没变化。
- Changed（药品可编辑，ADR-031）: meds 云函数 `list/add` → 加 `update`（仅改 name/effect/quantity/expire_date，**raw 只读不动**）+ `delete`，均先 `doc(id).get()` 校 `family_id` 再写（foods 同款隔离守卫，防越权改 / 删他家药品）；name 不可清空、quantity 可 0（用完）、过期日可补可清。健康页药品卡加底部「编辑 / 删除」op 按钮（与主粮卡一致）+ 编辑弹层（复用主粮 sheet，顶部只读展示当时原话、下面字段全可改可补）。
- Changed（任何原话落库，ADR-031）: saveRecord 的 `med_stock`/`reminder` 两个 add 各补 `raw: r.raw||''`（前端 base 早带 raw、parseRecord 三类都挂 raw，**仅落库丢键**）；meds 直接 add 也补 raw。**旧库已入条无 raw**（从没存过）→ 优雅降级:编辑弹层原话行有则展示、无则灰提示「（此前版本未保存原话）」，往后新录才有。
- Fixed（宠物头像，含一段错判纠偏）: `pickAvatar` = 相册 / 拍照选图（不引用微信头像）→ `wx.cropImage({ cropScale:'1:1' })` 原生 1:1 裁剪（**真机弹裁剪框，开发者工具模拟器不显示属已知限制**，故须真机验，本版真机验过）；取消裁剪静默 / 裁剪失败降级用原图。**「上传后头像没变化」的真根因不是渲染、是用户没点保存**（保存按钮在长表单最底、够不着）→ 经 live DB 实证:`users` 多条 `chooseAvatar` 头像正常存正常显（上传 / 落库 / `cloud://` 显示链路本就 OK），而 `pets` 9 只 0 头像 = 从没保存过。修法 = 下条「编辑页固定保存栏」让保存随手可点 + `avatarLocal` 即时预览（选完立刻看到生效，不必等上传 / 保存）。中途一度误判为 `cloud://` 渲染问题、并试过 `chooseAvatar`（带微信头像建议、用户不要）均已回退。
- Added（编辑页固定保存栏）: 宠物档案编辑 / 建档的「保存 / 取消」从表单末尾 `margin-top` 改 **`position:fixed` 固定屏幕底部**（带 `env(safe-area-inset-bottom)` 安全区 + 顶部投影），随时可保存不用滚到底；仅编辑态渲染（在 `v-else` 块内），页面 `.page--editing` 留等高 `padding-bottom`，删除链接 / 末行可滚到栏上方。直接解掉「头像没变化」的根因（够不着保存）。
- 验证: 新建 `tests/meds.cloudfn.test.js`（13 例 25 断言:add 落 raw / update 全字段 / 仅补过期日 / **raw 只读不被改** / 数量 0 / 空名拒不改 / 清过期 / 越权改删拒零改动 / 非成员拒 / list 隔离升序）+ saveRecord 补 med_stock·reminder 落 raw 回归；**12 套 587 断言全绿** + build 零错。
- Review（药品 + raw + 头像 pre-commit 对抗 workflow，5 维 finder + 对抗验证 + 完整性批判，10 agent）: **0 must-fix**。收 3 should-fix + 1 nit（头像上传 in-flight 窗口同根因 + 药品数量）：① 上传中点保存存旧/空头像（showLoading 无 mask 点击穿透）→ 加 `uploadingAvatar` 标志守 save() + showLoading `mask:true`；② 上传失败丢用户原 emoji 选择 → 失败回滚 `prevEmoji`；③ 上传中取消/选 emoji 漏删云存储孤儿（pre-existing latent）→ `mask:true` 一并挡住；④ nit 清空数量静默写 0 → saveMed 数量留空则不传（对齐后端 undefined=不改）。
- 真机验过（2026-06-26）: 药品编辑 / 删除 / 补过期 + 新录原话 + 头像相册选图 → 真机弹 1:1 裁剪框 → 保存后大头像更新 + 固定保存栏好按。版本 0.4.9→**0.4.10** / versionCode 13→14。**体验版 0.4.10 已上传（2026-06-26，dist/build；commit fc3da1f + annotated tag v0.4.10 已 push origin）。**

## 体验版 0.4.9 · 成员头像兜底「家人」+ 个人资料头像→昵称串一步 + 版本号自读 · 2026-06-25
- Changed（家庭页）: 成员头像无昵称兜底字从「宠」（宠物主题占位、读着像把人叫宠物）改**统一「家人」**（角色已有 chip 标识，头像不必重复表角色）；2 字在 72rpx 圆内缩 26rpx 更从容，HTML 镜像截图自验。
- Changed（个人资料）: 微信「头像昵称填写能力」= `chooseAvatar` 按钮 + `nickname` 输入框两个独立控件（一次拿头像+昵称的 `getUserProfile` 微信 2022 已废、现返匿名数据），无法真·一次授权两者；优化为**选完头像自动聚焦昵称输入框**（弹「使用微信昵称」），把两步串成一气呵成、少点一下（`nickFocus` + 选头像后 setTimeout 聚焦，blur 复位）。
- Fixed（个人中心）: 关于页版本号原硬编码 `0.4.5` 漂移 → 改读 `wx.getAccountInfoSync().miniProgram.version`（体验版 / 正式版返真实版本，dev 退回默认），不再漂。
- 验证: build 零错 + 11 套 558 断言全绿（纯前端、核心逻辑不变）。版本 0.4.8→0.4.9 / versionCode 12→13。**待真机验**（成员头像「家人」+ 选头像后昵称自动弹键盘 + 关于页版本号正确）。

## parseRecord 多 key 容错 · 主 key 配额耗尽自动切备用 key · 2026-06-25（已加备用 ARK_API_KEY_2 + parseRecord 已部署，端到端验证 fallback 通过）
- Context: 真机内测「AI 解析失败」。直连火山方舟核实 = HTTP 429 `AccountQuotaExceeded`（Coding Plan 5 小时滚动配额耗尽）。单 key 一满，全家解析瘫痪。
- Changed: `parseRecord` 支持多 key 轮换:`ARK_API_KEY`(主) + `ARK_API_KEY_2`(备) + `ARK_API_KEYS`(逗号分隔可多把);来源优先级 环境变量 > config.local.js。`callGatewayWithFallback` 按序尝试,遇 429/401/403(keyExhausted)切下一把;超时 / 网络 / 上游 5xx 不切(切了无意义、直接抛)。全部 key 耗尽返回 `LLM_QUOTA`「AI 额度暂时用尽，请稍后再试」(区别于一般 `LLM_ERROR`,前端提示可操作)。callGateway 改收 token 参数 + 检 statusCode。
- 验证: e2e.flow 加 3 例(E2E-12 主 429→备接管 + 用 key 顺序 / E2E-13 全耗尽 LLM_QUOTA 两把都试过 / E2E-14 上游 500 不切只试主 key),11 套 552→558 断言全绿;**变异测试**(把 429 检测改 99999)证非假绿:E2E-12/13 转红 4 处、E2E-14 仍绿。**用户已加备用 `ARK_API_KEY_2`（直连方舟验 HTTP 200 有额度）+ parseRecord 已部署；强制无效主 key 跑真实 parseRecord 实证自动切备用解析成功。**

## 体验版 0.4.8 · 邀请码内联卡片展示 + 弹窗真机 bug 修复 + 有效期 7 天→30 分钟 · 2026-06-25（family 云函数已部署）
- Context: 0.4.7 已发布（多宠批量 + 后端 E2E + npm test 补全）。真机内测反馈:「生成邀请码」点击无反应 + 要求邀请码短时效 + 邀请码与提示需分行清晰展示（给了参考图）。
- Fixed（真机 bug）: 家庭页「生成邀请码」点击无任何反应的根因 = `uni.showModal` 的 `confirmText:'复制邀请码'`（5 字）超微信 4 字硬上限 → 真机 `showModal:fail` 静默不弹（DevTools 模拟器宽松，故 F2「发码邀友」待真机验路径漏检）；改 `'复制'`（2 字）。经 live DB 只读核实:每次点击均成功落库（`createInvite` 写入有效码），仅结果弹窗被抑制致用户重复点积压（实测某家庭积压 14 条）。全库 `confirmText/cancelText` 复扫，仅此一处超限（其余 ≤4 字）。
- Changed: 邀请码有效期 **7 天 → 30 分钟**（`createInvite` 的 `expires_at = Date.now() + 30*60*1000`，family 云函数）。短时效降低邀请码外泄风险；过期 join 仍拒 `EXPIRED`。
- Changed（UI，按内测参考图）: 邀请码展示从系统 `uni.showModal` 改为**家庭页内联卡片**:虚线描边码卡 + 大号分隔 6 位码 + 「YYYY-MM-DD HH:mm 过期」副行 + 点卡复制 + 「生成 / 重新生成」按钮态，码与提示分行清晰（适配珊瑚暖色主题）。`genInvite` 改写内联 state（`inviteCode/inviteExpiresAt` + `inviteExpiryText` 计算属性 + `copyInvite`，切家庭 / 重载即清码）。**顺带根治**:不再走 showModal，confirmText 等系统弹窗真机怪癖彻底绕开。HTML 镜像截图自验布局对齐参考图。
- 验证: build 零错 + 11 套 552 断言全绿（前端 UI + 后端常量、核心逻辑不变;无测试断言旧 7 天时效）；family 云函数已部署。版本 0.4.7→0.4.8 / versionCode 11→12。**待真机验**（生成→内联出码卡 + 点卡复制可用 + 30 分钟后旧码失效 + 切家庭清码）。

## 体验版 0.4.7 构建发布 · 多宠批量记录 + 后端 E2E + npm test 补全 · 2026-06-25
- Released: 打 0.4.7 体验版构建（package.json `version` + manifest `versionName` 0.4.4→0.4.7 / `versionCode` 10→11）。mp 客户端包 920K（< 2MB 体验版限），PII 复扫客户端包 0 / tracked 0 / 提交 diff 0（真名仅在 gitignore 的 importNotion/data.json·profile_backfill.json，属本地导入数据、不进客户端包也不进库）。
- Fixed: `npm test` 脚本漏挂 `e2e.journeys.test.js`（README 记 11 套、脚本实际只跑 10 套）→ 补入，11 套 552 断言一条龙全绿。
- Note: 本体验版供真机回归，头号 A0 = 真 LLM「同事件 pets[] 同内容」vs「一句话拆 multi 各异」的区分（后端 mock 不了，见 tests/E2E-realdevice.md）；过 A0 再议提审正式版。云函数 saveRecord / parseRecord / reminders 此前已部署。

## 后端全链路 E2E 套件 + reminders 养护契约漂移修复 · 2026-06-24（已 commit + push ac2964e · reminders 已部署）
- Context: 多宠批量记录两轮 + 三轮评审收口后，建【后端全链路 E2E 旅程套件】把「录入→落库→读回」端到端契约钉死（现有 e2e.flow 只 peek DB 直查、从不经 timeline read-back）。流程 = workflow(map 5 路 → architect 设计 23 场景矩阵 → implementer 写 tests/e2e.journeys.test.js 跑到绿 → 3 视角审 + 完整性批判)。
- Added: **tests/e2e.journeys.test.js（130 断言，11 套测试共 552 断言）**。在 e2e.flow harness 上扩 DB mock（真 orderBy 排序 / field 投影 / `_.gt`/`_.lt`/`_.gte` / `where` 丢 undefined 键退化对齐真 tcb / 故障注入开关）+ 挂入真实 reminders/foods/pets + strip-eval 真实 `src/foodsResolve.js`。覆盖完整用户旅程：单宠就医（parse→save→timeline list/get read-back，raw 逐字贯穿）/ 药品囤货 / 提醒全链 / 体重乱序不回退（spark==course.weights 一致，含纯日期+到分混域）/ 0 宠首录建档 / Round1 fan-out 聚合读回 / Round2 multi 部分失败 results 同序 + 幸存子条 raw / 多家庭隔离功能读回 / 主粮写读 seam（物种默认 vs 单宠覆盖）/ 改名级联 / 删宠保留病史经 timeline + 不级联 foods / 家庭解散级联 / dispatch 优先级 / parse 限流 / 体重派生失败被吞。
- Fixed（E2E 揪出的真实契约漂移）: **reminders 云函数 TYPES 缺「养护」**（`['用药','疫苗','驱虫','其它']`），养护提醒经 reminders CRUD 入口被静默降级为「其它」，而 saveRecord reminder 路径含养护（ADR-024）→ 同集合两写入口枚举不一致。补 `养护` 对齐 saveRecord（5 桶同源）。
- 验证: 11 套全绿（552 断言）；implementer 变异测试证非假绿（NO_MED 守卫 / weight_spark reverse / foods 跨物种作用域 三处变异转红）+ 我补验 reminders 养护修复变异转红 + 修评审 6 条（删去 `||true` 恒真空断言 / 补 multi 部分失败 raw read-back / matchRow undefined 键退化对齐 / 加删宠 + legacy 裸记录 + 混域 time 三旅程）；PII / 破折号清零。**reminders 已部署，待真机验。**

## 多宠批量记录 Round 2 · 一句话拆多条不同记录（解析 kind=multi + N 张可编辑确认卡 + saveRecord records[]）· 2026-06-24（ADR-030，已 commit + push ac2964e · saveRecord+parseRecord 已部署）
- Context: Round 1 只解了「同一件事多只」（pets[] fan-out 同内容）。一句话里【不同宠物各自不同的事】（「示例猫吐了，示例狗拉稀」）仍只能录一条 / 挑一只。用户「两种都要」的第二种。**只拆 record**（不混 reminder / med_stock）；拆出的记录 = **已有宠**（multi 不建档，新宠走单条）；与 Round 1 `pets[]`（同事件）语义划清（不同事件才 multi）。
- Added（解析层）: prompt 加【多事件拆条】规则 + 一条「示例猫吐了示例狗拉稀」→ kind=multi few-shot（与「都驱虫」→ pets[] 对比，教 LLM 区分）；保守拆。`parseRecord` 抽 `normalizeRecordFields` 单条 / multi 子条共用；normalize 加 multi 分支（kind=multi → records[]，丢全空子条）；main 对每条 snap pet + 标 pet_unknown（不猜不建档）。
- Added（落库层）: `saveRecord` 抽 `writeRecordOne`（单条 record 验名 + buildDoc + add + 体重 / 建档，单条主路径 + multi 共用，防漂移）；main 重排成 med_stock → reminder（内联验名）→ record（writeRecordOne）。加 `saveMulti`（records[] 逐条独立写、**部分成功可报** `{ok,saved,count,results}`、每条守 PET_UNKNOWN 零写入、`allowCreate=false` multi 不建档、results 与入参**严格同序同长**保前端留卡 index 不错位）。`kind=multi` 分流。
- Added（前端）: record.vue 加 `kind=multi` 确认区 = **N 张精简可编辑卡**（每卡 宠物单选 chips + 类型 picker + 体重 + 描述 + 删卡，稳定 `_k` key）；parse 时 records≥2 走 multi、=1 降级单条编辑器、=0 提示无效；提交一次写全部、**部分失败留失败卡重试**、toast「已归档 N 条」。multi 不挂附件 / 不做养护。
- 验证: 10 套测试全绿（saveRecord 62→93 / parseRecord.prompt 29→32 / e2e.flow 25→34）；**fail-first 证非假绿**（含变异测试:re-throw 验 critic#1 测试变红、空 pet 改回旧逻辑验 E2E-11 变红）；**重构 writeRecordOne 单条主路径逐字等价**（先证不破）；build 零错 + 产物核实（云函数与 src 字节一致）。
- Review（**multi-agent workflow**，8 维 finder × 2-skeptic 对抗核验 × 完整性批判，29 agent / 1.9M tokens，ADR-029+030 一并审）: **0 must-fix**；确认 8 条 should-fix + 2 critic 漏网，全部修复（carried 15 条 nice 多为 N+1/perf busywork 跳过）：① 双击 / delRec 竞态守卫（`if(saving)return` + 失败卡 records 快照 + 批量 PET_UNKNOWN 剔幽灵名防死循环）② **派生体重回写 throw 吞掉**（critic#1：record 已 add 后体重 update 失败会让 saveMulti 误报 WRITE_FAIL → 前端留卡重试 = 重复记录，根因修）③ multi 空 pet 子条服务端拒写「无主」记录（allowCreate 边界）④ multi 子条 raw 契约层下发（ADR-020 不靠前端代偿）⑤ multi 非数组 → INVALID 不穿透。补 6 例红线 / 边界测试（旧体重不回退 batch+multi / 批量近似名绝不 snap / multi 空 pet 拒 / 非数组 / 单子条 / 隔离 NOT_MEMBER）。
- Review 2（**verify-the-fix workflow**，10 修复逐个 auditor + 4 路新角度 + 完整性批判，35 agent / 2.2M tokens）: **10 个修复全 verdict=solid**（探针实证守卫不锁死 / 吞异常没吞真错误 / 无回归）；去重后 5 条 should-fix 同源延伸全修：① **critic#1 吞异常修复无测试**（变异测试剥 try/catch 后 89 仍全绿=假绿盲区）→ 补 harness `THROW_PET_UPDATE` 开关 + 回归用例（派生回写 throw 时 record 仍落、不报 WRITE_FAIL）② **multi 部分失败不回灌 PET_UNKNOWN → 失败卡空转死循环**（批量 critic#2 修了、multi 同洞没修）→ per-item code 回灌 `rec.pet_unknown` + saveMulti 回传 pets 刷新名单 + 卡显「请重选」③ 批量全家删空时 `r.pets=[]` 致 critic#2 失效 → `petOptions=r.pets||[]` 无条件刷新 ④ 批量 filter 后 `parsed.pet` mirror 残留 → 同步首只 ⑤ parse 空 pet→pet_unknown 无测试 → 补 e2e E2E-11 + 4 个前端竞态守卫登记进 tests/README 真机清单。**待真机验**（「A 吐 B 拉稀」拆 2 条内容各异 / 删卡 / 部分失败留卡显「请重选」/ 双击不翻倍 / 单条 + Round 1 批量不回归）。

## 多宠批量记录 Round 1 · 同事件 fan-out（多选 + saveRecord pets[] 复制 N 条）· 2026-06-24（ADR-029，已 commit c568eac · 已部署 saveRecord+parseRecord）
- Context: 真机用了两天的实测反馈「无法同时为多只宠物记录」。多宠家庭日常高频「一起驱虫 / 疫苗 / 体检 / 统一换粮 / 集体称重」，但录入链路三层全单宠（parse 抽一个对象 + record.vue 单选 picker + saveRecord 写一条）。用户「两种都要」→ 分两轮：Round 1 同事件批量（覆盖 80% 多宠日常），Round 2 另起一句话拆多条不同记录。
- Added（落库层）: `saveRecord` 加批量分支：`record.pets=[…]` → fan-out 复制 N 条同内容。抽 `buildDoc` + `updateExistingPetWeight` 两 helper、单宠 / 批量同源（防 doc 形状 / 养护门控 / created_at 漂移）。**任一宠物不在库整批拒 PET_UNKNOWN、零写入**（沿 ADR-015）；批量不建档、不收错别字、不落养护 params；体重 / weight_spark 各自回写；返回 `{ok,ids,count}`。**不带 pets = 原单宠路径逐字不变**。
- Added（解析层）: prompt 加 `pets:string[]` 字段说明 + 一条「给示例猫和示例狗都驱虫」few-shot；`parseRecord` normalize 收 pets、main 对每只 fuzzyMatch snap 到已有名（不猜不建档）、snap 后 <2 视作单宠清空。
- Added（前端）: record.vue 正常态选宠 单选 picker → **多选 chips**（`selectedPets` 单一真相 + `isBatch` computed + `togglePet`/`initSelectedPets`，species 跟随首只）；建档 / 错别字 / 提醒 / 药品 保持单宠不变；选 >1 只隐藏附件 + 养护参数输入行（免填了被静默丢）+ toast「已归档 N 条」。
- 验证: 10 套测试全绿（saveRecord 45→62 / parseRecord.prompt 26→29 / e2e.flow 18→25 加批量 fan-out 端到端 + 零写入 + 去重 + 体重各写 + 非成员拒）；**fail-first 证非假绿**（stash 实现对旧码跑批量用例 15+2 失败 + e2e 抛错，恢复后全绿）；build 零错 + 产物核实（record.js 含 selectedPets/togglePet/isBatch、wxss 含 batch-hint、cloudfn 产物含 saveBatch）；两轮对抗评审（后端 + 前端各 1 agent）0 must-fix，修了 2 同根因存疑（批量 + 养护参数：隐输入行 + buildRecord 不收 params）。**待真机验**（多选勾减 / AI 预选多只 / 批量落 N 条 / 单只不回归）。

## 真机渲染质量对齐 HTML 镜像 · canvas 导出 dest 修复 + 去纹理 + 抗锯齿 + 描边整数化 + care 令牌化 · 2026-06-20（ADR-028，已 commit 21f50c1 · 镜像入公开仓 1265dc4）
- Context: 建 Claude Design HTML 镜像（`design-system/`，23 卡逐字镜像 App.vue 令牌 / 各页 WXSS / petCard.js）当「质量标尺」反向校真机；claude.ai/design 登录受网络阻未上云，转本地 iframe 画廊。多 agent 渲染审计（46 agent，9 真问题 / 剔 29）定位差距≈渲染非设计。镜像作为设计 / 架构材料已纳入公开仓（PII 已扫净）。
- Fixed（头号真 bug）: **档案卡 / 分享卡 / 兽医小结导出糊**：`index.vue` + `pet.vue×2` 三处 `wx.canvasToTempFilePath({canvas})` 缺 dest 几何，type=2d 默认按 CSS 逻辑尺寸导出、丢 dpr backing store → 3:1 降采样再被 `<image>` 拉回。补 `width/height/destWidth/destHeight`（=既有 backing store，<4096 安全）。
- Changed: 去 App.vue 宣纸 base64 纹理底（留 `--c-bg` 平涂、对齐镜像干净，部分 revise b655539）；page 加 `-webkit-/-moz-` font-smoothing；描边整数化（9 闭合框 + tabbar 顶边 + 9 border-bottom 的 `2rpx→1px`，整数物理 px 才锐）；`rec__btn` 96→92。
- Refactored: care 养护色硬编码 → `--c-rt-care/-bg/-ink` 令牌，**6 处全令牌化**（含 `record-detail` 2 处审计漏报的 latent 同根因点）。
- 不动（复核非真漂移，详见 design-system/DRIFT.md）: chip 两套（other 紫≠灰、合并是色彩回归）/ 表单行 label 宽（内容驱动）/ sheet__title（图标驱动）/ 重导大图（dest 修后仅 ~1.3x 上采样、本地无原图）。
- 验证: build 零错 + 10 套测试全绿 + 产物逐项核实新鲜。**待真机验观感**（dpr3 才显 canvas 变清 + 去纹理干净度）。

## 图标系统统一 · emoji → Fluent 彩 + Phosphor 暖染 · 2026-06-18（commit fbb3d1d）
- Added: **装饰性 + 档案卡 emoji 全量换双档图标系（ADR-026）**：表达型（卡片 / 标题 / 按钮 / 空状态 / tab）用 Fluent-emoji-flat 彩色；功能型（时间线 / 病程行内信息 chip）用 Phosphor-duotone 暖染珊瑚。素材走 Iconify API 取 SVG → headless Chrome 栅格成透明 PNG（`--default-background-color` 原生透明，比 a3ea60a 的 floodfill 抠图干净），27 张入 `src/static/icon`。
- Changed: **档案卡 canvas（petCard.js）emoji → drawImage**：`loadCardIcons` 按 canvas 节点预加载图标，年龄 / 体重 / 陪伴胶囊、点缀、水印、体重占位改 `drawImage`，每处带 emoji 兜底（图加载失败优雅降级）。陪伴胶囊用 sparkling-heart 爱心（避开与家庭卡房子混淆 + 房子隐喻陪伴偏弱，深审 should-fix 已修）。
- Changed: **tab 栏换 Fluent 彩**（时间线 calendar、健康 stetho；选中态仅文字变色）；**a3ea60a 9 张 kawaii 图标同名覆盖成 Fluent**，原按这些文件名引用处（空状态 / 录入门面 / med-card 等）零改自动换图。
- Added: **App.vue 全局图标工具类** `.ic / .ic--sm / .ic--lg`（跨页复用必须挂 App.vue，守 wxss-scope 红线）；`.tl-note` 改 inline-flex、`.btn-primary` 加 `display:flex` 居中（容纳「图标 + 文字」）。
- Kept: 红线保留 8 张物种默认头像 / `species.js` 物种 emoji / 性别 ♂♀ / 控件符号（✓ ✕ ← → ↗ ↘）不动（用户明确物种那几张不换）。
- Reviewed: **两轮对抗式 workflow 评审（共 9 agent）0 must-fix**：① 4 维（canvas / 模板 CSS / 全局回归 / 完整性红线）；② 深审 5 维（git 旧→新逐条可追溯账本 / 图标隐喻 / mp 运行时坑 / 跨文件一致性 / 回归与产物新鲜度），2 should-fix（陪伴换爱心已修、时间线日历用户选保留）。**三处可视化自验**（档案卡 / 行内 chip + tab / 爱心胶囊，浏览器 1:1 canvas + mock 截图）+ 真机验过。build 通过。

## 数据核对 · live DB ↔ Notion 逐条一致 + 孤儿清理 · 2026-06-18
- Verified: **家庭 live DB 与 Notion 源逐条核对，数据健康**。搭微信云 DB 直连只读（服务端 HTTP API，见 DEPLOYMENT「直连读 live DB」）+ 三路核对法（live ↔ data.json 导入载荷 ↔ Notion 新鲜导出；复用 transform.py 归一，内容签名多重集 diff）。结论：217 记录 / 9 宠 / 12 主粮 / 46 附件**逐条一致，0 意外增删改、附件文件 0 缺失**。
- Note: 差异全部有据非数据错：Notion 3 条无日期行未导入（含早先确认跳过的 2 条无日期体重）；当前在喂主粮 end 留空（ADR-014 约定）；live 107 个非病程 tag 被 clean_tags 有意清空（ADR-019）；6 张宠物简介图在「档案 / 简介」列、出导入范围（app 宠物模型 = 头像 + 简介文本，无简介图位）。
- Cleaned: **清除 4 条孤儿测试残留**（1 个无 family_id 的早期 openid 时代测试宠 + 3 条无 family_id 记录，app 本就不显示）。删前逐条核验「确无 family_id」（有则全部中止）+ 完整备份可恢复 + 只按精确 _id 删、绝无批量 where。清理后库内 family_id 分布 100% 真家庭（9 / 217 / 12），0 孤儿。

## v0.4.5 修复 · latest_weight_date 纯日期口径对齐 + 内测前全项目 review · 2026-06-18（commit 5befbd3）
- Fixed: **latest_weight_date 纯日期口径不对齐（ADR-018 起 records.time 含到分）**：写侧 saveRecord 已 `slice(0,10)` 存纯日期，但删侧 attachment `recomputeLatestWeight` 守卫拿纯日期比含到分 `rec.time`（恒不等 → 删真·最新体重记录跳过重算、留幽灵值）+ 回写灌含到分 time 污染字段（→ 同日新体重静默丢写）。抽 `toDate(t)=slice(0,10)` 写删两侧统一（attachment 守卫 + 回写 + importNotion importData / backfillWeight 共 3 处）。实证 buggy 回写在生产不可达（守卫先失败），存量数据未污染、无需清洗。
- Added: 回归用例（attachment 删带到分 time 最新体重 → 重算到次新 + 纯日期 + weight_spark 写删两侧对称；importNotion backfill_profile）。**先对未修代码跑确认失败证非假绿**。tests/README 断言表除锈（→ 292）。SPEC / PRD 数据字典漂移修（event_type 8 桶 + records.params + 档案卡字段）。
- Reviewed: **内测发码前两轮对抗式 workflow review**（① 7 维 finder → 对抗验真 13→9，greenlight 无 must-fix；② fix 后 5 维 verify-the-fix，当场抓出我新犯的 README 断言数字错 + cur off-by-one）。红线 / 隔离 / 数据损坏 / 崩页全 0，本修复是唯一 should-fix。全 9 套 292 断言绿 + build 通过。

## 宠物档案卡富化：性别 + 绝育 + 体重趋势 · 2026-06-17
- Added: **档案卡加性别 / 绝育 / 体重趋势曲线（ADR-025）**：① 新增 `pets.gender` 字段（male / female / ''，pets EDITABLE + `normGender` sanitize），pet.vue 编辑表单加性别分段（公 ♂ / 母 ♀ / 未填）+ 详情页性别行，卡上名字后画 ♂(蓝) / ♀(粉) 符号；② `neutered=true` 时物种 chip 追加「· 已绝育」；③ 卡 `CARD_H` 440→480，3 胶囊下加整宽「体重趋势」band（`paintPetCard` 加 `weightSpark` 参数，≥2 点画珊瑚 sparkline + 末点 + 末值 + 升降箭头，否则占位「📈 记录体重看趋势」）。**不加身价**（费用衍生，守可分享红线）。
- Changed: **体重曲线方案 b（冗余 weight_spark，as-built 改自方案 c）**：用户真机看到轮播占位「记录体重看趋势」在有体重的宠上误导 → 改为 `pets.weight_spark` 冗余近 12 个体重点（saveRecord `recomputeWeightSpark` 落体重记录时维护 + 建档初始化单点）。index.vue 轮播传 `pet.weight_spark`、`cardSig` 签名补 `gender / neutered / weight_spark` → **轮播卡也显真曲线**；pet.vue 分享卡仍传 `this.series` 全量。swiper / 离屏 canvas 高度按 480/320 比例自适应。
- Added: **importNotion `backfill_profile` 一次性回填（admin）**：从 `profile_backfill.json`（gitignore，随函数部署私有云端）回填 9 宠 `gender`（来源：本地简介卡性别栏 + 个别宠物病历 + 用户口述）+ `neutered=true`（用户口述全家已绝育，病历 / Notion 佐证）+ `intro`（简介卡性格文案，仅填空不覆盖）+ 从 records 算 `weight_spark`。DevTools 云测试 admin 登录态触发。
- Tested: `tests/pets` 加性别枚举 sanitize（add + update 两路 male/female 保留 / 非法落空串），pets 单测全绿；全仓 9 套测试 0 失败。`build:mp-weixin` 通过。档案卡新版式经 SVG 镜像 → headless Chrome 截图自验（公 + 已绝育 + 曲线 / 母 + 占位 band 两态，无重叠）。顺手把 pets 测试里残留的两处历史真名向前脱敏成示例占位。**已 commit + push（2bc83bd）**；待真机验（确认存量宠 neutered 字段、各物种 ♂/♀ 字形渲染、band 观感）。

## 动画三项 + tl-item 抽全局修病程列表裸奔 · 2026-06-17
- Added: **微交互动画三项**：① 列表项按下反馈（`:active` 轻压回弹，时间线 / 健康 / 宠物卡通用）；② 上拉加载「三点」loader（翻页时底部三点呼吸，替代生硬文案）；③ 身价 count-up（宠物详情进页时当前身价数字滚动到位，`priceShow` 影子值逐帧逼近 `priceNow`）。均走 GPU transform / opacity，不触 setData。
- Fixed: **病程列表 course.vue mp-weixin 裸奔（页样式不跨页根因）**：`.tl-item` 时间线卡样式原只在 timeline.vue 的 `<style>` 内，mp-weixin 把每页样式各编进自己的 .wxss、**不跨页**，故 course.vue 复用 `.tl-item` class 时无样式（裸奔）。抽 `.tl-item` 全套 + `ev-*` 病程配色到 `App.vue`（→ app.wxss 全局），course / timeline 同源。系统普查全 11 页仅此一处裸奔 + 一处死类，一并清。
- Hardened: 提交前 ultracode 22-agent 评审（6 维 finder / 3 视角对抗 / 完整性批判）must-fix 0。两处教训：动画 `fill-mode: both` 会占住 transform 压死后续 `:active` 按下 scale → 改 `backwards`（仅 delay 段防闪、播完释放）；count-up 展示值 `priceShow` 须以 `priceNow` 兜底，否则弱网 / 派生失败时闪 ¥0。
- Committed: 已 commit + push（484ceb2）。待真机验微交互观感。

## 全局宣纸纹理底 + 过渡动画 + 时间线分页 / 跨年日期 · 2026-06-16
- Added: **全局宣纸纹理背景**：竖版单图 `cover`（非 `repeat`，防拼接缝）；mp-weixin wxss 不支持本地 `url()` → 纹理图 base64 内联进 App.vue；不支持 `fixed` 定位，故颗粒随页长自然延伸。温暖治愈 UI 再进一层。
- Added: **过渡动画 1+2+3**：① 列表 stagger（列表项逐条错峰淡入上移）；② 空状态浮动（空态插画轻微上下浮 breathe）；③ 录入卡滑入（确认卡片从下滑入）。GPU 加速；mp-weixin 路由转场无法自定义（原生），只能做页面内元素动画。
- Added: **时间线分页（修「50 条无翻页」backlog）**：timeline `list` action 加 `skip / hasMore / _id 兜底序`，前端 `onReachBottom` 续页 + 去重；跨年记录日期显示补年份（防同月日跨年混淆）。
- Hardened: 4 维评审抓 1 must-fix：共享 `list` 的 limit 原钳 100，误伤 pet.vue `loadWeight`（取该宠全量算身价 / 体重，需 limit 1000）→ 放行 1000 + 补回归守卫（单宠记录数现最大 92 < 100，限值休眠但守卫在）。
- Committed: 已 commit + push（b655539）。

## emoji 换扁平 kawaii 图标（9 透明 PNG）· 2026-06-16
- Changed: **门面位 emoji 换扁平 kawaii 图标**：tab 栏 / 空状态插画 / 录入门面位 9 处 emoji 替换为成套扁平 kawaii 透明 PNG（Seedream 出图 + 白底角点 floodfill 抠透明，描边当屏障保内部浅色）。小尺寸内联徽标位仍留 emoji（图标辨识度不划算）；tab 选中态仍仅文字变色（图标不切两套）。素材风格 DNA + 抠图做法见 reference。
- Committed: 已 commit + push（a3ea60a）。待真机验图标观感。

## 物种扩展 A 档 + B 档 B2 + 默认头像 · 2026-06-16
- Changed: **解除「仅猫狗」红线 → 8 类物种枚举（ADR-023）**：cat / dog / rabbit / rodent / bird / reptile / fish / other（非法 / 旧值落 other）。落库总闸 `pets/index.js` 二元钳制 `species==='dog'?'dog':'cat'` 改 `normSpecies` 白名单（saveRecord / importNotion / parseRecord/index.js 同步，含修了 record.vue / pet.vue 几处漏网钳制）；前端抽 `src/species.js` 单一真相源（SPECIES / normSpecies / speciesLabel / speciesEmoji / avatarStatic）。猫狗为主 + 常见宠物（A 档：一套统一记录模型，不为物种分叉医疗）。
- Added: **8 物种默认头像（ADR-023）**：扁平 kawaii 矢量图标风（Seedream doubao-seedream-5-0 生成，正面坐姿团子 + 侧面金鱼 + 爪印），放 `src/static/avatar/<species>.png`（256² PNG）；头像优先级 **照片 > 自选 emoji > 物种静态图 > emoji 兜底**（pet.vue 头部三级降级 + petCard.js `loadSpeciesDefault` + index.vue 骨架）。
- Added: **B 档 B2 养护数据维度（ADR-024）**：「养护」= event_type 第 8 桶；养护参数落 `records.params`（schemaless 对象，saveRecord `sanitizeParams` 兜垃圾 + event_type=养护 门控）；爬宠温湿度 / 鱼水质（pH / 氨 / 亚硝酸盐 / 水温）；`src/speciesProfile.js` 每物种 profile 驱动物种感知录入（event_type / 提醒分类按物种收敛 + 养护参数表单 + curSpecies 推导）；timeline / record-detail 渲染参数 chip + 养护配色 ev-care。**Q2 锁定纯用户自定义周期，绝不内置疫苗 / 驱虫周期建议值（守医疗红线）**。
- Tested: `tests/pets` 加物种白名单覆盖、`tests/saveRecord` 加养护 / params 门控 / 键数截断、`tests/parseRecord.prompt` 加物种 / 养护断言；11 套全绿。`build:mp-weixin` 通过。两轮对抗式 review（上轮 12 条 + 提交前全量）修复落地。**已 commit + push（89b5b78）**；待真机验（多物种 / 养护录入回归）。

## 宠物档案卡 + 首页轮播门面 · 2026-06-15
- Added: **宠物档案卡（ADR-021）**：pet.vue 顶部「🪪 档案卡」一键生成温暖治愈风海报图（头像 / 名 / 物种品种 / 年龄 / 最新体重 / 陪伴天数 / 简介），离屏 canvas 出图 → 浮层（长按转发）+ 存相册，复用兽医小结导出管线；头像照片走 `wx.cloud.downloadFile` → `canvas.createImage` 圆形 aspectFill，失败回退 emoji；萌宠 + 轻健康，绝不含费用 / 医院 / 病史 / 病程 / 用药。（修了体重曲线 `canvas type=2d` 穿透档案卡浮层 → `overlayOpen` 计算属性 + v-if 摘 canvas、关后重绘。）
- Changed: **档案卡改版 A·精致留白（ADR-022）**：头像加暖色径向光晕 + 放大（r52→58），物种行改圆角小 chip（🐱 品种），三胶囊加图标（🎂/⚖️/🏡）+ 圆角加大，去突兀大爪印换轻 ✨ + 小爪点缀，简介前加装饰引号，年龄胶囊值**自适应字号**（完整「2岁3个月」放不下逐级降字号、不省略 / 不截断）。
- Added: **首页（宠物 tab）轮播门面（ADR-022）**：主视图从 2 列宠物网格重做成档案卡左右滑轮播（`<swiper>` 邻卡露边 + 当前卡放大、邻卡缩小变暗 + 指示点 + 末张「＋ 添加宠物」+ 点卡进详情）；一块离屏 `#petCardCanvas` 顺序出图 → 各宠 `<image>`，按 8 字段签名缓存（仅脏 / 缺图重渲，再次进 tab 命中缓存零重画），出图前骨架占位。
- Refactored: **抽共享渲染模块 `src/petCard.js`**（`paintPetCard` / `loadPetAvatar` / `CARD_W/CARD_H`）：详情页分享卡与首页轮播卡共用同一份绘制，**逐像素同款、所见即所分享**，根治两处设计漂移；pet.vue 迁出 paintCard / loadAvatarImage / companionDays / roundRect（vet 小结仍用的 ageText / truncate / wrapByWidth 保留）。
- Verified: `npm run build:mp-weixin` 通过（重构无语法错）；档案卡 A 版经 SVG 镜像 → headless Chrome 截图自验版式（占位「示例猫」）。**已 commit + push（7079d64）**；待真机验轮播交互。

## 安全审计 · 家庭多租户隔离回归 E2E · 2026-06-14
- Audited: **13-agent workflow 审计 11 个云函数 + 前端的家庭多租户隔离**，四条不变式（① 鉴权闸触库前零例外 ② `family_id` 作用域闭合 ③ IDOR 按 id 直操作前校验 `doc.family_id` ④ openid 单一可信源 `getWXContext`，闸与查询同一变量）全绿，**0 可利用缺陷**；每条 finding 经对抗式复核（默认怀疑、按设计的安全写法判 false-positive）。
- Verified: 系统性横向比对 9 份手工复制的 `assertMember` 副本语义一致（family 拆 `getMembership`+`assertAdmin`、importNotion 用更严的 `resolveFamily` 反查 admin 家庭），无漂移、无漏 where 条件、无吞错误返 falsy；跨函数契约 parse→save 由 `saveRecord` 用自己的 `event.family_id` 独立再过一次闸把关（攻击者篡改 save 的 family_id → `NOT_MEMBER`，落不进别家）。
- Added: **`tests/isolation.e2e.test.js`（64 断言，9 组安全契约）**：可变 `CUR_OPENID` 模拟攻击者改包，串真实云函数验 A 鉴权闸跨家庭 8 函数全 `NOT_MEMBER` / B 空 family_id → `NO_FAMILY` / C IDOR 删改读别家文档被归属校验挡 / D parse→save 篡改链 / E importNotion 越权（`NOT_ADMIN`/`NOT_FOUND`/`AMBIGUOUS`）/ F 角色身份混淆 / G 邀请码加入 + 被踢后旧码 `BAD_CODE` / H 同名宠物不串档（`PET_UNKNOWN`）/ I 最后一人退出即解散且只清自己家。接入 `npm test`（9 套共 **234 断言**全绿）。
- Added: **`tests/README.md`**：三层测试哲学（单函数集成 / 功能契约 E2E / 安全契约 E2E）+ `Module._load` mock 基建 + 各套覆盖表 + mock 内存 DB 能力边界（无 `_.lt`，故隔离测试邀请码用不限次）+ 真机层抓不到什么。
- Hardened: **CONVENTIONS 新增「多租户隔离（红线）」节**：四条不变式写成契约 + 立 **assertMember 多副本同步红线**（非共享 lib，改任一份必须 N 份同步 + 跑隔离回归通过才提交，防单函数静默失守）。
- Note: 本次为安全审计 + 测试 + 文档，无云函数 / 前端代码改动；3 处改动（isolation.e2e.test.js / tests/README.md / CONVENTIONS）随 v0.4.5 批次 **已 commit + push（5b3a9de）**。

## v0.4.5 · 2026-06-12 · 录入重做：结构化直填 + 确认卡片可编辑 + 点＋弹「记录」入口卡 + 时间精确到分（ADR-017/018）
- Added: **结构化直填（不调 LLM，ADR-017）**：录入新增「结构化逐项填」一路，不过 parseRecord、不写 parse_log、不耗解析配额，前端拼同形 record 直接调 saveRecord（**saveRecord 本就是落库校验边界**，normalizeDate / numOrNull / event_type 枚举 / fuzzyMatchPet + PET_UNKNOWN 服务端原样兜底，故零新增云函数 / 集合 / 字段）。明确知道哪只宠 / 哪天 / 什么类型时可精确录入，离线或上游故障时也能录。
- Added: **确认卡片改全字段可编辑（ADR-017）**：AI 解析结果卡片从只读变可编辑，三种 kind（record / reminder / med_stock）全字段 picker / selector / input 内联改 —— AI 错一个字段（如体重识别错）直接改卡片即可，不再「返回改原文重调一次 LLM」。一份 UI 两用：手动直填 + AI 结果内联修。宠物字段三态守 ADR-015（is_new 建档意图保留唯一建宠通道，其余 picker 选已有，record 落库前必须有 pet）；数字字段出站强制本地 numOrNull（input 给字符串，否则 saveRecord 的 `typeof==='number'` 兜底把 "4.2" 判空丢值）。
- Changed: **点＋弹「记录」入口卡（as-built，多版线框图评审选定「A 三入口卡」；入口卡 / 录入键文案由原拟名「记一笔」统一改为「记录」，涉导航标题 / 入口卡 / 确认卡 / 首页空状态按钮 4 处）**：中央＋仍 navigateTo /pages/record，入口态呈暗背景遮罩 + 居中卡，自然语言 textarea 居中为主入口，下方「或换种方式」分隔线 + 结构化 / 语音两个次级入口（语音禁用占位 toast「敬请期待」，留下一轮）。**入口卡走普通文档流（非 `position:fixed` 浮层）**，原生 textarea 不踩同层渲染穿透坑；表单整页内联，废弃原底部弹层（`sheet-mask`）—— 同因规避原生 input/picker 进 fixed 浮层的层级穿透 / 上滑跳位真机风险。点暗处 / ✕ → navigateBack 关闭。
- Changed: **records.time 精确到分 + created_at 由事件时间派生（ADR-018）**：time 升为 `'YYYY-MM-DD HH:mm'`（缺时刻保留纯日期），`normalizeDateTime`（saveRecord + parseRecord 两处同步）日期段定长零填充保字典序；created_at 由事件时间派生（`createdAtFromTime`）：有分用准点（东八区），仅日期用当日 **12:00**（延续历史导入约定，避免补录旧记录排到时间线顶）。结构化表单时间 = 日期 picker + 时刻 picker（mode=time，到分）；AI 进卡片时 `ensureEventClock` 补当前时刻。prompt 教 LLM 说了时刻才输出 HH:mm + 1 条 few-shot。库内 217 条历史（纯日期 + 中午派生）不受影响，展示零改（timeline `slice(5)` 天然带出到分、体重图轴标 `slice(2,10)` 天然停在日期）。
- Tested: saveRecord 集成测试加 2 组（时间 / created_at 到分 + latest_weight_date 仍纯日期；仅日期 → created_at 落中午 12:00），saveRecord 套 27 → 32 断言；五套共 114 断言（npm test 全绿）。
- Deployed: saveRecord / parseRecord 已 `wxcloud function:upload` 重新部署；前端产物 `dist/build/mp-weixin`（≈0.65MB）走体验版内测。AIREADME 同步：DECISIONS 加 ADR-017/018、SPEC 改 records.time / created_at 字段说明、DEPLOYMENT 加内测发布（体验版）+ 用户隐私保护指引清单。
- Committed: v0.4.5 前端（record.vue 等）+ 云函数源码 **已 commit + push（5b3a9de，与隔离审计回归同批）**；待内测真机回归（录入三路 / 时间到分 / 解析可编辑）。

## v0.4.4 · 2026-06-11 · LLM 上游切换：火山方舟 Coding Plan 直连（弃自建网关，ADR-016 反转 ADR-003）
- Changed: parseRecord 上游从自建 newapi 网关中转改为**火山方舟 Coding Plan 直连**（OpenAI 兼容 `https://ark.cn-beijing.volces.com/api/coding/v3`，模型 `doubao-seed-2.0-pro`），消灭中转站单点（挂则 AI 录入整体不可用）。配置整套换名 `GATEWAY_*` → `ARK_*`，端点 / 模型进 config.local.js 可改（换后端 LLM 不动代码），唯一机密 ARK_API_KEY；**删除自签 root CA 信任逻辑**（方舟公网正规证书），「CA pinned 不可轮换」跨项目约束随之作废（CORE / RELATIONS / ARCHITECTURE / DEPLOYMENT / CLAUDE.md 同步清理）。
- Fixed: dist/dev 与 dist/build 残留的旧 newapi config.local.js 副本（含退役 token + 自签 CA）覆盖清理。
- Tested: 直连冒烟两用例 200（正常录入 + 错别字归一「示列猫」→「示例猫」模型层直接生效），延迟约 4s（旧网关复杂输入曾 20s+），JSON 干净含 new_pet 字段。已部署。

## v0.4.3 · 2026-06-11 · 体重曲线交互重做（拖动平移 + 点按数据点详情）
- Changed: **体重曲线第三版交互**：弃用「scroll-view 套宽 canvas」（canvas 同层渲染失败时触摸被原生组件吞掉、横滑手势到不了 scroll-view，模拟器 / 真机表现不一，真机已证伪），改为 **canvas 固定视口宽 + 手指拖动平移重绘**（touch 事件直接绑 canvas，任何渲染模式都触发）。顺带连根消掉 4096 物理宽上限问题（画布恒为视口宽）、scroll-left 时序 hack、flex min-width 坑；拖动走普通实例属性不触发 setData。
- Added: **点按数据点显示详情气泡**（完整日期 + 体重，深色圆角气泡 + 高亮圈）：8px 累计位移阈值区分拖动 / 点按，点空白收起，贴边夹紧 / 贴顶翻下 / 拖出视口跳过绘制，气泡随平移跟随。
- Hardened: 轻量对抗评审（35 agent）修 5 处：慢速横拖被误判点按（_tx 双职责污染，阈值基准改独立 _sx）；touchend 异步回调期间平移量变化命中错点（同步快照 off）；ly 上界未排除日期标签区；选中点拖出视口气泡贴边悬空；layoutAndDraw 重试封顶 10 次（防退页后逻辑层空转）。记录取舍：catchtouchmove 会吞画布区域的竖向页面滚动（无下拉刷新冲突，已核实未启用）。

## v0.4.2 · 2026-06-11 · 轮4：录入防错别字（意图驱动建档）+ 头像 emoji 自定义 + 手动建宠入口
- Added: **录入防错别字三层防线（ADR-015）**：① parseRecord prompt 强化「错别字 / 同音 / 简称必须归一到已有宠物名」+ 新增 `new_pet` 意图字段（仅「新来的 / 添加宠物 / 领养 / 捡到」类明确表述为 true）+ 错别字与新增两个 few-shot；② parse 层服务端模糊兜底（编辑距离 ≤1 / 互含、按 Unicode code point 算防 emoji 名代理对误判、唯一候选才 snap，结果展示在确认卡片可复核）；③ saveRecord 建档凭意图不凭名字：只在 `new_pet=true` 或 0 宠首录时建档，名字不在库一律拒 `PET_UNKNOWN`（零写入，附名单 + suggest），确认卡片「❓ 没找到这只」+ 已有宠物 chips 点选。**reminder 通道同享防线**（评审抓的：错别字提醒原来会挂幽灵名）。
- Added: **头像 emoji 自定义**：pets 加 `avatar_emoji`（编辑表单 16 格 emoji 选择器 + 照片上传并存）；显示优先级 照片 > 自选 emoji > 物种默认 🐱/🐶；选 emoji 自动清照片并删旧云文件。
- Added: **手动建宠入口**：宠物网格末尾虚线「＋ 添加宠物」卡片 + 空状态「或手动添加宠物档案」链接 → pet.vue 创建模式（`?mode=new` 复用编辑表单，建档后原地变身详情页）。
- Hardened: 67-agent 对抗式评审（4 视角 × 3 票表决）确认 17 条、修 9 处：0 宠空状态录入死端（HIGH，收紧建档 + 入口缺位叠加出的首跑死路 → 0 宠首录视同新增 + 空状态入口）；saveRecord 落库层静默 snap 会把记录改派给别的宠物（→ 只 suggest 不 snap）；reminder 绕过防线；pets add / 改名无查重无 trim 可建重名档案（→ 服务端 trim + family+name 查重）；pickEmoji / 创建取消 / 反复换图三条云存储孤儿头像路径（→ discardTempAvatar 统一清理，传成后再删旧）；单 emoji 名绕过单字护栏互距 1 误 snap（→ code point 切分）；parse 不 trim 与 save 不一致；new_pet 没名字被静默吞（→ 拦截提示补名）；avatar_emoji 类型收紧 slice(0,8) + saveRecord 建档字段集与 pets add 对齐。
- Tested: 新增 `tests/saveRecord.cloudfn.test.js`（27 断言：PET_UNKNOWN 零写入 / suggest / 0 宠放行 / reminder 防线 / emoji 名 / trim / 隔离）+ `tests/pets.cloudfn.test.js`（8 断言：查重 / trim / 类型收紧）；五套共 109 断言（npm test）。
- Changed: pets / parseRecord / saveRecord 已 CLI 重新部署；SPEC 补宠物名解析契约 + avatar_emoji 字典。

## v0.4.1 · 2026-06-11 · 轮3 导入执行收口 + Notion 实时全量核对清洗 + 体重曲线横滑
- Added: importNotion 增 4 个一次性运维动作：`import_foods`（首轮 import 在 foods 集合未建处崩的续传，带 FOODS_NOT_EMPTY 护栏）、`backfill_weight`（从 records 按事件日期回填 pets.latest_weight，导入绕过 saveRecord 回写所致）、`fix_times`（删无日期记录 + 导入记录 created_at 统一「事件日期 + 12:00」）、`stats`（只读体检：计数 + noon 校验 + 脏记录扫描，count 全兜底集合不存在）。主 import 同步：写 pets 自算 latest_weight、created_at 改 12:00 派生、写 foods 前 createCollection 兜底。
- Changed: 体重曲线重做：等间距（每点 ≥56px）+ scroll-view 横滑（固定 y 轴不随滑动跑）+ 默认滚到最新（实测滚动偏移二次校验，绕开同值赋值不生效）+ 日期标签按间距挑点画（≥70px，带日防同月重复）。**canvas 物理宽夹紧 ≤4000px**：微信 canvas 2d 有单边上限（文档 1365×1365，实测 ~4096），某宠 27 个体重点 × dpr3 = 4440 已越线，不夹真机整块白屏（评审 HIGH）。
- Fixed: **Notion 实时全量核对**（21 agent 经 Notion MCP 拉全部 240 页逐字段 diff data.json）：档案 / 记录字段 / 费用对账 / 主粮全一致；修 3 处：CSV 尾部空行混入的全空记录、2 条 Notion 源头漏填日期的体重记录（经用户确认删除）、created_at 全在 00:00 → 12:00（约定缺时间默认中午）。库内终态 9 宠 / 217 记录 / 12 主粮 / 46 附件，stats 全绿。
- Fixed: 导入执行三连坑：importNotion 超时默认 3s 中途被杀（控制台调 60s）；**partial import 后再 clear 会把半写入记录引用的 staged 附件当旧文件删掉**（7 个附件重传，注意 `storage:upload -r` 传目录不能传完整键，否则 key 变 `key/文件名`）；foods 集合未建 import 崩在写 foods（集合不自动创建）。
- Fixed: transform.py 日期必填护栏补齐健康 + 驱虫双循环（无日期行跳过并打印）；首页 openPet 跳转加 fail 弹窗（真机偶发不跳转可见原因）。
- Hardened: 对抗式评审（58 agent，4 视角 × 3 票表决）确认 16 条：修 6 条（canvas 上限 HIGH、padX 24/32 不一致末点高亮圈被裁、stats count 无 catch、scrollLeft 单次定时不可靠、y 轴 rpx/px 错位、ptTime 死代码 + 标签重复）；4 条「验证通过」结论（fix_times 的 imported:true 过滤完整、分页先收集后变更无跳行、backfill 与 saveRecord 逻辑一致、import_foods 无双计）；驳回 2 条。

## v0.4.0 · 2026-06-10 · 字段扩展轮（初始身价 / 简介 / 绝育识别）+ foods 主粮模块 + Notion 历史导入（轮3）
- Added: pets 加 `price_base`（初始身价，反转 ADR-013「身价不入库」）+ `intro`（自由文本简介）；档案页编辑可设，只读展示「当前身价 = price_base + 该宠 records.cost 累计」（前端派生不落库），见 ADR-014。
- Added: **foods 主粮模块**（从 ADR-013 deferred 转正）：新增 foods 集合 + foods 云函数（list / add / update / delete，family 隔离，设 current 自动取消其它 current）；健康页加「主粮」分段（台账增删改查 + 当前在喂高亮 + 底部编辑弹层）。
- Added: **Notion 历史数据结构化导入（轮3，ADR-012/014）**：一次性 importNotion 云函数（clear 按家庭名 + assertAdmin 清空 pets/records/meds/reminders/foods + 云存储 + 归零 storage_bytes；import 灌入 9 宠物 / 220 记录 / 12 主粮 + 41 条记录的附件）。转换脚本 `tools/notion-import/transform.py`：CSV → 结构化 JSON（日期区间取起始、费用去 ¥、档案链取宠物名、名称→病程 tag、event_type 按内容映射 7 桶、品种→猫狗、初始身价、病史/备注识别绝育、驱虫多猫展开 per-pet、附件双重 URL 解码）；附件经 `wxcloud storage:upload` 预传 att/<recordId>/，import 探针拿 cloud:// 前缀拼 fileID + 逐个 getTempFileURL 验证（坏链中止不写库）。data.json gitignore（真实宠物名随函数部署到私有云端，不入公开仓）。
- Tested: 新增 `tests/importNotion.cloudfn.test.js`（mock SDK + data.json，6 场景 / 23 断言，npm test）：家庭解析安全（只动你 admin 的对名家庭、拒非管理员）、clear 只删目标家庭不碰别家、import 拼对 fileID + 坏链中止。
- Fixed: import 直接改 `require('./data.json')` 会污染 require 缓存（同容器二次 import 读到被删 key_name 的数据致 fileID 拼错）→ 克隆后再改（集成测试挖出）。
- Fixed: `normalizeDate` 正则锚死结尾 `(\d{1,2})$`，「2026年6月9日」这类带「日」尾的中文日期匹配不上 → 回退兜底致日期丢失（LLM 偶发输出中文日期、foods 若收到中文日期同此）。改 `\D*$` 容尾部非数字；parseRecord / saveRecord / foods 三处同步（foods 集成测试挖出）。
- Tested: 新增 `tests/foods.cloudfn.test.js`（13 断言）：add/list/update/delete、设 current 自动取消其它、family 隔离 + 跨家庭操作拒。三套云函数集成测试共 74 断言（`npm test`）。
- Hardened: 多 agent 对抗式评审（60 agent，6 视角 + 三视角表决证伪）修一批真问题：① **到家记录的费用列存的是购入身价（= 初始身价），误入 records.cost 致当前身价双重计入**（transform 对「到家」记录 cost 置 None；修后当前身价与 Notion 原值精确吻合）；② import 非幂等：未先 clear 重跑会写重复 pets + records 撞 dup _id 中途崩、无回滚 → 入口强制目标家庭 pets/records 为空否则 NOT_EMPTY 拒；③ 家庭解散 cascadeDeleteFamily 漏删新增的 foods 集合 → 补 'foods'；④ foods clearOtherCurrent 吞错致失败时静默两条 current → 去 catch 让其冒泡；⑤ 导入 records 的 created_at 全用 now 致主时间线乱序 + limit 50 截断 → created_at 由事件日期派生；⑥ num_or_null 多小数点 float 崩溃 + 负号翻正 → 防御；⑦ 当前身价 costSum 复用 limit 200 查询会截断超量宠物 → 提到 1000；⑧ clear 漏删 att_log、设在喂残留 end_date、绝育「未绝育」误判等 low 一并修。

## v0.3.2 · 2026-06-10 · 附件轮2（健康记录挂图片 / 视频 / PDF + 配额限额 + 记录详情页 + 级联清理）
- Added: 健康记录附件（ADR-011）：records 加 `attachments[]`（fileID / thumb / type / name / size / bytes）+ `att_count`；新 `attachment` 云函数（register / remove / deleteRecord），登记前服务端按云存储真实体积复核（getTempFileURL + HEAD，客户端报的 size 不可信），超限删文件回滚。
- Added: 配额三道闸（共享环境生命线）：单条 ≤9 个；家庭总存储 ≤1GB（families.`storage_bytes` 原子计数）；日上传 ≤200MB/家庭（新 `att_log` 流水，复用 parse_log 的 family_id+day 模式）。单文件上限：图 10MB / 视频 30MB·30s / PDF 10MB。
- Added: 上传入口两处（ADR-011）：录入二次确认卡片选附件（确认归档后才上传，取消不留孤儿；上传失败记录仍在可补传）+ 新「记录详情页」事后补传。图片端侧压缩（长边 ≤2000 q80）+ 缩略图（360px），列表只下缩略图省 CDN 下行（1GB/月 真瓶颈）；视频 chooseMedia compressed；PDF 走 chooseMessageFile（小程序只能从聊天选文件）。
- Added: 记录详情页 `pages/record-detail`：全部结构化字段 + 附件九宫格（点开 previewMedia 图视频混滑 / PDF downloadFile+openDocument 带本地缓存、长按删）+ 删除整条记录；时间线行加 📎 角标、点击进详情；timeline 云函数加 `get` 单条（family 校验防跨家庭读）。
- Added: 级联清理（ADR-011 + 轮1 backlog 孤儿文件）：删附件 / 删记录回收 storage_bytes 并删云存储文件；解散家庭级联删全部附件 + 宠物头像（分页扫 records 防 100 条截断漏删）；宠物 / 用户换头像删旧 fileID、删宠物删头像（记录及其附件有意保留：删档案 ≠ 删病史）。
- Changed: 云函数部署切换 `@wxcloud/cli function:upload`（命令行直传源码目录 + 云端装依赖，绕开 DevTools CLI 签名失败；超时 / 内存配置仍走控制台），见 DEPLOYMENT / MEMORY。
- Hardened: 提交前多 agent 对抗式评审（6 视角找 + 逐条三视角表决证伪，93 agent）修一批真问题：① 安全：register 对客户端传入 fileID 零归属校验可删 / 读别家文件（high）→ 加「fileID 必须落在 att/<record_id>/ 路径 + record_id 经 getOwnedRecord 验权」双闸，验权前绝不删文件；② 并发：attachments 整组覆盖写改 `_.push`/`_.pull` 原子操作（防 last-write-wins 丢更新致孤儿 + 配额漂移），register 体积复核期间记录被删则 `stats.updated` 判 no-op 回滚；③ 健壮：register 调用包 try（弱网上传成功但调用失败补删文件防孤儿）、记录详情页补传加 try/finally（防异常锁页）、openDocument 加 fail 回调 + pdfCache 失效、getTempFileURL 链缓存加 TTL；④ 回归：deleteRecord 回写 pets.latest_weight（删最新体重记录后档案不失真）；⑤ 体积复核 HEAD 改并行 + 单次超时降 5s（防串行超云函数超时被杀）、日护栏求和分页（防 limit 1000 截断绕过）、解散家庭先删文档后删文件 + 宠物头像分页扫、图片客户端补 10MB 预检。

## v0.3.1 · 2026-06-09 · 字段扩展轮1（就诊医院 / 费用 / 病程 + 宠物到家日期 / 备注 / 头像 + 驱虫桶）
- Added: records 加 `hospital`（就诊医院）/ `cost`（费用元，number\|null）/ `tag`（病程标签，与 event_type 双轴）/ `desc`（干净事件描述，不含费用 / 医院 / 寒暄，给兽医小结拼接用）；event_type 6 桶 → 7 桶（增「驱虫」）。parseRecord 同步抽取 + 7 桶分类，saveRecord 落库 + `EVENT_TYPES` 受控枚举校验。见 ADR-012/013。
- Added: pets 加 `home_date`（到家日期）/ `note`（备注）/ `avatar`（头像云存储 fileID），EDITABLE 白名单同步；宠物档案页编辑可设三项（头像走 `wx.chooseMedia` → 云存储 fileID），宠物网格 / 档案头部展示真实头像（无则 emoji 兜底）。
- Added: 时间线展示 🏥医院 / 💰费用 / 🏷️病程，驱虫事件配色（ev-deworm）；顶部病程 tag 简版横向筛选条（点 tag 筛该病程线，点「全部」恢复）。
- Changed: 给兽医小结正文【只用结构化字段拼接（desc 描述 / 病程 / 用药 / 体重），绝不用 raw 原话】+【不展示费用 / 就诊医院】：raw 含费用 / 医院 / 寒暄，对不同医院 / 医生敏感（费用只留时间线）。新增 records.desc（parseRecord 抽干净描述）支撑；composeVetBody / paintVet 注释钉死防回归。
- Changed: 给兽医小结近期记录正文按列宽自动换行（不再单行截断，长记录 / 病程名看得全），最多展示最近 10 条、超出给「仅展示最近 N 条」提示，画布高度按换行行数动态算，避免图过长。
- Fixed: 自定义 tabBar 点「宠物」无法回宠物档案页：`switchTo` 早退判据从每实例可能残留默认 0 的 `this.data.selected` 改为按真实当前路由 `getCurrentPages` 判断（idx 0 = 宠物恰是默认值，故偏偏宠物被吞）。见 MEMORY。
- Fixed: 对抗式评审（多 agent 8 视角 + 逐条三视角表决证伪）修：cost 容错 `Number('')===0` 把无数字串（如「免费」）错判成 0 污染费用语义（saveRecord + parseRecord 两份 numOrNull 同步修）；tag / hospital 自由文本落库 trim 防同名病程线散裂；宠物头像 chooseMedia 缺 fail 兜底。
- Fixed: parseRecord 复杂长输入 20s 超时（-504003）：抽取字段变多（含 desc）后 LLM 生成更久，HTTP 请求超时 20s → 45s，云函数超时需控制台调到 60s。见 MEMORY。
- Fixed: 给兽医小结近期记录按录入时间(created_at)排序导致乱序（补录的旧事件排到最前）：timeline 加可选 `orderField`，小结按事件日期 `time` 由近到远（同日按 created_at 兜底）；默认仍 created_at，主时间线 / 体重图不传该参、行为不变。
- Hardened: 上条排序依赖 `time` 字典序==时间序，故 parseRecord / saveRecord 加 `normalizeDate` 把 LLM 日期（time / rem_date / med_expire）归一为定长零填充 'YYYY-MM-DD'（防偶发 '2026-6-9' 破坏字典序致静默错排 / 提醒误判到期）。对抗复核挖出（doubao 无 response_format，格式仅 prompt 约束）。

## v0.3.0 · 2026-06-09 · 底部导航重构 + 家庭成员档案显示修复 + 构建瘦身
- Changed: 底部导航 5 tab → 4 tab（宠物 / 时间线 / 健康 / 我的）+ 中央凸起「＋」全局录入键；自定义 tabBar（微信原生组件四件套 `src/custom-tab-bar/index.{js,json,wxml,wxss}`，非 .vue）；提醒 + 药品合并「健康」分段页；录入从首页常驻输入条迁到独立录入页 `pages/record`；首页更名「宠物」变纯档案页。见 ADR-010。
- Fixed: 家庭管理成员显示「成员+openid 尾码」而非昵称：`family` listMembers 改为读时关联 `users` 集合取昵称 + 头像（fileID），family.vue 成员行用 `<image>` 渲染真实头像、无则回退首字；`family_members.nickname` 降为兜底。
- Changed: 构建产物不再拷云函数 node_modules（vite 插件 cpSync filter 掉，`dist/cloudfunctions` 586MB → 92K），根治 DevTools 监视巨型目录致「不停自动刷新」+ 拖慢构建；云函数部署改「上传并部署:云端安装依赖」。见 MEMORY。
- Fixed: 评审修健康页药品临期判定与提醒时间源不一致（统一服务端 today）、分段懒加载陈旧（onShow 刷两段）；版本号统一 0.3.0（manifest / package / 关于页）。

## v0.2.0 · 2026-06-09 · 家庭多租户 + 个人中心 + 评审硬化
- Added: 「家庭 + 用户」多租户（隔离键 openid → family，新增 family/user 云函数 + families/family_members/invites/users 集合 + 每函数 assertMember 守卫），见 ADR-008。
- Added: 个人中心「我的」tab（个人档案昵称 + 微信头像、家庭管理·切换·邀请码生成/输码加入·转让/踢人/退出、用户/隐私协议模板），见 ADR-009。
- Fixed: 全代码库对抗式评审修一批真问题，含 user 服务端 add 漏写 `_openid` 致档案永远读不回（根因，见 MEMORY）、补录旧体重覆盖最新（加日期守卫）、邀请码并发超限（原子占名额）、改名漏级联 reminders、家庭上下文失败静默全空白、README 破折号、版本号漂移等。

## v0.2.0-dev · 2026-06-08 · MVP 增强 + UI 重设计
- Added: 宠物档案编辑 / 删除（pets update·delete，改名级联历史记录）；体重曲线（档案页 canvas 折线）；用药·疫苗·驱虫提醒（新 reminders 集合 + 云函数 + 「提醒」tab + 首页到期横幅，自然语言设提醒含周期）；一键截图给兽医（canvas 出图 + 存相册 / 长按转发，含医疗免责）。
- Added: 整体 UI 视觉「温暖治愈」设计系统（珊瑚 + 暖米，CSS 自定义属性令牌挂 page；全 5 页重做 + tabBar 暖化），见 DECISIONS ADR-007。
- Changed: parseRecord 新增 `kind=reminder` 解析；saveRecord 增 reminder 分流；ensureCollections 增建 reminders。
- Fixed: 云函数 node_modules 随构建丢失（vite emptyOutDir 清 dist）→ 依赖移入源码 cloudfunctions/* 由 cpSync 自动带入，见 MEMORY。

<!-- 模板：
## v<x> · YYYY-MM-DD
- Added:
- Changed:
- Fixed:
- Removed:
- Deprecated:
-->

> 历史范式（v1/v2 非本仓库 release，仅备忘，详见 CORE「三阶段演进」）：
> - v1 · 2025.09 · Cursor + uni-app + uniCloud，内测后因空间没续费下线。
> - v2 · 2026.01 · OpenClaw 重构，8000 行 / 双端 / CI/CD，未上生产。
> - v3 · 2026.04 起 · 本仓库，自然语言录入 + AI 解析，立项中。
