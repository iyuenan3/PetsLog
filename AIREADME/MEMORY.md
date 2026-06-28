# MEMORY · PetsLog
<!-- 踩坑/失败/事故，append-only。别重复踩坑。决策→DECISIONS。 -->

## 头像「跨用户没同步」真因＝没点保存（本地乐观态骗人）+ mp 编辑态离开拦截只能用 enableAlertBeforeUnload · 2026-06-27（ADR-032）
内测报「同一家庭 B 改了宠物头像、A 看不到」，像跨用户同步 bug。绕弯前先验尺：**直查 live DB `pets.avatar` 真值**，全库当天零 `pets.update` 写入 → 一锤定音是 B 那侧写入压根没发生，B 看到的是 `applyAvatar` 即时把 `avatarLocal`/`form.avatar` 显示的本地乐观态，A 直读 DB 自然旧值。呼应 6-26「头像没变化＝没保存」同根复发，也再证「UI / 真机 bug 别急着归因，先拉 live DB 看字段真值」（症状『跨用户没同步』能对应多个根因，直查字段真值一步排除一半）。
- **DB 零写入＝可反推「用户从没成功保存过」**：`save()` 的「已保存」toast 只在 `pets.update` 返 ok 弹，而 update 必写 `updated_at` → 全库当天零写入即证 B 从没看到过真保存，**不用追问用户记不记得点没点**（用户自己也答「无法确认」）。
- **mp-weixin 的 `onBackPress` 不拦原生返回**（仅 App/H5 支持）→ 编辑态「未保存离开拦截」只能用微信官方 `wx.enableAlertBeforeUnload`（拦顶部返回 + 左滑手势 + 安卓实体键 + 编程式 navigateBack，2.12.0+；`disableAlertBeforeUnload` 撤）。**会编程式 navigateBack 的出口（取消 / 删除）必须在 navigateBack 前先 disable**，否则编程式 navigateBack 也被拦 → 二次弹（`confirmDelete` 初版就漏，评审 Round1 抓出：编辑态删宠后弹「未保存改动」，点「留下」还卡僵尸详情页）；save 无 navigateBack（留在页内）、靠 `editing=false` 经 watcher 自动撤，onUnload 显式撤。
- **dirty 判定要并入异步 in-flight 标志**：照片换照片时 `form.avatar` 要等 `uploadFile` resolve 才更新，上传那几秒 `form===baseline`、而 `avatarLocal` 已显新图 → `leaveGuardOn` 漏拦（恰是「改了没存就退」本场景；emoji↔照片切因 `avatar_emoji` 非空变空能被捕获，唯独『照片+无 emoji→照片』漏网）。把 `uploadingAvatar` 并入 computed（reactive，watch 自动开关）收口。**即时预览（`avatarLocal` 不进 `form`）会让「视觉已变」与「dirty 判定」背离**，做乐观预览时记得预览态也要计入脏。
- **评审两轮收敛**：verify-the-fix 专审「补丁本身」（修 A 引 B / 守卫锁死 / 吞真错误），**完整性批判挖出 in-flight 漏拦**（单 finder 没抓到），印证审「离开 / 部分态」逻辑要顺反直觉路径查。0.4.10 固定保存栏（ADR-031）是同根第一次收口、B 在该版本仍复发证其不够，这次离开拦截是更稳的通用安全网。

## 派生数据回写 throw 不能让主写算失败，否则「写成功却报失败 → 重试重复」· 2026-06-24（ADR-030 review critic#1）
多事件落库 `saveMulti` 逐条 `writeRecordOne`：先 `records.add(doc)` 落库**成功**，紧接着 `updateExistingPetWeight` 回写 `pets.latest_weight`（**派生数据**，可由 records 重算）。原来这步 `pets.doc().update()` **没包 try/catch**，若网络抖动 / 配额 / 并发瞬时失败 throw，会冒泡到 `saveMulti` 的 per-item catch → 该条标 `WRITE_FAIL`，**但 record 文档其实已经持久化**。前端见 `saved>0` 把这条算「失败卡」留下让用户重试 → 重试再 `add` 一条同内容 record → **库里两份**，体重曲线 / 兽医小结被污染。
- **根因**：把「主写（不可重算、必须成功）」与「派生回写（可重算、失败无害）」放进同一个会让整条失败的 try 作用域。multi 的「部分成功 + 失败卡重试」语义把这个隐患放大成真实重复数据。
- **修法**：`updateExistingPetWeight` **整体包 try/catch 吞掉**（与早已吞异常的 `recomputeWeightSpark` 同档）→ 主写 `add` 成功即 `ok:true`，派生回写失败静默忽略（latest_weight / spark 都能从 records 重算）。
- **教训**：① 任何「先持久化主体、再更新派生冗余」的写序，派生那步失败绝不能反推主体失败（尤其有重试 / 幂等缺失时）；② 单 agent 评审没抓到，**完整性批判（critic）专问“写成功却报失败的窗口”才挖出**：审「部分成功」类逻辑要顺着「已落库但返回失败」这条反直觉路径查；③ 同源隐患单条主路径也有（updateExistingPetWeight 早就裸奔），一并收。


