# SPEC — PetsLog
<!-- 数据契约 / 数据字典：collection 字段定义是内部真相源。对外 API 见文末（当前 N/A）。实现→ARCHITECTURE，为何→DECISIONS。 -->

> 数据库 = 微信云开发文档型。隔离键：业务数据按 `family_id`（见 ADR-008），`users` 按 `_openid`。
> 标记：**[占位]** = 模型已定、建设排后（foods）。ADR-011/012/013 批次：轮1 字段已落地 v0.3.1，轮2 附件（attachments / att_count / storage_bytes / att_log）已落地 v0.3.2。ADR-014（price_base / intro / foods）v0.4.0、ADR-015（avatar_emoji / new_pet / pet_unknown）v0.4.2、ADR-018（time 到分）已落地；**ADR-019（tag 收敛 + 病程视图）/ ADR-020（raw 服务端落库 + tag 候选 + 解析收紧）= 代码已落 + 云函数已部署，待真机验 + commit；clean_tags 治理待触发、ADR-020 评测先行（合成集）待建**。
> 字段值约定：日期一律 `'YYYY-MM-DD'` 字符串（唯 records.time 可带时刻 `'YYYY-MM-DD HH:mm'`，ADR-018；meds / reminders / foods 等日期字段仍纯日期）；金额 / 体重为 number；时间戳 `created_at/updated_at` 为毫秒 number。

## pets（宠物档案 · family 隔离）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 家庭隔离键 |
| name | string | 名字，family 内唯一；改名级联 records / reminders 的 pet |
| species | 'cat' \| 'dog' | 仅猫狗（红线） |
| breed | string | 品种 |
| birthday | string | 生日 'YYYY-MM-DD' |
| neutered | boolean | 绝育 |
| allergy | string | 过敏史 |
| chronic | string | 慢病 / 病史 |
| latest_weight | number \| null | 最新体重 kg |
| latest_weight_date | string | 最新体重日期（防补录旧体重覆盖「最新」） |
| home_date | string | 到家日期 'YYYY-MM-DD'（陪伴时长） |
| note | string | 备注（自由文本，如来历故事） |
| intro | string | 简介（自由文本，用户自填；与 note 区分：note 偏备忘、intro 偏介绍，见 ADR-014） |
| price_base | number \| null | 初始身价（元，ADR-014 反转 ADR-013「身价不入库」）；当前身价不落库 = price_base + 该宠 records.cost 累计，前端实时派生 |
| avatar | string(fileID) | 头像照片，云存储 fileID（换头像 / 删宠物会删旧文件防孤儿，v0.3.2） |
| avatar_emoji | string | 自选 emoji 头像（ADR-015）。显示优先级：avatar 照片 > avatar_emoji > 物种默认 🐱/🐶；前端选 emoji 时清空 avatar（pets update 顺带删旧照片文件） |
| created_at / updated_at | number | updated_at 仅 update 时写入，新建文档暂无（reminders 则 add 即写） |

> EDITABLE 白名单（pets update）需同步加 home_date / note / intro / avatar / price_base / avatar_emoji。
> 「当前身价」与「累计花费」均派生：累计花费 = 该宠 records.cost 之和；当前身价 = price_base + 累计花费（前端聚合，不落库）。
> 宠物名解析契约（ADR-015，录入防错别字）：parseRecord 输出 `new_pet`（LLM 判定的「明确新增宠物」意图）+ `pet_unknown`（名字无匹配且非新增意图，前端确认卡片须让用户从已有宠物点选）+ 顶层回传 `pets` 名单；模糊匹配（编辑距离 ≤1 / 互含，按 code point 算，**唯一候选才 snap**）只发生在 parse 层（结果用户在卡片可见）。saveRecord 对 record + reminder 都先验名：在库 → 用；record 且 `new_pet=true` 或 0 宠家庭首录 → 建档；其余拒 `code:'PET_UNKNOWN'`（附 pets 名单 + suggest 建议名，零写入，**落库层不静默 snap**）。模糊匹配函数 parseRecord / saveRecord 各持一份，改须两处同步。

## records（健康时间线 · family 隔离）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 隔离键 |
| pet | string | 宠物名（按名匹配，故改名要级联） |
| time | string | 事件时间，精确到分 `'YYYY-MM-DD HH:mm'`；缺时刻则纯日期 `'YYYY-MM-DD'`（旧数据 / AI 未给时刻）。saveRecord + parseRecord 的 `normalizeDateTime` 归一，日期段定长零填充保字典序（兽医小结按 time 排）。见 ADR-018 |
| event_type | enum | 症状 / 用药 / 疫苗 / 驱虫 / 体重 / 就医 / 其它（7 桶） |
| weight | number \| null | 体重 kg |
| med | string \| null | 用药（可多行：外用 / 口服 / 注射） |
| raw | string | 用户输入的字面原文，**服务端逐字落库**（不经 LLM 回填，防原文失真）；与 desc（清洗描述）分立，见 ADR-020 |
| hospital | string | 就诊医院（落库 trim） |
| cost | number \| null | 费用（元）；三态可区分：null=未解析 / 0=免费 / 正数 |
| tag | string | 病程标签 = **病程线**（同一慢病 / 疗程的主题词，如嗜酸性肉芽肿 / 尿闭 / 软骨病），可空；与 event_type 双轴**正交**（事件类别归 event_type、里程碑归专用字段，不重复打 tag）；落库 trim 防散裂。治理后非病程 tag（驱虫 / 疫苗 / 记录体重 / 体检 / 到家 / 绝育 / 未知，均为库内实际 tag 值）清空，见 ADR-019 |
| desc | string | 干净事件描述（症状 / 处置，不含费用 / 医院 / 寒暄），parseRecord 抽取；给兽医小结拼接用，不暴露 raw 原话 |
| attachments | array | `[{ fileID, thumb(缩略图 fileID，可空), type:'image'\|'pdf'\|'video', name, size(主文件真实体积), bytes(计配额体积=主+缩略，删除按它回收), uploaded_at }]`，单条 ≤9；由 attachment 云函数登记（服务端 HEAD 复核真实体积，客户端报的 size 不可信） |
| att_count | number | 附件数（时间线 📎 角标） |
| created_at | number | ms。**由事件时间 time 派生**（`createdAtFromTime`）：有分用准点（东八区），仅日期用当日 12:00（延续导入约定，避免补录旧记录排到时间线顶）。主时间线 / 体重图按此排序。见 ADR-018 |

