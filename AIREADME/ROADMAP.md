# ROADMAP — PetsLog
<!-- 节奏。不放可执行 TODO 颗粒(→项目 TODO 系统)，只放方向。 -->

## Now（当前焦点 · 2026-06-08）
正在做「家庭 + 用户」多租户改造（见 DECISIONS ADR-008）：隔离键 openid → family，支撑多宠家庭多人协作。分三轮：地基（families / family_members / invites 集合 + family 云函数 + 鉴权守卫）→ 打通隔离（重构 6 函数加 family_id + 鉴权 + onboarding 自动建个人家庭）→ 协作 UI（家庭切换 / 管理 / 邀请码）。
此前已落地（MVP + 增强 + UI）：自然语言录入 → 解析（record / med_stock / reminder 三分流）→ 时间线 / 卡片 / 药品 / 提醒；宠物档案编辑、体重曲线、提醒（站内）、截图给兽医；整体「温暖治愈」UI 设计系统（ADR-007）。开源收口完成（MIT public）。

## Next（MVP 内测完善 · 1-2 个月）
- 邀请身边多宠家庭朋友内测，收集真实语料。
- AI 解析准确率调优（目标 ≥ 90%）：扩充 prompt few-shot、跑实测集。
- 提醒真推送：申请微信订阅消息模板 + 定时触发器，到期主动 push（见 ADR-006）。
- 测试 token 轮换为正式 token（隔离用量）。
- 真机回归两处 canvas（体重曲线 / 兽医小结图）渲染与导出。

## Later
- 一键医生病历总结（AI 汇总病史）/ 多设备云同步 / 宠物头像照片上传。
- 商业化：企业主体迁移 + 微信支付 + 会员订阅。
- 全平台扩展（Android / iOS，uni-app 同套代码）。
- 小红书 / 抖音推广。

## 已搁置（+原因）
- **自建云服务器后端**：搁置。无可用 ICP 备案域名（小程序强制要求）+ 无非自建不可的硬诉求 → 选微信云开发。见 DECISIONS ADR-002。
- **微信机器人 + Notion**：否决。封号风险 + Notion 海外不稳 + 无法商业化 / 多租户。见 DECISIONS ADR-001。
