# CHANGELOG — PetsLog
<!-- 版本史，倒序，append-only。为何→DECISIONS；未来→ROADMAP；commit 流水→git；踩坑→MEMORY。 -->

> 仍为内测开发期，未正式 release；下方按里程碑记录主要进展。

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
- Changed: 体重曲线重做：等间距（每点 ≥56px）+ scroll-view 横滑（固定 y 轴不随滑动跑）+ 默认滚到最新（实测滚动偏移二次校验，绕开同值赋值不生效）+ 日期标签按间距挑点画（≥70px，带日防同月重复）。**canvas 物理宽夹紧 ≤4000px**：微信 canvas 2d 有单边上限（文档 1365×1365，实测 ~4096），乔治 27 个体重点 × dpr3 = 4440 已越线，不夹真机整块白屏（评审 HIGH）。
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
