// 主粮读侧解析纯函数测试（ADR-027）：钉死「单宠覆盖 > 物种默认 > 无」+ 覆盖只认名字不认 species。
// 原缺口：写侧排他作用域有测试，读侧解析（pet.vue）零覆盖——把 override||def 写反或给 override 误加 species 过滤都不会被发现。
// 跑法：node tests/foodsResolve.test.js
const fs = require('fs')
const path = require('path')
// src/foodsResolve.js 是 ESM（与 src 同约定），CJS harness 无法直接 require。
// 该模块为纯函数、无 import：读源、剥掉 export 关键字、在沙箱里求值 → 直测真实源文件本身（非复制逻辑，零漂移）。
// 若将来给它加了 import，strip-eval 会失败报错，逼显式处理（不会静默假绿）。
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'foodsResolve.js'), 'utf8')
const sandbox = { exports: {} }
new Function('module', src.replace(/\bexport\s+/g, '') + '\nmodule.exports = { resolveCurrentFood }')(sandbox)
const { resolveCurrentFood } = sandbox.exports

let pass = 0, fail = 0
function assert(c, m) { if (c) pass++; else { fail++; console.log('  ❌ ' + m) } }
function run(t, body) { try { body(); console.log('✔ ' + t) } catch (e) { fail++; console.log('✘ ' + t + ' — ' + (e && e.message)) } }

run('单宠覆盖在喂 优先于 物种默认在喂', () => {
  const list = [
    { pet: '', species: 'cat', brand: '默认猫粮', current: true },
    { pet: '咪咪', species: 'cat', brand: '处方粮', current: true },
  ]
  const r = resolveCurrentFood(list, '咪咪', 'cat')
  assert(r && r.brand === '处方粮', '命中单宠覆盖而非物种默认（防 override||def 写反）')
})

run('覆盖只认名字不认 species（改物种不破解析）', () => {
  // 覆盖条 species 被改坏成 dog，但宠物是 cat、pet===name 仍应命中
  const list = [
    { pet: '', species: 'cat', brand: '默认猫粮', current: true },
    { pet: '咪咪', species: 'dog', brand: '处方粮', current: true },
  ]
  const r = resolveCurrentFood(list, '咪咪', 'cat')
  assert(r && r.brand === '处方粮', 'override 按名命中、不得加 species 过滤')
})

run('仅物种默认在喂 → 命中默认', () => {
  const list = [
    { pet: '', species: 'cat', brand: '默认猫粮', current: true },
    { pet: '咪咪', species: 'cat', brand: '旧处方', current: false }, // 单宠覆盖未在喂
  ]
  const r = resolveCurrentFood(list, '咪咪', 'cat')
  assert(r && r.brand === '默认猫粮', '无在喂覆盖时回落物种默认')
})

run('物种默认须 species 匹配（异物种默认不串台）', () => {
  const list = [{ pet: '', species: 'dog', brand: '狗默认', current: true }]
  const r = resolveCurrentFood(list, '咪咪', 'cat') // 猫宠不该命中狗默认
  assert(r === null, '异物种默认不命中')
})

run('都不在喂 → null', () => {
  const list = [
    { pet: '', species: 'cat', brand: '默认猫粮', current: false },
    { pet: '咪咪', species: 'cat', brand: '处方粮', current: false },
  ]
  assert(resolveCurrentFood(list, '咪咪', 'cat') === null, '无在喂条返回 null')
})

run('空 / 非数组列表 → null（不崩）', () => {
  assert(resolveCurrentFood([], '咪咪', 'cat') === null, '空列表 null')
  assert(resolveCurrentFood(undefined, '咪咪', 'cat') === null, 'undefined 列表 null')
})

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail ? 1 : 0)