## type=2d canvas 导出必须显式给 dest 几何，否则按 CSS 逻辑尺寸降采样 · 2026-06-20（ADR-028）
`wx.canvasToTempFilePath({ canvas })` 对 **type=2d canvas（createSelectorQuery 拿 node）**，若不传 `width/height/destWidth/destHeight`，**默认按 canvas 的 CSS 逻辑尺寸导出**，而非你 `canvas.width = W*dpr` 设的 backing store。于是高 dpr 下：`ctx.scale(dpr)` 画得很清的 backing store（如 960×1440@3x）被导成 320×480 临时图、再被 `<image>` 拉回显示尺寸 → **整张糊**。PetsLog 档案卡 / 分享卡 / 兽医小结（`index.vue` + `pet.vue×2`）三处都犯，是「真机档案卡比 HTML 镜像糊」的真根因（dpr 缩放逻辑本就对，只漏导出一步）。
- **修法**：导出补 `width:W, height:H, destWidth:W*dpr, destHeight:H*dpr`（值 = 既有 backing store，已 <4096 不触发白屏）。
- **反证定位**：course / pet 的体重曲线 canvas 即时绘制、无 `toTempFilePath` 二次降采样，真机本就不糊 → 锁定问题只在「canvas → 临时图」这一步，不必重写 paintPetCard 的 dpr 逻辑。
- **教训**：canvas 出图糊先查导出 dest 参数（最易漏），别误归因到 font-smoothing（对 canvas 零作用）或 backing store（那步通常对）；多一处出图出口就多一处漏 dest 风险，三处必须全改。

## 微信云函数首跑一串部署坑（一次踩穿）· 2026-06-07
真机跑录入主链路时，按出现顺序踩了 5 个坑，逐一根治：
- **FUNCTION_NOT_FOUND（-501000）**：函数没部署。须在 DevTools 部署云函数。
- **CLI 部署签名失败 `getCloudAPISignedHeader ... ret 41002 system error`**：`cli cloud functions deploy` 卡在上传签名（env / functions 等只读 CLI 操作正常，仅 upload 签名被微信后端拒），重试无效。诱因之一是 cloudfunctionRoot **未在 IDE 绑定云环境**（右键「当前环境:(无)」，需先点工具栏「云开发」初始化再绑）；但绑定后 CLI 仍签名失败 → 改用 **GUI 右键「上传并部署」**（不同签名通道，可成）。结论：云函数部署走 GUI，别指望 CLI。
- **Cannot find module 'wx-server-sdk'**：用「所有文件」上传但本地没装依赖 / 「云端安装依赖」没生效。根治：在产物函数目录 `npm install`（wx-server-sdk 纯 JS 可跨平台），改「所有文件」把 node_modules 带上。
- **collection not exists（-502005）**：微信云数据库集合不随写入自动创建。根治：`parseRecord` 入口 `db.createCollection` 幂等自建 `pets/records/meds/parse_log`，从此免手建。
- **函数超时 3 秒（-504003 FUNCTIONS_TIME_LIMIT_EXCEEDED）**：LLM 类云函数默认 3s 超时太短（冷启动 + 调网关 ~1.7s 必超）。控制台「云函数 → parseRecord → 函数配置 → 超时时间」改 20s（CLI 无此参数；改完用 `cli cloud functions info` 看 timeout 列验证生效）。
- 教训：微信云开发「部署 + 依赖 + 集合 + 超时」全有坑，按上面顺序一次配齐。

