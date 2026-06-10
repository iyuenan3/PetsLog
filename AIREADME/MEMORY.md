# MEMORY — PetsLog
<!-- 踩坑/失败/事故，append-only。别重复踩坑。决策→DECISIONS。 -->

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
> - 云函数调自签网关用 https `ca` 选项（PEM 文本）即可信任，无需 `rejectUnauthorized:false`（本会话实测 auto-llm 调通）。
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