> 双轴：event_type 管「事件类型」（配色 / 分类），tag 管「病程线」。病程**完整视图**按 (宠, tag) 取记录（天然不跨宠混合），含概览聚合（起止 / 跨度 / 记录数 / 已记花费 / 体重趋势），见 ADR-019；简版 = 时间线按 tag 筛。
> 批量录入：给全家做同一件事（驱虫 / 疫苗）= 录入时多选宠物 → 生成 N 条 records，仍 per-pet。

## meds（家庭药品库存 · family 隔离 · 本轮不动）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 隔离键 |
| name | string | 药名 |
| effect | string | 功效 |
| quantity | number | 数量（默认 1） |
| expire_date | string | 过期日 'YYYY-MM-DD' |
| created_at | number | |

## reminders（用药 / 疫苗 / 驱虫提醒 · family 隔离 · 本轮不动）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 隔离键 |
| pet | string | 宠物名（可空） |
| type | enum | 用药 / 疫苗 / 驱虫 / 其它 |
| title | string | 事项 |
| next_date | string | 下次到期 'YYYY-MM-DD' |
| repeat_days | number | 周期天数，0 = 一次性 |
| note | string | 备注 |
| done | boolean | 完成（重复项靠顺延 next_date，不置 done） |
| created_at / updated_at | number | |

## families（家庭 · 多租户骨架）
| 字段 | 类型 | 说明 |
|---|---|---|
| _id | string | 家庭 id（= 各业务表 family_id） |
| name | string | 家庭名 |
| owner | string(openid) | 管理员 |
| storage_bytes | number | 附件云存储用量计数（登记 +bytes、删除 −bytes，原子 inc；家庭总量 ≤1GB；并发下与真实用量可能轻微漂移，见 ADR-011 tradeoff） |
| created_at | number | |

## family_members（成员关系 · 多对多真相源）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | |
| openid | string | 成员 |
| role | 'admin' \| 'member' | 角色 |
| nickname | string | 兜底昵称（成员显示以 users 为准，见 ADR-009 users + CHANGELOG v0.3.0 成员档案显示修复） |
| joined_at | number | |

## invites（邀请码）
| 字段 | 类型 | 说明 |
|---|---|---|
| code | string | 6 位码（排除易混字符） |
| family_id | string | |
| created_by | string(openid) | |
| created_at / expires_at | number | 默认 7 天有效 |
| max_uses | number | 0 = 不限次 |
| used_count | number | 原子占名额 |

## users（个人档案 · openid 隔离）
| 字段 | 类型 | 说明 |
|---|---|---|
| _openid | string | **必须显式写**（云函数 add 不自动注入，见 MEMORY） |
| nickname | string | 昵称 |
| avatar | string(fileID) | 微信头像，云存储（换头像删旧文件防孤儿，v0.3.2，与 pets.avatar 同机制） |
| created_at / updated_at | number | |

## parse_log（解析限流流水 · family 隔离）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 隔离键 |
| day | string | 'YYYY-MM-DD' |
| at | number | 毫秒时间戳；每次解析 add 一条流水（非计数器） |

> 限流 = 按 `family_id + day` `count()` 文档条数 ≥ DAILY_LIMIT（默认 50，env `DAILY_PARSE_LIMIT` 可调）。

## att_log（附件日上传量流水 · family 隔离）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 隔离键 |
| day | string | 'YYYY-MM-DD'（北京时区） |
| bytes | number | 本次登记计入配额的总字节（主文件 + 缩略图，真实体积） |
| at | number | 毫秒时间戳；每次 register add 一条流水 |

> 日上传限速（≤200MB/天/家庭）= 当日流水 bytes 求和 + 本次 > 上限即拒（attachment 云函数 register）。

## foods（主粮台账 · family 级 · v0.4.0 建设，ADR-014）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 家庭级隔离键，不分宠 |
| name | string | 主粮品牌 / 名称 |
| start_date | string | 起始 'YYYY-MM-DD' |
| end_date | string | 结束 'YYYY-MM-DD'（空 = 当前在喂） |
| current | boolean | 是否当前主粮；设某条 current=true 时云函数自动把同家庭其它条置 false（家庭通常只一个在喂） |
| note | string | 备注 |
| created_at / updated_at | number | |

> foods 云函数：list / add / update / delete，family 隔离 + assertMember。导入历史 12 条（Notion 主粮记录，日期区间 → start/end，最近一条 current）。

---

## 对外 API
— N/A。PetsLog 是终端产品（微信小程序），不对外暴露 API、不被其它系统集成，是 LLM 网关的**消费方**而非被集成方。
- 消费的上游契约（自建 LLM 网关端点 / 鉴权 / 模型）→ OpenAI 兼容；私有部署坐标见私有配置，架构见 ARCHITECTURE 数据流。
- AI 自然语言 → 结构化 JSON（云函数与 LLM 之间的内部形状）→ 见 PRD「AI 解析字段」+ ARCHITECTURE。
> 若未来开放第三方接入（对接宠物医院 / 导出 API），在此填端点 + 鉴权 + 版本兼容。