## 本机 git push 撞坏代理 `HTTP2 framing / Empty reply` · 2026-06-07
- 现象：`git push` 到 GitHub 报 HTTP2 framing layer / Empty reply from server。
- 根因：会话 env 代理 `127.0.0.1:49512` 对 github CONNECT 返回 502；本机 Clash `127.0.0.1:7897` 正常（先验尺：分别 curl 经代理 / 直连 / 指定 7897）。
- 结论：本仓库 `git config http.proxy http://127.0.0.1:7897` 固化走 Clash；GitHub 是公网域名不在 no_proxy 内，须显式走能用的代理。

> 预埋提醒（已验证）：
> - 云函数调自签网关用 https `ca` 选项（PEM 文本）即可信任，无需 `rejectUnauthorized:false`（本会话实测 auto-llm 调通）。（ADR-016 已弃自签网关改火山方舟直连，本条属早期网关阶段语境、已废止。）
> - 上游 `auto-llm`(doubao) 不支持 `response_format=json_object`（返回 400）→ 见 DECISIONS ADR-005。
> - v1 uniCloud 因空间没续费下线 → 关注微信云开发额度：内测期免费环境，正式上线后第 15 天到期需买 ¥19.9/月 套餐。

## vite emptyOutDir 每次构建清空 dist → 云函数 node_modules 丢失 · 2026-06-08
- 现象：改完源码 `npm run dev:mp-weixin` 重新构建后，`dist/dev/mp-weixin/cloudfunctions/*/node_modules` 全没了，云函数上传又报 `Cannot find module 'wx-server-sdk'`。
- 根因：uni 构建先清空输出目录（emptyOutDir），再由 vite 插件 cpSync 把源码 `cloudfunctions/` 拷回；而源码侧本没有 node_modules，拷回来的自然也没有。不是 cpSync 删的，是「先清后拷」的清把上轮手装的依赖抹了，每次重构建都复发。
- 根治：把 node_modules 装进**源码** `cloudfunctions/*/`（被 `.gitignore` 的 `node_modules` 规则忽略，不入库），cpSync 每次自动带进 dist，从此构建后零手动装依赖。新增云函数同理：建目录后从别的函数 `cp -R node_modules` 过去。
- 教训：症状「每次重来都丢」太规整（呼应先验尺），不是偶发是构建流程必然，往构建流程根因找而非反复手装。

## mp-weixin canvas 2d 出图三点注意 · 2026-06-08
- 体重曲线 / 给兽医小结图都用 canvas 2d（`type="2d"` + SelectorQuery 取 node）：
- ① 绘制前 `canvas.width/height` 乘 `pixelRatio` 再 `ctx.scale(dpr,dpr)`，否则线条 / 文字发虚，作品集展示露怯。
- ② 离屏导出画布用 `position:fixed; left:-9999px` 移出可视区，不能 `display:none`（否则取不到 node、画不出 / 导不出图）。
- ③ node 可能尚未渲染好，SelectorQuery 取不到时 `setTimeout` 重试一次兜底。

## 微信云函数服务端写入【不会】自动注入 _openid（按身份隔离须显式写）· 2026-06-09
- 现象：`user` 云函数 me/update 按 `where({_openid: OPENID})` 查个人档案，保存昵称/头像后再进「我的」永远读不回，每次走「首次建档」分支（个人中心头像昵称不显示的真根因）。
- 根因：微信云数据库 `_openid` 自动注入【只在小程序端 SDK 写入时发生】；【云函数】用 wx-server-sdk 服务端写入【不会】自动绑定调用者 openid（核对过 wx-server-sdk 源码无此逻辑）。于是服务端 add 出的文档没有 _openid，按 _openid 永远查不到，还会不断 add 出孤儿/串档。
- 根治：云函数里凡按身份/家庭隔离的写入，隔离键必须**显式写**。本仓两种成立写法：① 显式写保留字 `_openid: OPENID`（旧 pets/records 即如此，实测可行）；② 用普通字段如 `openid`（family_members 即如此）。绝不能只查不写。
- 教训：别想当然以为云函数 add 会自动带 _openid（小程序端才会）。这次还印证了对抗式评审能挖出我假设错的根因（我先前误判成前端昵称绑定问题）。

