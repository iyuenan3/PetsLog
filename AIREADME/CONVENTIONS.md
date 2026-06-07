# CONVENTIONS — PetsLog
<!-- 本项目特有约定。共享/通用基线只链过去，不抄。 -->

⚑ 编码约定待 MVP 动手时定稿（uni-app + 微信云函数）。立项阶段先记已知方向：

## 命名
⚑ 待定。云数据库集合暂定 `pets` / `records` / `meds`（见 ARCHITECTURE）。

## 偏好模式
- LLM 调用统一收敛到单个云函数 / 工具模块，便于换模型、加频率限制、改 prompt。
- AI 输出强制 JSON，云函数侧做 schema 校验 + 失败兜底（返回「无效记录」而非脏数据入库）。

## 禁用模式
- 不在前端写任何 LLM 调用 / key（见 CORE 红线 + ARCHITECTURE 禁改项）。
- 不放开 AI 自由对话（严守「结构化提取机器」定位）。
