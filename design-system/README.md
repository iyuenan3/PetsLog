# PetsLog 设计系统镜像（Claude Design）

把 PetsLog（mp-weixin）的「温暖治愈」设计体系**逐字镜像成 HTML 组件库**，同步到 [claude.ai/design](https://claude.ai/design) 当**单一可视真相源**，用来在一块画布上看全体系、揪不一致、迭代优化，再把结论**人工翻译回**小程序代码。

> ⚠ **不是双向代码同步**：PetsLog 渲染是 WXML/WXSS + canvas，Claude Design 是 HTML/CSS。这套镜像是「设计工作室」，优化定稿后须手动落回 `src/App.vue` 令牌 + 各页 WXSS + `src/petCard.js`，并**真机复验**（HTML ≠ mp 渲染）。

## 结构
```
design-system/
  tokens.css        # 全设计令牌真相源副本（逐字镜像 App.vue page{}）
  components.css     # 全局 + health 页组件类镜像（rpx→px）
  _frame.css         # 规范卡外壳（标注/舞台/手机框，非产品样式）
  tokens/            # @dsCard group="Foundations" ,colors / typography / spacing-radius / elevation / icons
  components/        # @dsCard group="Components" ,buttons / cards / chips / empty / timeline-item /
                     #   reminder-card / medicine-card / food-card / segmented / form-sheet / tabbar / pet-card
  screens/           # @dsCard group="Screens"  ,home / timeline / health / record / pet-detail / course
  assets/            # 真实图标(27) + 物种头像(8)，从 src/static 拷入
  DRIFT.md           # 整理产出：跨页/重复/漂移清单 + 收敛施工单（本次优化实体）
```

## 约定
- **令牌同名同值**：HTML CSS 变量名与 `App.vue` 完全一致，值逐字复制。**单位 1px ≙ 1rpx**（画布按 750px 逻辑宽 = 全屏宽绘制，数字照抄、零换算），颜色/渐变不变。双向翻译因此不引入换算误差。
- **每个预览 `.html` 首行**必须是 `<!-- @dsCard group="…" -->`（Claude Design 据此建卡片索引）。
- **只用占位**：示例猫 / 示例犬 / 示例龟 / 示例鱼 / 幸福宠物医院等。**绝不**放真实宠物名 / 家庭名 / 真名（会推到外部服务 + 可能进公开仓）。
- 档案卡（`components/pet-card.html` + home/pet-detail 内）是 **canvas 的 HTML 静态参照**，真相源在 `src/petCard.js`，比例近似，改它须回写。

## 同步到 Claude Design
用 `/design-sync` skill（底层 DesignSync 工具）：`list_projects` 选已有或 `create_project`（名「PetsLog 设计系统」）→ `finalize_plan`（localDir = 本目录）→ `write_files`。增量、一次一组，不整体替换。首次需 claude.ai/design 登录态（无则 `/design-login`）。

## 本地预览 / 自验（免上云）
headless Chrome 出图核对：
```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size=830,1780 --screenshot=/tmp/out.png \
  "file://$PWD/screens/home.html"
```

## 优化闭环
建镜像 → `/design-sync` 上云 → 在 Claude Design 画布上看全 + 改 `DRIFT.md` 各条 → 翻译回 `App.vue`/各页 WXSS/`petCard.js` → `npm run dev:mp-weixin` + DevTools + 真机复验。
