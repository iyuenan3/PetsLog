# CHANGELOG — PetsLog
<!-- 版本史，倒序，append-only。为何→DECISIONS；未来→ROADMAP；commit 流水→git；踩坑→MEMORY。 -->

> 仍为内测开发期，未正式 release；下方按里程碑记录主要进展。

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