## 云函数产物拷 node_modules 撑爆 DevTools 致「不停自动刷新」+ 部署的是 dist 拷贝（改源码须先重构建）· 2026-06-09
- 现象一（不停自动刷新）：导航重构真机验时，DevTools 打开产物目录后不停自动刷新 / 重编译，无法稳定测试。
- 根因一：vite 插件 `copyCloudfunctions` 把源码 cloudfunctions（含 8 函数的 node_modules）整体 cpSync 进产物，`dist/dev/mp-weixin/cloudfunctions` 达 586MB / 48,880 文件。DevTools 监视项目目录，这种巨型 node_modules 树触发其文件监视反复重编译 + 刷新（先验尺：起 watcher 空转 18s 无自循环 → 排除构建死循环 → 定位到 DevTools 侧监视大目录）。
- 根治一：cpSync 加 `filter` 跳过 node_modules（产物 586MB → 92K），云函数依赖改由 DevTools「上传并部署:云端安装依赖」按 package.json 在云端装。这取代「node_modules 随源码 cpSync 进产物」旧做法（见上「emptyOutDir」条；旧法本为『所有文件』部署带依赖，现已不需要）。
- 现象二（云函数改了却不生效）：改了 `cloudfunctions/family/index.js` 源码、让用户部署，仍是旧行为。
- 根因二：`cloudfunctionRoot` 指向的是**产物里的拷贝** `dist/.../cloudfunctions/family`，DevTools 部署的是它，而它只在 vite `closeBundle`（每次构建）时才从源码刷新。改完源码若没重新构建，部署的是 dist 里的旧拷贝。
- 根治二：改云函数源码后**先 `npm run dev:mp-weixin` 重新构建**，确认 dist 拷贝已更新（`grep` 改动标记 / `diff` 源码与 dist 拷贝）再让用户部署。
- 教训：① DevTools「不停刷新」先怀疑产物里有无被监视的巨型目录（node_modules）；② 云函数部署链路是『源码 → 构建拷进 dist → DevTools 从 dist 部署』，漏了构建那步就在部署旧码。

## 自定义 tabBar 拿组件实例 selected 当导航判据 → 回「宠物」被吞（其它 tab 正常）· 2026-06-09
- 现象：4 tab 自定义 tabBar，从 时间线 / 健康 / 我的 点底部「宠物」回不到宠物档案页，点其它三个 tab 都正常。
- 根因：`switchTo` 早退守卫 `if (this.data.selected === idx) return` 把组件自身 `selected` 当导航闸门。`selected` 初值 0（宠物），而每个 tab 页各持一个独立 tabBar 实例，`attached` 触发 `syncFromRoute` 时 `getCurrentPages()` 可能尚未把新页压栈（时序问题），个别实例的 selected 残留默认 0 没被纠正。于是该页点「宠物」(idx 0) 撞 `0===0` 被吞，点 1/2/3 因不等于 0 正常 → 「偏偏宠物回不去」正是 idx 0 撞了默认值（先验尺：症状只在 idx 0 这一规整点出现，指向默认值而非随机 bug）。
- 根治：早退判据改用「真实当前路由」而非组件状态：`const cur = '/' + (getCurrentPages().slice(-1)[0].route||''); if (cur === page) return; wx.switchTab({url:page})`。即便 selected 残留，不在目标页就必跳，导航不再被吞。顺手删了 switchTab 前的 `setData({selected})`（this 是即将被隐藏的源页实例，改它看不见；且 switchTab 失败时反而误点亮一个没去成的 tab）。
- 教训：组件「每实例、带默认值」的状态别当跨页导航判据，要以真实路由 / 全局态为准。ADR-010 原话「attached 按 getCurrentPages 算 selected 即恒定正确」偏乐观，attached 时序下会残留默认值；高亮兜底交给目标页自己的 `pageLifetimes.show` 即可，但导航判据必须独立于它。

