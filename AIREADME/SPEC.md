# SPEC — PetsLog
<!-- 数据契约 / 数据字典：collection 字段定义是内部真相源。对外 API 见文末（当前 N/A）。实现→ARCHITECTURE，为何→DECISIONS。 -->

> 数据库 = 微信云开发文档型。隔离键：业务数据按 `family_id`（见 ADR-008），`users` 按 `_openid`。
> 标记：**[新]** = 本批次（ADR-011/012/013）尚未落地项（轮2 附件 attachments / att_count / storage_bytes）；轮1 字段（records hospital / cost / tag、pets home_date / note / avatar、event_type 驱虫桶）已落地 v0.3.1；**[占位]** = 模型已定、建设排后（foods）。
> 字段值约定：日期一律 `'YYYY-MM-DD'` 字符串；金额 / 体重为 number；时间戳 `created_at/updated_at` 为毫秒 number。

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
| avatar | string(fileID) | 头像照片，云存储 fileID（无则前端 emoji 兜底；换头像旧文件暂不清理，见 ROADMAP 待办） |
| created_at / updated_at | number | updated_at 仅 update 时写入，新建文档暂无（reminders 则 add 即写） |

> EDITABLE 白名单（pets update）需同步加 home_date / note / avatar。
> 不存「身价」；「累计花费」= 该宠 records.cost 之和（前端聚合展示）。

## records（健康时间线 · family 隔离）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 隔离键 |
| pet | string | 宠物名（按名匹配，故改名要级联） |
| time | string | 记录日期 'YYYY-MM-DD' |
| event_type | enum | 症状 / 用药 / 疫苗 / 驱虫 / 体重 / 就医 / 其它（7 桶） |
| weight | number \| null | 体重 kg |
| med | string \| null | 用药（可多行：外用 / 口服 / 注射） |
| raw | string | 原文 / 事件描述 |
| hospital | string | 就诊医院（落库 trim） |
| cost | number \| null | 费用（元）；三态可区分：null=未解析 / 0=免费 / 正数 |
| tag | string | 病程标签（嗜酸性肉芽肿 / 尿闭 / 软骨病…，可空；与 event_type 双轴；落库 trim 防同名病程线散裂） |
| desc | string | 干净事件描述（症状 / 处置，不含费用 / 医院 / 寒暄），parseRecord 抽取；给兽医小结拼接用，不暴露 raw 原话 |
| **attachments** | array | **[新]** `[{ fileID, type:'image'\|'pdf'\|'video', name, size, uploaded_at }]`，单条 ≤9 |
| **att_count** | number | **[新]** 附件数（列表角标） |
| created_at | number | |

> 双轴：event_type 管「事件类型」（配色 / 分类），tag 管「病程线」（按 tag 筛 = 病程视图，先简版）。
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
| **storage_bytes** | number | **[新]** 附件云存储用量计数（上传 +size、删除 −size；家庭总量 ≤1GB） |
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
| avatar | string(fileID) | 微信头像，云存储 |
| created_at / updated_at | number | |

## parse_log（解析限流流水 · family 隔离）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 隔离键 |
| day | string | 'YYYY-MM-DD' |
| at | number | 毫秒时间戳；每次解析 add 一条流水（非计数器） |

> 限流 = 按 `family_id + day` `count()` 文档条数 ≥ DAILY_LIMIT（默认 50，env `DAILY_PARSE_LIMIT` 可调）。
> 附件**日上传量限速**（≤200MB/天/家庭）走类似「family_id + day」流水统计（新 upload_log 表或带 size 的流水，建设时定）。

## foods（主粮台账 · family 级 · **[占位]** 排后建）
| 字段 | 类型 | 说明 |
|---|---|---|
| family_id | string | 家庭级，不分宠 |
| name | string | 主粮品牌 |
| start_date / end_date | string | 起止（end_date 空 = 当前在喂） |
| current | boolean | 是否当前主粮 |
| note | string | 备注 |

---

## 对外 API
— N/A。PetsLog 是终端产品（微信小程序），不对外暴露 API、不被其它系统集成，是 LLM 网关的**消费方**而非被集成方。
- 消费的上游契约（自建 LLM 网关端点 / 鉴权 / 模型）→ OpenAI 兼容；私有部署坐标见私有配置，架构见 ARCHITECTURE 数据流。
- AI 自然语言 → 结构化 JSON（云函数与 LLM 之间的内部形状）→ 见 PRD「AI 解析字段」+ ARCHITECTURE。
> 若未来开放第三方接入（对接宠物医院 / 导出 API），在此填端点 + 鉴权 + 版本兼容。
