// 主粮「某宠当前在喂」解析（ADR-027）。抽成纯函数 = 单一真相源 + 可单测（pet.vue 读侧解析的核心不变量原零覆盖）。
// 语义：单宠覆盖在喂 > 物种默认在喂 > 无。
//   · 单宠覆盖只认【名字】不认 species（故「改物种不破解析」：覆盖条 species 即便错也按名命中）。
//   · 物种默认 = pet 空串、且 species 与该宠相同。
//   · 多条命中同档（脏数据）取列表首条；调用方传入的 list 已按 current desc + start_date desc 排序。
// ESM 导出（与 src 其它模块同约定）。纯函数、无 import；tests/foodsResolve.test.js 读源 strip-eval 直测本文件。
export function resolveCurrentFood(list, name, species) {
  const foods = Array.isArray(list) ? list : []
  const override = foods.find((f) => f.current === true && f.pet === name)
  const def = foods.find((f) => f.current === true && f.pet === '' && f.species === species)
  return override || def || null
}
