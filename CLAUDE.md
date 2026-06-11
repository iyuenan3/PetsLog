# CLAUDE.md — PetsLog
> 多宠家庭 AI 健康记录工具（微信小程序 · 自然语言录入 → AI 结构化归档）｜ Maxwell
> 真相源 = `AIREADME/`。本文件只做 router：状态 / 路由 / 红线指针 / 维护责任 / 命令 / 元信息。

## 当前状态（2026-06-11）
- **MVP 主链路 + 增强 + UI + 家庭多租户 + 个人中心 + 底部导航重构 + 字段扩展轮1 + 附件轮2 + 轮3（身价/简介/foods/历史导入）+ 轮4（录入防错别字/头像 emoji/手动建宠）均已落地（真机内测，版本 0.4.2）**。栈：uni-app（mp-weixin）+ 微信云开发（11 云函数 + 11 集合 + 云存储，env cloud1-…）+ 自建 OpenAI 兼容 LLM 网关（默认 auto-llm）。
- 增强：宠物档案编辑、体重曲线、用药·疫苗·驱虫提醒（站内）、一键截图给兽医；UI 走「温暖治愈」设计系统（CSS 令牌挂 page），见 `AIREADME/DECISIONS` ADR-006/007。
- 导航：底部 5 tab → 4 tab（宠物 / 时间线 / 健康 / 我的）+ 中央凸起「＋」全局录入键（自定义 tabBar）；提醒 + 药品合并「健康」分段页；录入从首页常驻输入条迁到独立录入页，见 ADR-010。家庭成员名 / 头像读时关联个人档案（users）。
- 字段扩展轮1（v0.3.1）：records 加就诊医院 / 费用 / 病程标签（双轴，时间线可按病程筛）+ event_type 增驱虫第 7 桶；pets 加到家日期 / 备注 / 头像，见 ADR-012/013。
- 附件轮2（v0.3.2）：记录挂图片 / 视频 / PDF（attachment 云函数服务端复核真实体积；配额：单条 ≤9、家庭 ≤1GB、日 ≤200MB）；录入卡片 + 新记录详情页双入口；缩略图省 CDN；删记录 / 解散家庭 / 换头像级联清理云存储，见 ADR-011。
- 轮3（v0.4.0/0.4.1）：pets 加初始身价 / 简介（当前身价前端派生）+ foods 主粮模块（集合 + 云函数 + 健康页台账）+ Notion 历史导入，见 ADR-014。**导入已执行完毕**（库内终态 9 宠 / 217 记录 / 12 主粮 / 46 附件，经 Notion MCP 实时全量核对 + fix_times 清洗，created_at 统一「事件日期 + 12:00」，stats 体检全绿）。体重曲线横滑重做（等间距 + canvas 物理宽夹紧防白屏）。
- 轮4（v0.4.2）：录入防错别字（建档凭意图不凭名字：parse 层归一 + 确认卡片选宠 + saveRecord PET_UNKNOWN 零写入，reminder 同防线）+ 头像 emoji 自定义（照片 > 自选 emoji > 物种默认）+ 手动建宠入口（网格 ＋ 卡片 → pet.vue mode=new），见 ADR-015。
- 三阶段演进：v1 Cursor（已下线）→ v2 OpenClaw（未上生产）→ v3 本仓库。详见 `AIREADME/CORE`。
- 下一步：真机回归（轮3：体重曲线横滑 / 附件打开 / 主粮台账 / 兽医小结；轮4：错别字选宠 / 建档意图 / emoji 头像 / 手动建宠）；邀友内测 + 解析准确率调优 + 提醒真推送（订阅消息）+ token 轮换。见 `AIREADME/ROADMAP`。
- **本仓库已开源**（MIT · github.com/iyuenan3/petslog）：仅放架构 / 产品设计 / prompt；完整商业代码 / key / 部署配置不入库。

## 加载路由（任务 → AIREADME/）
- 跨项目了解 / 红线 → `CORE` + `RELATIONS`
- 改架构 / 选型 → `ARCHITECTURE` + `DECISIONS`
- 加功能 / 产品意图 → `PRD` + `ROADMAP` + `CONVENTIONS`
- 部署 / 运维 → `DEPLOYMENT`
- 节奏 → `ROADMAP`；踩坑 → `MEMORY`；版本史 → `CHANGELOG`

## 红线（详见 AIREADME/CORE「绝不」）
- 不碰医疗诊断 / 处方（严守工具属性）。
- **宠物口径仅猫狗**：产品 / 文档对外一律以猫狗为准，不纳入其它宠物类型。
- LLM key 不进前端（走云函数环境变量）。
- **私有部署坐标不入库**：LLM 网关 endpoint / 自签 CA / token 走私有配置，绝不进公开仓库。
- LLM 网关 root CA 在属主侧不可轮换，变更须联动本项目。

## 维护责任（什么变 → 更新哪个）
架构·选型→ARCHITECTURE（+ DECISIONS 记理由）｜部署·入口→DEPLOYMENT｜产品方向→PRD｜接口→SPEC｜优先级→ROADMAP｜踩坑→MEMORY｜release→CHANGELOG。append-only 三件套（DECISIONS / MEMORY / CHANGELOG）只追加。

## 常用命令
```bash
npm run dev:mp-weixin   # 编译+监听 → 产物 dist/dev/mp-weixin（微信开发者工具导入此目录）
wxcloud function:upload cloudfunctions/<函数名> -e cloud1-d5g69cxtta6c18918 -n <函数名> --remoteNpmInstall
                        # 云函数部署首选（@wxcloud/cli，传源码目录、云端装依赖；登录态已配，超时/内存仍走控制台，见 AIREADME/MEMORY）
# 兜底：DevTools GUI「上传并部署:云端安装依赖」（DevTools 自带 CLI 签名失败不可用）
# 网关机密在 cloudfunctions/parseRecord/config.local.js（gitignore，不入库）
```

## 元信息
- 立项 v3：2026-06-07（AIREADME 体系铺底）。
- 历史仓库：Cursor-PetsLog（v1）/ OpenClaw-PetsLog（v2），见 AIREADME/CORE。
- 开源仓：github.com/iyuenan3/petslog（MIT · public）；架构 + 产品 + prompt 公开，完整代码私有。
