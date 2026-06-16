// 物种枚举单一真相源（ADR-023 物种扩展 A 档）。
// 8 类固定清单 + other 兜底；species 仅作「展示标签 + 选默认头像」，不驱动医疗逻辑（A 档：一套统一记录模型）。
// 云函数无法 import 本模块，pets / saveRecord / importNotion / parseRecord 各持一份同序枚举白名单（与 normalize 系列同例，改须同步）。
export const SPECIES = [
  { key: 'cat', label: '猫', emoji: '🐱' },
  { key: 'dog', label: '狗', emoji: '🐶' },
  { key: 'rabbit', label: '兔', emoji: '🐰' },
  { key: 'rodent', label: '小宠', emoji: '🐹' },
  { key: 'bird', label: '鸟', emoji: '🦜' },
  { key: 'reptile', label: '爬宠', emoji: '🐢' },
  { key: 'fish', label: '鱼', emoji: '🐠' },
  { key: 'other', label: '其他', emoji: '🐾' },
]

const MAP = SPECIES.reduce((m, s) => ((m[s.key] = s), m), {})

// 非法 / 旧值归一到白名单：命中取其值，否则 other（落库真相源 pets 云函数同款逻辑）。
export function normSpecies(k) {
  return MAP[k] ? k : 'other'
}

export function speciesLabel(k) {
  return (MAP[k] || MAP.other).label
}

export function speciesEmoji(k) {
  return (MAP[k] || MAP.other).emoji
}

// 物种默认头像静态图（ADR-023）：头像优先级 照片 > 自选 emoji > 本静态图 > emoji 兜底。
// 图未就位时 <image @error> / canvas img.onerror 回退 speciesEmoji，不破图（即梦出图放进来即自动生效，无需再改码）。
export function avatarStatic(k) {
  return `/static/avatar/${normSpecies(k)}.png`
}
