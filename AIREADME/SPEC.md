# SPEC — PetsLog
<!-- 对外契约：别人集成你需要的精确接口。不写实现(→ARCHITECTURE)/为何这么设计(→DECISIONS)。 -->

— N/A。

PetsLog 是终端产品（微信小程序），不对外暴露 API、不被其它系统集成，是 LLM 网关的**消费方**而非被集成方。

相关契约落点：
- 消费的上游契约（自建 LLM 网关端点 / 鉴权 / 模型）→ OpenAI 兼容；私有部署坐标见私有配置，架构见本项目 ARCHITECTURE 数据流。
- AI 自然语言 → 结构化的 JSON schema（云函数与 LLM 之间的内部数据形状）→ 见 PRD「AI 解析字段」+ ARCHITECTURE。

> 若未来开放第三方接入（如对接宠物医院 / 导出 API），在此填端点 + 鉴权 + 版本兼容。
