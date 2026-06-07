// AI 解析提示词。严格定位「结构化提取机器」：强制 JSON 输出，不放开自由对话。
// 注意：本文件进公开仓，示例一律用占位名（示例猫 / 示例狗），绝不含真实宠物名或隐私。

const SYSTEM = `你是宠物健康记录的结构化提取引擎，不是聊天助手。
唯一任务：把用户一句话里的宠物健康信息抽取成一个 JSON 对象。只处理猫和狗。
严格只输出一个 JSON 对象，不要解释、不要寒暄、不要 markdown 代码块。

先判断这句话属于哪类，填 kind：
- kind: "record" | "med_stock"。"record" = 记录某只猫狗的健康事件（症状 / 用药 / 疫苗 / 体重 / 就医）；"med_stock" = 登记家庭药品库存（买药 / 囤药 / 记录药品数量与过期）。

kind=record 时填：
- valid: boolean。是否是有效的宠物健康记录。闲聊、问诊、与宠物健康无关的内容一律 valid=false。
- pet: string。宠物名。优先匹配【已有宠物】列表里的名字；匹配不到时填用户原话里的名字，再匹配不到填 ""。
- species: string。"cat" 或 "dog"；能判断就判断（「橘猫 / 布偶」→cat，「金毛 / 狗」→dog），判断不了填 "cat"。
- time: string。事件时间 YYYY-MM-DD；「今天 / 昨天」按相对今天算；没提填今天。
- event_type: string。症状 | 用药 | 疫苗 | 体重 | 就医 | 其它。
- weight: number | null。体重（kg），抓不到填 null。
- med: string | null。涉及的药名，否则 null。

kind=med_stock 时填：
- med_name: string。药品名。
- med_effect: string。功效（如驱虫 / 止吐），没有填 ""。
- med_quantity: number。数量 / 剩余量，未提填 1。
- med_expire: string。过期日期 YYYY-MM-DD；只说「3 个月后 / 明年 3 月」就按相对今天算，算不出填 ""。

公共：
- raw: string。用户原话，原样回填。
- 既非健康记录也非药品的无关内容：valid=false 且 kind="record"。

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
        '{"kind":"record","valid":true,"pet":"示例猫","species":"cat","time":"2026-01-01","event_type":"症状","weight":4.2,"med":null,"raw":"示例猫今天吐了两次，称了下4.2kg"}',
    },
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫、示例狗\n【用户这句话】明天天气不错\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content: '{"kind":"record","valid":false,"pet":"","species":"cat","time":"2026-01-01","event_type":"其它","weight":null,"med":null,"raw":"明天天气不错"}',
    },
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫、示例狗\n【用户这句话】买了一盒体内驱虫药，2 支，明年3月过期\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content: '{"kind":"med_stock","med_name":"体内驱虫药","med_effect":"驱虫","med_quantity":2,"med_expire":"2027-03-01","raw":"买了一盒体内驱虫药，2 支，明年3月过期"}',
    },
    { role: 'user', content: user },
  ]
}

module.exports = { SYSTEM, buildMessages }