## parseRecord 复杂输入 20s 又超时（抽取字段变多后）→ 函数超时提到 60s + HTTP 45s · 2026-06-10
- 现象：录入「前天脚烂了去爱康医院查出嗜酸性肉芽肿，配迈微舒早晚各一颗吃一周，一共 1480」这类长复杂句，parseRecord 报 `-504003 FUNCTION_TIME_LIMIT_EXCEEDED`（20s 被杀，trace 跑到 18s+）。
- 根因：20s 是早期为简单录入定的上限；轮1 起抽取字段变多（加 hospital / cost / tag / desc，system prompt + few-shot 更长、输出 JSON 更大），叠加复杂多子句输入 + 冷启动 + 网关延迟，realistic 输入下 LLM 生成就 >20s。先验尺：超时值＝所配上限，属「真超时（工作量超限）」非假故障，往「给够时间」修而非反复重试。
- 根治：① 云函数超时控制台调到 **60s**（云函数 → parseRecord → 函数配置 → 超时时间；CLI 无此参数，改完 `cli cloud functions info` 看 timeout 验证）；② 代码 HTTP 请求 `timeout` 20000 → **45000**，须 < 云函数 60s，让 HTTP 先抛 gateway timeout 而非被云函数硬杀。
- 教训：LLM 类云函数超时要随 prompt / 输出复杂度留足头寸；以后再加抽取字段或扩 few-shot，记得回看超时是否够。

## 云函数 CLI 部署有解：@wxcloud/cli function:upload（推翻「只能 GUI」旧结论）· 2026-06-10
- 旧结论「CLI 部署签名失败 → 云函数部署走 GUI，别指望 CLI」只对 **DevTools 自带 CLI** 成立（IDE 签名通道被微信后端拒）。
- 新通道：`@wxcloud/cli`（npm 全局装，名义上是云托管 CLI，实际带 `function:upload` 能部署云开发云函数）。鉴权走 **CLI 密钥**（云开发控制台 → 设置 → 权限设置 生成，管理员扫码一次；**不需要开通云托管**，cloud.weixin.qq.com 的模板向导别点）。`wxcloud login -a <AppID> -k <密钥>` 后长期有效。
- 用法：`wxcloud function:upload cloudfunctions/<函数名> -e <envId> -n <函数名> --remoteNpmInstall`。直接传**源码目录**（绕开「改源码忘重构建、部署到旧 dist 拷贝」坑），云端装依赖自动忽略 node_modules，gitignore 的 config.local.js 会随包带上（机密只进私有云端，符合预期），轮询到 Active 才返回、失败会报错。
- 边界：CLI 只更新代码；**超时 / 内存等函数配置改不了，仍走控制台**（更新路径不碰这些配置，控制台调的值不会被部署覆盖）。注意 npm 直装可能拿到旧版 1.1.8（无 function:upload），要 `@wxcloud/cli@latest`（验证时为 2.3.3）。
- 2026-06-10 已用此通道部署 timeline / saveRecord / parseRecord 三函数验证通过。

## @wxcloud/cli 创建「新」云函数会崩（只可靠更新已存在函数）· 2026-06-10
- 现象：`wxcloud function:upload` 部署全新函数（attachment）报 `{"code":"ResourceNotFound.Function"}` + TypeError 崩出，函数没建出来；同批已存在函数全部更新成功。
- 根因：CLI 2.3.3 的 function:upload 在「判断函数是否存在」之前就先无条件轮询函数状态（waitFuncDeploy），新函数查无此函数 → 内部异常处理有 bug，走不到后面的 scfCreateFunction 创建路径。
- 结论 / 操作：**新云函数首次用 DevTools GUI「上传并部署:云端安装依赖」创建**（GUI 部署的是 dist 拷贝，记得先重构建），创建后续更新一律走 CLI；新函数默认超时 3s，按需控制台调（attachment 要做 getTempFileURL + HEAD 体积复核，建议 30s）。

## 历史导入执行三连坑（超时 3s / clear 误删 staged 附件 / 新集合未建）· 2026-06-11
- 坑1：importNotion 新函数 GUI 首建后默认超时 3s，import 写 220 条必被杀（`Invoking task timed out after 3 seconds`）。一次性导入函数建好第一时间控制台调 60s。
- 坑2（最隐蔽）：**partial import（中途超时）后再跑 clear，会把半写入记录引用的 staged 附件当「旧家庭文件」级联删掉**（clear 的 collectFileIDs 按记录附件收集 fileID，分不清新旧）。表现为下轮 import 报 ATT_MISSING。恢复：本地 staged 重传。教训：导入失败后**别先 clear**，先靠 NOT_EMPTY 护栏判断状态；或 clear 前确认无半写入记录。
- 坑3：微信云开发**集合不会被 add 自动创建**，新集合（foods）没人建过则 import 写入直接抛 `-502005 Db or Table not exist`。所有「第一次写新集合」的云函数路径都要 `db.createCollection(x).catch(()=>{})` 兜底（foods 函数有，importNotion 漏了）。
- 附带：`wxcloud storage:upload <本地> -r <远程>` 的 `-r` 是**目录语义**，传完整对象键会变成 `键/文件名` 双层；重传单文件也要按目录传。
- 恢复模式：与其 clear 重导（要重传全部附件），不如给导入函数加**精准续传 / 修复动作**（import_foods / backfill_weight / fix_times）+ 只读 stats 体检（计数 + 不变量校验），每步幂等、可重跑、不碰云存储。

