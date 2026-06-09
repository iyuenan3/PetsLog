# CHANGELOG — PetsLog
<!-- 版本史，倒序，append-only。为何→DECISIONS；未来→ROADMAP；commit 流水→git；踩坑→MEMORY。 -->

> 仍为内测开发期，未正式 release；下方按里程碑记录主要进展。

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
