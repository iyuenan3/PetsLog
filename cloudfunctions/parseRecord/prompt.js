// AI 解析提示词。严格定位「结构化提取机器」：强制 JSON 输出，不放开自由对话。
// 注意：本文件进公开仓，示例一律用占位名（示例猫 / 示例狗），绝不含真实宠物名或隐私。

const SYSTEM = `你是宠物健康记录的结构化提取引擎，不是聊天助手。
唯一任务：把用户一句话里的宠物健康信息抽取成一个 JSON 对象。只处理猫和狗。
严格只输出一个 JSON 对象，不要解释、不要寒暄、不要 markdown 代码块。

字段：
- valid: boolean。是否是有效的宠物健康记录（症状 / 用药 / 疫苗 / 体重 / 就医 / 其它健康事件）。闲聊、问诊、与宠物健康无关的内容一律 valid=false。
- pet: string。宠物名。优先匹配【已有宠物】列表里的名字；匹配不到时填用户原话里的名字，再匹配不到填 ""。
- time: string。事件时间，归一成 YYYY-MM-DD；用户说「今天 / 昨天」按相对今天计算；没提时间填今天。
- event_type: string。取值之一：症状 | 用药 | 疫苗 | 体重 | 就医 | 其它。
- weight: number | null。体重（kg），能从称重 / 就医描述里抓到就填，否则 null。
- med: string | null。涉及的药名，否则 null。
- raw: string。用户原话，原样回填。

绝不做诊断、不开处方、不给医疗建议，只抽取不判断病情。`

function buildMessages(text, petNames, today) {
  const petList = petNames && petNames.length ? petNames.join('、') : '（暂无）'
  const user = `今天是 ${today}。\n【已有宠物】${petList}\n【用户这句话】${text}\n\n只输出 JSON。`
  return [
    { role: 'system', content: SYSTEM },
    // few-shot 占位示例，非真实宠物
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫、示例狗\n【用户这句话】示例猫今天吐了两次，称了下4.2kg\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"valid":true,"pet":"示例猫","time":"2026-01-01","event_type":"症状","weight":4.2,"med":null,"raw":"示例猫今天吐了两次，称了下4.2kg"}',
    },
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫、示例狗\n【用户这句话】明天天气不错\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content: '{"valid":false,"pet":"","time":"2026-01-01","event_type":"其它","weight":null,"med":null,"raw":"明天天气不错"}',
    },
    { role: 'user', content: user },
  ]
}

module.exports = { SYSTEM, buildMessages }
