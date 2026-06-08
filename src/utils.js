// 跨页面复用的小工具。

// 由生日(YYYY-MM-DD)推算年龄文案：「X岁Y个月」/「Y个月」；无生日或非法返回 ''。
// 注：小程序 / iOS 对 '-' 分隔的日期解析不稳，统一换 '/' 再 new Date。
export function petAge(birthday) {
  if (!birthday) return ''
  const b = new Date(String(birthday).replace(/-/g, '/'))
  if (isNaN(b.getTime())) return ''
  const now = new Date()
  let months = (now.getFullYear() - b.getFullYear()) * 12 + (now.getMonth() - b.getMonth())
  if (now.getDate() < b.getDate()) months--
  if (months < 0) return ''
  const y = Math.floor(months / 12)
  const m = months % 12
  if (y <= 0) return m + '个月'
  return m > 0 ? `${y}岁${m}个月` : `${y}岁`
}
