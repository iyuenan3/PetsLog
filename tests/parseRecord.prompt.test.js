// parseRecord prompt 单元测试（ADR-020 LLM I/O 精准化）：buildMessages 是纯函数，
// 验 ① 宠物名带物种标注喂 LLM ② tag 候选行有无 ③ few-shot 输出一律不含 raw（服务端逐字落库）④ SYSTEM 收紧规则。
// 跑法：node tests/parseRecord.prompt.test.js
const path = require('path')
const { SYSTEM, buildMessages } = require(path.join(__dirname, '..', 'cloudfunctions', 'parseRecord', 'prompt'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function run(t, body) { try { body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }
const last = (msgs) => msgs[msgs.length - 1].content

run('物种标注: 宠物名带 (cat/dog) 喂 LLM（助 species 判断 / 同名消歧）', () => {
  const m = buildMessages('示例猫吐了', [{ name: '示例猫', species: 'cat' }, { name: '示例狗', species: 'dog' }], [], '2026-01-01')
  assert(last(m).includes('示例猫(cat)') && last(m).includes('示例狗(dog)'), 'petList 应带物种标注')
})

run('tag 候选: 有候选则用户消息出现【病程标签】行', () => {
  const m = buildMessages('复查', [{ name: '示例猫', species: 'cat' }], ['嗜酸性肉芽肿', '尿闭'], '2026-01-01')
  assert(last(m).includes('【病程标签】') && last(m).includes('嗜酸性肉芽肿') && last(m).includes('尿闭'), '应喂该家庭 tag 候选')
})

run('tag 候选: 新家庭（空候选）不出现【病程标签】行（不喂静态全集）', () => {
  const m = buildMessages('复查', [{ name: '示例猫', species: 'cat' }], [], '2026-01-01')
  assert(!last(m).includes('【病程标签】'), '无候选时不应有该行')
})

run('raw 移除: 所有 few-shot 输出一律不含 raw 字段', () => {
  const m = buildMessages('x', [], [], '2026-01-01')
  const anyRaw = m.some((msg) => msg.role === 'assistant' && /"raw"\s*:/.test(msg.content))
  assert(!anyRaw, 'few-shot assistant 输出不应含 raw（原文由服务端逐字落库，ADR-020）')
})

run('SYSTEM 收紧: tag 反污染 + cost 总额 + event_type 疫苗/消炎区分 + med 只填药名', () => {
  assert(SYSTEM.includes('绝不写进 tag'), 'tag 反污染规则在')
  assert(SYSTEM.includes('相加填总额'), 'cost 多笔总额规则在')
  assert(SYSTEM.includes('消炎'), 'event_type 疫苗 vs 消炎用药区分在')
  assert(SYSTEM.includes('只填药名'), 'med 只填药名规则在')
  assert(!SYSTEM.includes('原样回填'), 'SYSTEM 不应再要求 LLM 回填 raw')
})

run('空宠物列表: 退化为（暂无）', () => {
  const m = buildMessages('x', [], [], '2026-01-01')
  assert(last(m).includes('（暂无）'), '空宠物列表应显示（暂无）')
})

run('few-shot 自洽: 每条 assistant 输出是合法 JSON', () => {
  const m = buildMessages('x', [], [], '2026-01-01')
  let ok = true
  for (const msg of m) if (msg.role === 'assistant') { try { JSON.parse(msg.content) } catch (e) { ok = false } }
  assert(ok, 'few-shot assistant 内容应全部是可解析 JSON')
})

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
