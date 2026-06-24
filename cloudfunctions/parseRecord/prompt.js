// AI 解析提示词。严格定位「结构化提取机器」：强制 JSON 输出，不放开自由对话。
// 注意：本文件进公开仓，示例一律用占位名（示例猫 / 示例狗），绝不含真实宠物名或隐私。
// raw 不再由 LLM 回填：服务端逐字落库（ADR-020），故 SYSTEM 与 few-shot 输出都不含 raw 字段。

const SYSTEM = `你是宠物健康记录的结构化提取引擎，不是聊天助手。
唯一任务：把用户一句话里的宠物健康信息抽取成一个 JSON 对象。处理猫狗及兔 / 仓鼠 / 鸟 / 龟等常见家养宠物。
严格只输出一个 JSON 对象，不要解释、不要寒暄、不要 markdown 代码块。

先判断这句话属于哪类，填 kind：
- kind: "record" | "med_stock" | "reminder" | "multi"。"record" = 记录某只猫狗已发生的健康事件（症状 / 用药 / 疫苗 / 驱虫 / 体重 / 就医）；"med_stock" = 登记家庭药品库存（买药 / 囤药 / 记录药品数量与过期）；"reminder" = 为将来要做的事设提醒（约定将来打疫苗 / 驱虫 / 复诊 / 喂药，通常含未来日期或「每月 / 每年」之类周期）；"multi" = 一句话含多个不同宠物各自不同的事（见下方【多事件拆条】，只在那种情况用）。
- 区分关键：已经发生 → record；买来囤着 → med_stock；将来要做、要提醒 → reminder。

【多事件拆条】当一句话描述了【多个不同宠物各自不同的事】（如「示例猫吐了，示例狗拉稀」）或【明确分开的多件不同事】时，输出 {"kind":"multi","records":[ 每条一个 record 对象 ]}，每个对象用下面 kind=record 的字段（pet/species/time/event_type/weight/med/hospital/cost/tag/desc）。【务必保守，宁可不拆】：只有真正不同的事才拆；同一只的一件事（哪怕同时记了体重）绝不拆；【同一件事给多只】（如「给示例猫和示例狗都驱虫」）不是 multi，而是下面 kind=record 的 pets 字段。multi 只拆 record，不混 med_stock / reminder。

kind=record 时填：
- valid: boolean。是否是有效的宠物健康记录。闲聊、问诊、与宠物健康无关的内容一律 valid=false。
- pet: string。宠物名。【必须优先归一到「已有宠物」列表里的名字】：用户写了错别字、同音字、形近字、简称、漏字，只要能合理对应列表里某只，就填列表里的标准名（如列表有「示例猫」，用户写「示列猫 / 试例猫 / 例猫」都填「示例猫」）。确实无法对应任何一只时才照抄原话里的名字；没提名字填 ""。
- pets: string[]。【仅当这句话同时点到多只已有宠物做同一件事】（如「给示例猫和示例狗都驱虫」「两只一起做了体检」「示例猫、示例狗一起称重」），把涉及的【已有宠物标准名】逐一列进数组（同样把错别字 / 简称归一到已有名）。只涉及一只、或没点到多只时填空数组 []；pet 字段仍填主要 / 第一只。【不同宠物各自不同的事】（如「示例猫吐了，示例狗拉稀」）不属此项，pets 留 []。
- new_pet: boolean。用户是否在【明确表达新增一只宠物】（如「新来的 / 新成员 / 添加宠物 / 领养了 / 捡到一只」）。只是名字不在列表里【不算】新增意图，填 false。
- species: string。取值之一：cat（猫）/ dog（狗）/ rabbit（兔）/ rodent（仓鼠·豚鼠·龙猫等小宠）/ bird（鸟·鹦鹉）/ reptile（龟·蜥蜴·蛇等爬宠）/ fish（鱼）/ other（其他）。已有宠物列表会用 名(species) 标注物种，归一到已有宠物时跟随它的物种；新宠能判断就判断（「橘猫 / 布偶」→cat，「金毛 / 狗」→dog，「荷兰猪 / 仓鼠 / 龙猫」→rodent，「兔子 / 垂耳兔」→rabbit，「鹦鹉 / 八哥」→bird，「乌龟 / 巴西龟 / 蜥蜴」→reptile，「金鱼 / 锦鲤」→fish），判断不了填 "other"。
- time: string。事件时间，精确到分：用户说了具体时刻（如「下午3点半 / 上午9点 / 14:20 / 晚上8点」）就输出 "YYYY-MM-DD HH:mm"（24 小时制，下午 / 晚上加 12 小时）；没说时刻只输出 "YYYY-MM-DD"。「今天 / 昨天」按相对今天算；日期没提填今天。
- event_type: string。症状 | 用药 | 疫苗 | 驱虫 | 体重 | 就医 | 养护 | 其它。已做的驱虫（体内 / 体外）归「驱虫」；注射疫苗归「疫苗」，但「打一针消炎 / 镇痛 / 补液」是治疗处置归「用药」不归「疫苗」。「养护」= 环境 / 饲养参数记录（爬宠缸温湿度、鱼缸水质 pH / 氨 / 亚硝酸盐 / 换水、清洁等），把测得数值填进 params。
- weight: number | null。体重（kg），抓不到填 null。
- med: string | null。涉及的药名，【只填药名，不填整句】（如「配了迈微舒早晚各一颗吃一周」→「迈微舒」），否则 null。
- hospital: string。就诊医院名称，没提填 ""。
- cost: number | null。本次花费（元，纯数字）；多笔费用相加填总额（如「挂号30化验200」→230），抓不到填 null。
- tag: string。病程标签 = 把同一慢病 / 疗程的多次记录串起来的主题词（如嗜酸性肉芽肿 / 尿闭 / 软骨病）。【event_type 已表达的事件类别（驱虫 / 疫苗 / 体重 / 体检）、以及到家 / 绝育这类一次性事件，绝不写进 tag】。若给了【病程标签】候选，优先复用候选里的名（同一个病换措辞也归到候选名）；确属候选外的新慢病才新建；普通日常记录或无明确病程留 ""。
- desc: string。这次事件的简洁临床描述：发生了什么 / 做了什么 / 复查什么（如「呕吐两次」「复查嗜酸性肉芽肿」「体外驱虫」「注射狂犬疫苗」）。【只描述症状 / 处置本身，绝不含费用金额、不含医院名、不含主人口语寒暄】，用于生成给兽医的小结。抓不到填 ""。
- params: object | null。养护参数，【仅 event_type=养护 时填】：把句中测得的环境 / 饲养数值填成对象，键用英文、值用纯数字。爬宠 → {temp:温度℃, humidity:湿度%}；鱼 → {ph, ammonia:氨, nitrite:亚硝酸盐, temp:水温}；只填句中提到的键。非养护或无参数填 null。

kind=med_stock 时填：
- med_name: string。药品名。
- med_effect: string。功效（如驱虫 / 止吐），没有填 ""。
- med_quantity: number。数量 / 剩余量，未提填 1。
- med_expire: string。过期日期 YYYY-MM-DD；只说「3 个月后 / 明年 3 月」就按相对今天算，算不出填 ""。

kind=reminder 时填：
- pet: string。关联的宠物名（没有特定宠物填 ""）。
- rem_type: string。用药 | 疫苗 | 驱虫 | 养护 | 其它。
- rem_title: string。提醒事项，如「打狂犬疫苗」「体内驱虫」「复诊」。
- rem_date: string。下次到期日 YYYY-MM-DD；相对时间（下周一 / 下个月 15 号 / 三个月后）按今天换算；算不出填 ""。
- rem_repeat_days: number。重复周期天数：每周=7、每月≈30、每季≈90、每年≈365；一次性填 0。

公共：
- 既非健康记录也非药品的无关内容：valid=false 且 kind="record"。
- 不要输出 raw 字段（原文由系统保存，无需你回填）。

绝不做诊断、不开处方、不给医疗建议，只抽取不判断病情。`

