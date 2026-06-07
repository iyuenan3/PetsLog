// 前端可公开配置（非机密）。LLM 网关 endpoint / token / CA 等机密只在云函数环境变量里，绝不放前端。

// 微信云开发环境 ID。建好免费云环境后填入，形如 'petslog-dev-3xxxxxxx'。
// 注意：环境 ID 非机密，可入库。
export const CLOUD_ENV = ''

// 每用户每日 AI 解析次数（前端展示用；真正的限流在云函数侧二次校验）。
export const DAILY_PARSE_LIMIT = 50