## 微信 canvas 2d 物理尺寸有单边上限，宽画布不夹紧真机白屏 · 2026-06-11
- 现象（评审 HIGH 提前拦截）：体重曲线改横滑后画布宽随点数线性涨（56px/点），canvas.width = cssW × dpr 无上限；27 个点 × dpr3 = 4440 物理像素，超微信 canvas 2d 单边上限（官方文档 1365×1365，社区实测 ~4096）整块白屏 / 绘制失败，安卓过大还会 crash。
- 根治：物理宽夹紧 `physW = Math.min(W * dpr, 4000)`，`ctx.scale(physW / W, dpr)` 横向降采样（点多轻微变糊可接受，白屏不可接受）。
- 教训：任何「内容驱动画布变宽 / 变高」的 canvas（长图、横滑图表、海报）都要夹物理尺寸；这是文档化硬上限不是个别机型怪癖（painter 等海报库都硬限 4096）。

## 数据迁移验收：拉实时源全量 diff，别只信导出快照 · 2026-06-11
- 模式：用户感觉「有些数据不正确」时，不逐条人肉对，用 Notion MCP（或源系统 API）把**实时数据全量拉回**（workflow 并行分批，9 宠 + 219 记录 + 12 主粮 = 240 页 4 分钟），本地脚本逐字段 diff 导入产物。
- 假阳性先归一再下结论：换行（`<br>` vs `\n`）、有意的转换规则（驱虫 tag 归一、合成 desc）、同宠同日多记录的匹配错位（按字段打分选最优而非先到先得）。
- 真问题往往在快照之外：CSV 尾部空行混入全空记录；**源头本身就漏数据**（2 条体重记录 Notion 里就没填日期，要用户决策而非代码兜底，相邻页面 ID + 快照时间可锚定大致日期辅助回忆）；时间语义约定（缺时间默认 12:00 而非 00:00，否则同日排序乱）。
- 导出快照（CSV）会过期：核对一律以实时源为准；data.json / transform 同步修，保证未来重放与线上终态一致。

## 派生日期字段口径不对齐：time 升到分后 latest_weight_date 必须 slice · 2026-06-18
- 根因：ADR-018 把 `records.time` 升到分（`YYYY-MM-DD HH:mm`），但派生标量 `pets.latest_weight_date` 仍是纯日期（供与写侧做字典序比较）。写侧 saveRecord 落值时 `slice(0,10)` 是对的，删侧 attachment `recomputeLatestWeight` 却两处漏 slice：① 守卫 `latest_weight_date !== rec.time` 拿纯日期比含到分（恒不等 → 删真·最新体重记录跳过重算、留指向已删记录的幽灵值）；② 回写直接灌含到分 `latest.time` 污染字段（后续写侧 `wDate >= latest_weight_date` 永假 → 同日合法新体重静默不回写）。
- 教训：**一个时间字段升格（加时刻 / 改格式），所有从它派生或与它比较的字段都要审一遍口径**；尤其派生标量散落在「写侧 + 删侧 + 导入回填」多处，抽一个 `toDate()` 工具多处共用、别各写各的。**回归测试要带「到分 time」**（旧用例全用纯日期 seed，两侧恰好相等绕过生产路径、绿灯掩盖 bug）。修复 commit 5befbd3，详见 DECISIONS ADR-025 as-built。