// 物种枚举白名单（ADR-023）：标注已有宠物物种时归一，与落库 / 前端保持同一套枚举
const SPECIES_KEYS = ['cat', 'dog', 'rabbit', 'rodent', 'bird', 'reptile', 'fish', 'other']
const annSpecies = (s) => (SPECIES_KEYS.includes(s) ? s : 'other')

function buildMessages(text, pets, tags, today) {
  // 已有宠物带物种标注（名(species)）助 species 判断 / 同名消歧（ADR-020/023）
  const petList = pets && pets.length ? pets.map((p) => `${p.name}(${annSpecies(p.species)})`).join('、') : '（暂无）'
  // 病程标签候选（该家庭已用的病程线，ADR-019/020）：有才喂，新家庭为空则不出现这行
  const tagLine = tags && tags.length ? `\n【病程标签】（该家庭已用，优先复用，确属新病程才新建）${tags.join('、')}` : ''
  const user = `今天是 ${today}。\n【已有宠物】${petList}${tagLine}\n【用户这句话】${text}\n\n只输出 JSON。`
  return [
    { role: 'system', content: SYSTEM },
    // few-shot 占位示例，非真实宠物；输出均不含 raw（服务端逐字落库）
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】示例猫今天吐了两次，称了下4.2kg\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例猫","new_pet":false,"species":"cat","time":"2026-01-01","event_type":"症状","weight":4.2,"med":null,"hospital":"","cost":null,"tag":"","desc":"呕吐两次"}',
    },
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】今天下午3点半示例狗又吐了一次\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例狗","new_pet":false,"species":"dog","time":"2026-01-01 15:30","event_type":"症状","weight":null,"med":null,"hospital":"","cost":null,"tag":"","desc":"呕吐"}',
    },
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】明天天气不错\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content: '{"kind":"record","valid":false,"pet":"","new_pet":false,"species":"cat","time":"2026-01-01","event_type":"其它","weight":null,"med":null,"hospital":"","cost":null,"tag":"","desc":""}',
    },
    // 就医 + 医院 + 费用 + 病程 tag：演示「优先复用候选里的病程标签」（候选含嗜酸性肉芽肿 → tag 直接归它）
    {
      role: 'user',
      content:
        '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【病程标签】（该家庭已用，优先复用，确属新病程才新建）嗜酸性肉芽肿\n【用户这句话】带示例猫去爱康医院复查嗜酸性肉芽肿，花了480\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例猫","new_pet":false,"species":"cat","time":"2026-01-01","event_type":"就医","weight":null,"med":null,"hospital":"爱康医院","cost":480,"tag":"嗜酸性肉芽肿","desc":"复查嗜酸性肉芽肿"}',
    },
    // 驱虫 = record（已发生），event_type=驱虫，tag 留空（驱虫是事件类别，不写进病程 tag）
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】今天给示例狗做了体外驱虫\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例狗","new_pet":false,"species":"dog","time":"2026-01-01","event_type":"驱虫","weight":null,"med":"体外驱虫","hospital":"","cost":null,"tag":"","desc":"体外驱虫"}',
    },
    // 多宠同事件（ADR-029 Round 1）：一句话点到多只已有宠物做同一件事 → pets 列全部标准名（pet 仍填第一只）
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】今天给示例猫和示例狗都做了体外驱虫\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例猫","pets":["示例猫","示例狗"],"new_pet":false,"species":"cat","time":"2026-01-01","event_type":"驱虫","weight":null,"med":"体外驱虫","hospital":"","cost":null,"tag":"","desc":"体外驱虫"}',
    },
    // 多事件拆条（ADR-030 Round 2）：不同宠物各自不同的事 → kind=multi + records[]（与上面「同一件事多只 → pets[]」严格对照）
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】示例猫今天吐了，示例狗拉稀了\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"multi","records":[{"pet":"示例猫","species":"cat","time":"2026-01-01","event_type":"症状","weight":null,"med":null,"hospital":"","cost":null,"tag":"","desc":"呕吐"},{"pet":"示例狗","species":"dog","time":"2026-01-01","event_type":"症状","weight":null,"med":null,"hospital":"","cost":null,"tag":"","desc":"腹泻"}]}',
    },
    // 疫苗：注射疫苗归 event_type=疫苗，tag 留空（与上面驱虫对照，事件类别不进 tag）
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】今天带示例狗去打了狂犬疫苗\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例狗","new_pet":false,"species":"dog","time":"2026-01-01","event_type":"疫苗","weight":null,"med":null,"hospital":"","cost":null,"tag":"","desc":"注射狂犬疫苗"}',
    },
    // med_stock = 买来囤着（与上面「做了驱虫」record 对照：囤药归库存）
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】买了一盒体内驱虫药，2 支，明年3月过期\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content: '{"kind":"med_stock","med_name":"体内驱虫药","med_effect":"驱虫","med_quantity":2,"med_expire":"2027-03-01"}',
    },
    // reminder = 将来要做（与上面两条对照：周期性提醒归 reminder）
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】每个月给示例狗做一次体外驱虫，这个月15号开始\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content: '{"kind":"reminder","pet":"示例狗","rem_type":"驱虫","rem_title":"体外驱虫","rem_date":"2026-01-15","rem_repeat_days":30}',
    },
    // 错别字归一：用户写错名，pet 必须填列表里的标准名，且 new_pet=false
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】示列猫今天拉稀了\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例猫","new_pet":false,"species":"cat","time":"2026-01-01","event_type":"症状","weight":null,"med":null,"hospital":"","cost":null,"tag":"","desc":"腹泻"}',
    },
    // 显式新增意图：明确说「新来的」才 new_pet=true，名字照抄
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】家里新来了只橘猫叫示例橘，刚称了2.1kg\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例橘","new_pet":true,"species":"cat","time":"2026-01-01","event_type":"体重","weight":2.1,"med":null,"hospital":"","cost":null,"tag":"","desc":"到家首称体重"}',
    },
    // 非猫狗物种：判别 species（垂耳兔→rabbit），显式新增意图 new_pet=true
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例猫(cat)、示例狗(dog)\n【用户这句话】家里新养了只垂耳兔叫示例兔，今天到家\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例兔","new_pet":true,"species":"rabbit","time":"2026-01-01","event_type":"其它","weight":null,"med":null,"hospital":"","cost":null,"tag":"","desc":"到家"}',
    },
    // 养护记录（ADR-024）：爬宠环境参数，event_type=养护，测得数值填 params（键英文值数字）
    {
      role: 'user',
      content: '今天是 2026-01-01。\n【已有宠物】示例龟(reptile)\n【用户这句话】示例龟缸里今天温度28度，湿度60%\n\n只输出 JSON。',
    },
    {
      role: 'assistant',
      content:
        '{"kind":"record","valid":true,"pet":"示例龟","new_pet":false,"species":"reptile","time":"2026-01-01","event_type":"养护","weight":null,"med":null,"hospital":"","cost":null,"tag":"","desc":"环境温湿度记录","params":{"temp":28,"humidity":60}}',
    },
    { role: 'user', content: user },
  ]
}

module.exports = { SYSTEM, buildMessages }
