// parseRecord normalize() 单元测试（ADR-035）：normalize 是纯函数，导出供测。
// 核心 = 守住 med_type 经白名单透传到前端（ADR-020 已知失效面：normalize 是白名单构造，
// 字段不显式列入就被丢、传不到前端）。变异：删 index.js:301 `med_type: normMedType(o.med_type)` → 本测试转红。
// 跑法：node tests/parseRecord.normalize.test.js
const Module = require('module')
const path = require('path')

// 最小 mock wx-server-sdk：parseRecord/index.js 模块加载时 cloud.init + cloud.database()，不实际触网。
const fakeCloud = { init() {}, DYNAMIC_CURRENT_ENV: 'env', database: () => ({ collection: () => ({}), command: {} }), getWXContext: () => ({ OPENID: '' }) }
const origLoad = Module._load
Module._load = function (request) { if (request === 'wx-server-sdk') return fakeCloud; return origLoad.apply(this, arguments) }
const fn = require(path.join(__dirname, '..', 'cloudfunctions', 'parseRecord', 'index.js'))

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function run(t, body) { try { body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }
const TODAY = '2026-01-01'

run('med_type: med_stock 显式给 → 透传（白名单不丢）', () => {
  const o = fn.normalize({ kind: 'med_stock', med_name: '海乐妙', med_effect: '驱虫', med_type: '驱虫' }, '买了盒海乐妙', TODAY)
  assert(o.kind === 'med_stock', 'kind 保持 med_stock')
  assert(o.med_type === '驱虫', 'med_type 透传到输出（删白名单那行会让此断言红）')
})

run('med_type: 缺省默认用药（药品库存默认就是药，非提醒兜底其它）', () => {
  const o = fn.normalize({ kind: 'med_stock', med_name: '消炎药' }, 'x', TODAY)
  assert(o.med_type === '用药', '缺 med_type 默认用药')
})

run('med_type: 非法值钳到用药', () => {
  const o = fn.normalize({ kind: 'med_stock', med_name: 'x', med_type: '乱填的类型' }, 'x', TODAY)
  assert(o.med_type === '用药', '非法 med_type 归用药')
})

run('med_type: 5 类枚举均原样保留', () => {
  for (const t of ['用药', '疫苗', '驱虫', '养护', '其它']) {
    const o = fn.normalize({ kind: 'med_stock', med_name: 'x', med_type: t }, 'x', TODAY)
    assert(o.med_type === t, `${t} 应原样保留（不被钳成用药）`)
  }
})

run('normMedType: 导出的钳制函数行为正确', () => {
  assert(fn.normMedType('驱虫') === '驱虫', '合法值保留')
  assert(fn.normMedType('') === '用药', '空串默认用药')
  assert(fn.normMedType(undefined) === '用药', 'undefined 默认用药')
  assert(fn.normMedType('xx') === '用药', '非法值用药')
})

run('record 分支也带 med_type（白名单恒列，缺省用药）：不影响 record 主字段', () => {
  const o = fn.normalize({ kind: 'record', pet: '示例猫', event_type: '症状', desc: '呕吐' }, 'x', TODAY)
  assert(o.kind === 'record' && o.med_type === '用药', 'record 输出也含 med_type 默认（前端只在 med_stock 用，无副作用）')
})

run('multi 子记录不带 med_*（med_stock 永不进 multi，ADR-030）', () => {
  const o = fn.normalize({ kind: 'multi', records: [{ pet: '示例猫', event_type: '症状', desc: '吐' }, { pet: '示例狗', event_type: '症状', desc: '拉稀' }] }, 'x', TODAY)
  assert(o.kind === 'multi' && Array.isArray(o.records) && o.records.length === 2, 'multi 拆 2 条')
  assert(o.records[0].med_type === undefined, 'multi 子记录无 med_type（normalizeRecordFields 不含 med_*）')
})

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