## UI 图标系统统一的三个验证坑（emoji 换图标轮，ADR-026）· 2026-06-18
落图标系统时踩 / 验出三个会骗人的点（症状太规整、先验尺别盲信工具）：
- **uni-app mp-weixin 把静态 `src` 路径外提到 `common/assets.js`**：模板 `<image src="/static/icon/fn-weight.png">` 编译后 wxml 变成 `src="{{r.j}}"`（绑定变量），路径常量统一 hoist 进 `common/assets.js`，**不在页面 .js / .wxml 里**。grep 页面产物找不到路径串一度误判「引用没编进去」→ 与已知 device 能用的 clipboard.png 一比，两者同在 common/assets.js、同机制，虚惊。验图标引用要扫 `common/assets.js`，别只扫 pages。
- **dev 与 build 的 wxss 压缩态不同**：`build:mp-weixin` 压缩成 `.ic{...}`，`dev:mp-weixin` 不压缩是 `.ic {...}`（带空格）。起后台轮询等 dist/dev 编译落地、marker 写成压缩态 `ic{` → 在 dev 产物里永不匹配 → **假超时**。验 dev 产物 class 用宽松匹配（`.ic[ {]`）。DevTools 导入 dist/dev（非 dist/build）。
- **`rg -oh` 的 `-h` 被当成 `--help`**：想 `rg -o --no-filename` 写成 `rg -oh`，rg 把 `-h` 解析为 `--help` 吐帮助文档淹没真输出，一度以为「所有引用都缺失」。rg 的 `-h` = help，no-filename 用 `--no-filename`。
- 图标素材管线（可复用）：Iconify API 取 SVG（`fluent-emoji-flat` 原色 / `ph` duotone `?color=` 暖染）→ headless Chrome `--default-background-color=00000000` 栅格透明 PNG（比 floodfill 抠图干净）；批量取图用 curl `-K` 配置文件**单进程 keepalive**（突发并发会被 CDN reset）；Chrome 截图后因 GoogleUpdater 不退出会卡到超时，但**截图其实已写出**，subprocess timeout 兜底 + 后续单独 PIL 切图即可。

## 语音录入调研：微信 / 腾讯云三条路全堵，暂缓（已回退代码）· 2026-06-26
目标 = 三入口卡「语音」占位转正（按住说话 → 转文字 → 落 NL 输入框走现有 parseRecord，后端零改）。一整轮做下来三条路全堵，最终**回退全部代码**（record.vue / manifest / `cloudfunctions/asr` 都还原，git 工作树回到 0.4.10 干净态），教训记此供未来重启：
- **三路全堵**：
  - ① **微信「同声传译」插件**（`getRecordRecognitionManager`，曾选）：**个人主体小程序加不了** ,插件类目「IT科技 > 软件服务提供商」个人主体无此类目，后台「插件管理」搜「微信同声传译 / 同声传译 / WechatSI / 插件 ID」全无结果（开放社区多帖证）。
  - ② **微信服务市场「一句话识别」接口能力**（client `wx.serviceMarket.invokeService`）：已购免费档（1000 次 / 月），但调用恒返 `errMsg:"invokeService:ok"` + `data:""` **opaque 空**，requestId 前缀半固定。逐项验尺全排除（外网 curl 验音频确是 16k 单声道 mp3 + URL 公网可下载、`afinfo` 验格式对、URL 编码 / 不编码都试、`SourceType:0`(URL) 与 `SourceType:1`(base64) 都试、`DataLen` 从 0 改真实字节也试）→ 客户端不可定位（服务端吞成空、零错误码）。疑个人主体墙 or 我从博客猜的 `service`/`api`（接口能力文档无显式 service/api，真值我没查到）不对。
  - ③ **腾讯云直连 ASR**（云函数 + `tencentcloud-sdk-nodejs-asr` + SecretId/Key）：**搭通到「只差开通」** ,本地冒烟（真机那段录音 base64 + SDK `SentenceRecognition`）一把拿到真实错误 `FailedOperation.UserNotRegistered / User is unopened [biz:ASR_OneSentence]` = 腾讯云一句话识别产品**未开通**；而开通要付费（无免费额度，虽单价极低约 ¥0.002 / 次）→ 用户选暂缓。
- **教训**：
  - **个人主体在微信插件 / 服务市场这套上反复撞墙**（插件按类目加不了、接口能力 opaque 返空），做依赖微信生态第三方能力的功能前**先验「个人主体能不能用」**（同 cropImage / showModal 那类先验尺）。
  - **微信服务市场「接口能力」≠ 腾讯云产品开通**：两条独立线、互不通用；买了服务市场版也不能让腾讯云直连 SDK 用，反之亦然。
  - **opaque 失败（client 返空无错误码）→ 早点上服务端中转**：云函数 + 官方 SDK 直连**一次就拿到真实错误码**（`User is unopened`），客户端绕了 N 轮的空响应在服务端一目了然。「服务端给真错误」就是它最大价值，别在 opaque 客户端死磕。
  - **验尺管线（可复用）**：云存储临时 URL 外网 `curl -I` 验可达 + `afinfo` 验真实采样率 / 声道；`getRecorderManager` 录音真机才准（模拟器不准，同 cropImage）；base64 直传可绕开签名 URL；`DataLen` 是原始字节数非 base64 长度。
  - **密钥红线守住**：腾讯云 SecretId/Key 全程没经我手，只用户贴进 `config.local.js`（gitignore，`**/config.local.*` 已覆盖），代码只 `process.env` / `require` 读、不打印。
