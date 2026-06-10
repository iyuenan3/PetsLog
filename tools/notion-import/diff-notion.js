// 核对脚本:Notion 实时数据(workflow 拉取) vs data.json(CSV 转换产物)
// 用法: node tools/notion-import/diff-notion.js /tmp/notion_data.json
// 输出差异清单;规则与 transform.py 对齐(到家费用置 null、event_type 桶、日期归一)
const path = require('path')
const notion = require(process.argv[2] || '/tmp/notion_data.json')
const local = require(path.join(__dirname, '..', '..', 'cloudfunctions', 'importNotion', 'data.json'))

const issues = []
function issue(cat, msg) { issues.push(`[${cat}] ${msg}`) }

function normDate(s) {
  if (!s) return ''
  const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : ''
}
function timePart(s) {
  const m = String(s || '').match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : null
}

// ---------- pets ----------
const lp = Object.fromEntries(local.pets.map((p) => [p.name, p]))
const np = Object.fromEntries(notion.pets.map((p) => [p.name, p]))
for (const name of Object.keys(np)) {
  const n = np[name], l = lp[name]
  if (!l) { issue('PET', `${name}: 本地缺这只宠物`); continue }
  if (normDate(n.birthday) !== (l.birthday || '')) issue('PET', `${name}: 生日 notion=${n.birthday} local=${l.birthday}`)
  if (normDate(n.home_date) !== (l.home_date || '')) issue('PET', `${name}: 到家日期 notion=${n.home_date} local=${l.home_date}`)
  const nb = typeof n.price_base === 'number' ? n.price_base : null
  if (nb !== (l.price_base === undefined ? null : l.price_base)) issue('PET', `${name}: 初始身价 notion=${nb} local=${l.price_base}`)
  if ((n.breed || '') !== (l.breed || '')) issue('PET', `${name}: 品种 notion=${n.breed} local=${l.breed}`)
  // note: 本地 note=备注;病史进 chronic
  if ((n.note || '') !== (l.note || '')) issue('PET', `${name}: 备注不一致 notion="${(n.note || '').slice(0, 60)}..." local="${(l.note || '').slice(0, 60)}..."`)
  if ((n.history || '') !== (l.chronic || '')) issue('PET', `${name}: 病史/chronic notion="${n.history}" local="${l.chronic}"`)
  // 绝育推断(与 transform 同规则)
  const t = (n.history || '') + (n.note || '')
  const neutered = t.includes('绝育') && !t.includes('未绝育') && !t.includes('没绝育')
  if (neutered !== !!l.neutered) issue('PET', `${name}: 绝育推断 notion文本=>${neutered} local=${l.neutered}`)
}
for (const name of Object.keys(lp)) if (!np[name]) issue('PET', `${name}: Notion 没有这只宠物(本地多出)`)

// ---------- records ----------
// 对齐键:pet + 日期 + 标题(名称)。本地 raw 存的是名称?检查 transform: raw 字段。
// 本地记录形态: {_id, pet, time, event_type, tag, desc, raw, weight, hospital, cost, med, attachments}
const usedLocal = new Set()
const localByPet = {}
for (const r of local.records) (localByPet[r.pet] = localByPet[r.pet] || []).push(r)

let timeMissing = 0, timeHave = 0
const recIssues = { missing: [], extra: [], field: [] }

for (const n of notion.records) {
  const date = normDate(n.date_start)
  const tp = timePart(n.date_start)
  if (tp) timeHave++; else timeMissing++
  const cands = (localByPet[n.pet] || []).filter((r) => !usedLocal.has(r._id) && r.time === date)
  // 在同宠同日中按字段相似挑
  let best = null
  for (const c of cands) {
    const wOk = (n.weight == null && c.weight == null) || (typeof n.weight === 'number' && Math.abs((c.weight ?? NaN) - n.weight) < 0.005)
    const src = n.src === 'deworm' ? c.event_type === '驱虫' : c.event_type !== '驱虫'
    if (wOk && src) { best = c; break }
  }
  if (!best && cands.length) best = cands[0]
  if (!best) {
    recIssues.missing.push(`${n.pet} ${date} 「${n.title}」(src=${n.src}) 本地无对应记录`)
    continue
  }
  usedLocal.add(best._id)
  // 字段核对
  const f = []
  // 费用:到家置 null 规则
  const expCost = n.title === '到家' ? null : (typeof n.cost === 'number' ? n.cost : null)
  const lCost = best.cost === undefined ? null : best.cost
  if (expCost !== lCost) f.push(`cost notion=${expCost} local=${lCost}`)
  const nW = typeof n.weight === 'number' ? n.weight : null
  const lW = best.weight === undefined ? null : best.weight
  if (nW !== lW) f.push(`weight notion=${nW} local=${lW}`)
  if ((n.hospital || '') !== (best.hospital || '')) f.push(`hospital notion=${n.hospital} local=${best.hospital}`)
  const lMed = best.med && best.med.name ? best.med.name : (best.med || '')
  if ((n.med || '') !== (lMed || '')) f.push(`med notion="${n.med}" local="${lMed}"`)
  if ((n.desc || '') !== (best.desc || '')) f.push(`desc notion="${(n.desc || '').slice(0, 40)}" local="${(best.desc || '').slice(0, 40)}"`)
  if ((n.att_count || 0) !== (best.attachments || []).length) f.push(`附件数 notion=${n.att_count} local=${(best.attachments || []).length}`)
  if (f.length) recIssues.field.push(`${n.pet} ${date} 「${n.title}」(${best._id}): ${f.join('; ')}`)
}
for (const r of local.records) {
  if (!usedLocal.has(r._id)) recIssues.extra.push(`${r.pet || '(空)'} ${r.time || '(无日期)'} ${r._id} event=${r.event_type} 本地多出(Notion 无对应)`)
}

// ---------- foods ----------
const lf = local.foods.map((f) => `${f.name}|${f.start_date}|${f.end_date || ''}`).sort()
const nf = notion.foods.map((f) => `${f.title}|${normDate(f.date_start)}|${normDate(f.date_end || '')}`).sort()
const lfs = new Set(lf), nfs = new Set(nf)
for (const k of nfs) if (!lfs.has(k)) issue('FOOD', `Notion 有本地无: ${k}`)
for (const k of lfs) if (!nfs.has(k)) issue('FOOD', `本地有 Notion 无: ${k}`)

// ---------- 时间统计 ----------
const timeRecs = notion.records.filter((r) => timePart(r.date_start))
console.log('===== 总量 =====')
console.log(`notion: pets=${notion.pets.length} records=${notion.records.length} foods=${notion.foods.length}`)
console.log(`local:  pets=${local.pets.length} records=${local.records.length} foods=${local.foods.length}`)
console.log(`\n===== 带时间的记录(is_datetime): ${timeHave} 条 / 纯日期 ${timeMissing} 条 =====`)
timeRecs.slice(0, 30).forEach((r) => console.log(`  ${r.pet} ${r.date_start} 「${r.title}」`))

console.log(`\n===== PET/FOOD 差异 (${issues.length}) =====`)
issues.forEach((i) => console.log('  ' + i))
console.log(`\n===== 记录缺失(Notion 有本地无) (${recIssues.missing.length}) =====`)
recIssues.missing.forEach((i) => console.log('  ' + i))
console.log(`\n===== 记录多出(本地有 Notion 无) (${recIssues.extra.length}) =====`)
recIssues.extra.forEach((i) => console.log('  ' + i))
console.log(`\n===== 字段差异 (${recIssues.field.length}) =====`)
recIssues.field.forEach((i) => console.log('  ' + i))
