// 每物种 profile 配置表（ADR-024 B 档 B2）：结构化录入按物种收敛 event_type、养护参数 schema、提醒分类。
// 守红线（Q2 纯用户自定义）：绝不内置任何物种的疫苗 / 驱虫『周期值』；本表只做「分类 + 养护参数」，不含医疗周期建议。
// 挂 ADR-023 的 src/species.js（物种枚举真相源）之上。云函数不 import 本表：saveRecord / parseRecord 各自持养护桶 / params sanitize 的对应逻辑（与 normalize 系列同例）。
import { normSpecies } from '@/species'

// 养护参数元信息单一真相源（key → 标签 / 单位）。录入表单与展示层共用，保证两处标签一致。
export const PARAM_META = {
  temp: { label: '温度', unit: '℃' },
  humidity: { label: '湿度', unit: '%' },
  ph: { label: 'pH', unit: '' },
  ammonia: { label: '氨', unit: 'ppm' },
  nitrite: { label: '亚硝酸盐', unit: 'ppm' },
}

// 各物种结构化养护参数键（v1 仅爬宠 / 鱼，参数标准且高频）；其余物种「养护」桶走 free desc，无结构化参数。
const HUSBANDRY_KEYS = {
  reptile: ['temp', 'humidity'],
  fish: ['ph', 'ammonia', 'nitrite', 'temp'],
}

// 各物种 event_type 候选（按物种收敛；「其它」始终在，避免误锁；猫狗保留原 7 桶不含养护）。
const EVENTS = {
  cat: ['症状', '用药', '疫苗', '驱虫', '体重', '就医', '其它'],
  dog: ['症状', '用药', '疫苗', '驱虫', '体重', '就医', '其它'],
  rabbit: ['症状', '用药', '疫苗', '驱虫', '体重', '就医', '养护', '其它'],
  rodent: ['症状', '用药', '体重', '就医', '养护', '其它'],
  bird: ['症状', '用药', '体重', '就医', '养护', '其它'],
  reptile: ['症状', '用药', '体重', '就医', '养护', '其它'],
  fish: ['症状', '用药', '就医', '养护', '其它'],
  other: ['症状', '用药', '疫苗', '驱虫', '体重', '就医', '养护', '其它'],
}

// 提醒分类候选（仅分类名，无周期值——周期用户自填，守红线 Q2）。
const REMINDERS = {
  cat: ['用药', '疫苗', '驱虫', '其它'],
  dog: ['用药', '疫苗', '驱虫', '其它'],
  rabbit: ['用药', '疫苗', '驱虫', '其它'],
  rodent: ['用药', '养护', '其它'],
  bird: ['用药', '养护', '其它'],
  reptile: ['用药', '养护', '其它'],
  fish: ['用药', '养护', '其它'],
  other: ['用药', '疫苗', '驱虫', '养护', '其它'],
}

export function eventTypesFor(species) {
  return EVENTS[normSpecies(species)] || EVENTS.other
}

export function reminderTypesFor(species) {
  return REMINDERS[normSpecies(species)] || REMINDERS.other
}

// 该物种的养护参数输入 schema：[{key,label,unit}]，空数组 = 无结构化参数（养护走 free desc）。
export function husbandryFor(species) {
  return (HUSBANDRY_KEYS[normSpecies(species)] || []).map((k) => ({ key: k, label: PARAM_META[k].label, unit: PARAM_META[k].unit }))
}

// 展示：把 records.params 对象格式化成 [{key,label,value,unit}]（跳空值；未知键也带上用键名兜底）。不依赖物种。
export function formatParams(params) {
  if (!params || typeof params !== 'object') return []
  const out = []
  for (const k of Object.keys(params)) {
    const v = params[k]
    if (v === '' || v == null) continue
    const meta = PARAM_META[k] || { label: k, unit: '' }
    out.push({ key: k, label: meta.label, value: v, unit: meta.unit })
  }
  return out
}
