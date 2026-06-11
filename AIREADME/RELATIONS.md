# RELATIONS — PetsLog
<!-- 生态连接。共享底座写在属主项目，这里只指向属主。仓库公开 → 私有项目坐标抽象化。 -->

## 出向依赖（我用了谁）
| 依赖 | 用途 | 备注 |
|---|---|---|
| 火山方舟 Coding Plan | 云函数 POST `/api/coding/v3/chat/completions` 做自然语言 → JSON 结构化（OpenAI 兼容，doubao-seed-2.0-pro，ADR-016）| 官方云服务，唯一机密 API Key 不入库（见 DEPLOYMENT）|
| 微信云开发 | Serverless 后端（云函数 + 云数据库 + 云存储 + 自带登录态）| 第三方平台 |

## 入向（谁用我）
- 个人作品集页（展示用，best-effort）：非代码依赖。

## 共享底座 / 复用资产
- PetsLog 不拥有任何被他人复用的共享底座。