- **重启选项（供未来）**：① 腾讯云直连付费（asr 云函数代码在本会话历史，极便宜、开通即用，含 `SentenceRecognition` `SourceType:1` 直传 base64 + `DataLen`=原始字节）；② 免费 ASR（百度 / 讯飞，要新账号 + 重写对接）；③ 键盘自带语音（零成本兜底，牺牲专属「按住说话」按钮，点输入框用键盘麦）；④ 迁企业主体后重试插件 / 服务市场。

### 续：服务端通道走穿，路②确诊为「坏掉的代理壳」+ 决定走键盘语音（ADR-036）· 2026-06-28
2026-06-26 留的疑点「`service`/`api` 是我从博客猜的、可能不对」**本轮证伪**：Service ID `wxa8386175898e12c9` + API Name `SentenceASR` 经服务市场官方服务详情页（`fuwu.weixin.qq.com/service/detail/0008222a430fb072202a8e0625bc15` 的「接入文档」tab）逐字核对**完全正确**。本轮把上轮没试的**服务端通道 `wxa/servicemarket`**（探针 `tools/wxdump/asr_*.mjs`，相对客户端 opaque 空的优势＝**返真错误码**）走穿，彻底定性：
- **信封格式已钉死**：`POST https://api.weixin.qq.com/wxa/servicemarket?access_token=` body=`{service, api, client_msg_id, data:{Action:SentenceRecognitionWX, EngSerViceType:16k_zh, VoiceFormat, UsrAudioKey, SourceType, Url|Data+DataLen}}`。缺 `client_msg_id`→`9301001 invalid parameter`；`data` 传字符串→`9301003 internal exception`；`data` 必须对象。
- **三通道全死（确诊、非偶发）**：① 服务端同步 10+ 发 100% `9301002 call api service failed`（base64 直传 / URL 原文 / URL 编码 / 数字 key 全试遍；云存储上传→`batchdownloadfile` 取临时 URL→识别全链路通、临时 URL 实测 `200 + audio/x-wav`）；② 客户端 `invokeService` 真机复现 `ok`+`data:""`+requestId（与 0626 一致）；③ 异步 `async:true`→`9301013 api type not match`（SentenceASR **不支持异步**，故客户端那个空 ≠ 异步待取），retrieve 该 requestId→`9301014 invalid request id`。
- **`9301002` 官方定性**＝网关已收信封、转上游腾讯云 ASR、**上游执行失败**的透传码（社区置顶帖多人复现、官方仅答「重试」、已购额度足也报）。即**坏的是微信这层代理壳、我方参数全对**。4-agent 调研 workflow + 官方文档 + 社区交叉判 `serverSideVerdict=supported`（非 client-only），根因＝上游 / 服务态。
- **决定（ADR-036）**：弃微信服务市场该服务（三通道死透），**先走键盘自带语音**（`record.vue`「语音」入口转正＝`:focus` 聚焦 NL 输入框弹系统键盘、用键盘 🎤 听写、文字走现有 parseRecord、**零后端**）；腾讯云直连（真身、绕开坏代理、¥0.002/次）留作未来升级。
- **教训补**：① 「客户端 opaque 空」别停在客户端，**上服务端 `wxa/servicemarket` 拿真错误码**（这次正是它把「我参数错」证伪、把「服务壳坏」坐实）；② `service`/`api` 别从博客猜，**服务详情页「接入文档」有权威 Service ID / API Name**；③ JS 渲染反爬页（开放社区置顶帖）正文抓不到时，**让用户导 PDF / 截图**比硬抓高效；④ 探针 `tools/wxdump/asr_*.mjs` 留仓，重启 / 复现直接跑（AppSecret 运行时读 `config.local.json`、不入脚本）。
