# AGENTS.md

本文件是 `petslog` 的 Codex 启动入口。项目真相源位于 `AIREADME/`，开始工作前先读 `AIREADME/INDEX.md`。

## 启动顺序

1. 读本文件。
2. 按任务读取对应 AIREADME 文档。
3. 修改前以当前代码、云端真实状态、Git 状态和测试结果校验文档。
4. 需要跨会话历史时，使用 `stash` Skill 解析仓库外的项目记忆。

## 任务路由

| 任务 | 必读 |
|---|---|
| 了解产品、边界与依赖 | `AIREADME/CORE.md` + `AIREADME/RELATIONS.md` |
| 修改云函数、集合或数据流 | `AIREADME/ARCHITECTURE.md` + `AIREADME/SPEC.md` + `AIREADME/DECISIONS.md` |
| 修改功能、交互或字段 | `AIREADME/PRD.md` + `AIREADME/ROADMAP.md` + `AIREADME/CONVENTIONS.md` |
| 构建与云端部署 | `AIREADME/DEPLOYMENT.md` + `AIREADME/MEMORY.md` |
| 版本、事故与历史教训 | `AIREADME/CHANGELOG.md` + `AIREADME/MEMORY.md` |

## 红线

- LLM key、微信凭证、用户数据和本地配置绝不进入 Git、前端或文档。
- 所有家庭数据读写都必须显式校验租户隔离和成员权限。
- 物种枚举、事件类型和共享校验逻辑变更必须同步全部调用点。
- 云端部署和数据修复属于外部状态变更，执行前必须取得用户明确授权。
- 保留用户现有改动，只暂存本任务明确修改的路径。

## 常用验证

```bash
npm run dev:mp-weixin
```

云函数上传、集合变更、真实数据扫描和真机操作前，先读 `AIREADME/DEPLOYMENT.md` 与相关事故记录。密钥只能位于被忽略的本地配置中。

## AIREADME 维护

- 数据字典与接口变化更新 `SPEC.md`，结构变化更新 `ARCHITECTURE.md`。
- 决策、事故和版本分别追加到 `DECISIONS.md`、`MEMORY.md`、`CHANGELOG.md`。
- 最后刷新 `INDEX.md` 的状态摘要和同步锚点，并运行 AIREADME 检查。
- `CLAUDE.md` 保留给旧 Claude 客户端兼容，Codex 以本文件为入口。
