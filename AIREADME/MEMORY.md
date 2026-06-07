# MEMORY — PetsLog
<!-- 踩坑/失败/事故，append-only。别重复踩坑。决策→DECISIONS。 -->

⚑ 暂无记录（出事 / 失败 / 复盘后按下面模板追加）。

<!-- 模板：
## <现象> · YYYY-MM-DD
- 现象:
- 根因:
- 结论/避免:
-->

> 预埋提醒（待落地验证后转正式条目）：
> - 云函数调自建 LLM 网关自签证书若报 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` → 信任 root CA（`ca`/`NODE_EXTRA_CA_CERTS`），勿长期用 `rejectUnauthorized:false`。
> - v1 uniCloud 因空间没续费下线 —— 提醒关注云开发额度 / 续费，别重蹈「下线」覆辙。
