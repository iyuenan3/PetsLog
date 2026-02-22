# PetsLog uniCloud 数据库设计（待确认）

本文档为「数据表清单 + 字段设计 + 索引建议」，确认后再进行建表与云函数开发。

---

## 一、表清单总览

| 序号 | 表名（集合名） | 说明 |
|------|----------------|------|
| 1 | `family` | 家庭表 |
| 2 | `family_member` | 家庭成员表 |
| 3 | `pet` | 宠物档案表 |
| 4 | `record` | 记录表（一只宠物 + 一次事件） |
| 5 | `staple_food` | 主粮记录表 |

**说明：** 附件与头像存储在 uniCloud 云存储，表中仅存 `fileID`（或 URL），不单独建「附件表」。

---

## 二、各表字段设计

### 1. family（家庭表）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | string | 是 | 系统自动，主键 |
| name | string | 是 | 家庭名称，如「小明的家庭」 |
| created_by | string | 是 | 创建人 user_id（uni-id） |
| created_at | number | 是 | 创建时间，时间戳（毫秒），北京时间 |

**索引建议：** 见第四节。

---

### 2. family_member（家庭成员表）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | string | 是 | 系统自动，主键 |
| family_id | string | 是 | 关联 family._id |
| user_id | string | 是 | 用户 ID（uni-id） |
| joined_at | number | 是 | 加入时间，时间戳（毫秒） |

**约束：** 同一 `(family_id, user_id)` 仅允许一条记录（唯一索引）。  
**索引建议：** 见第四节。

---

### 3. pet（宠物档案表）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | string | 是 | 系统自动，主键 |
| family_id | string | 是 | 所属家庭 |
| avatar | string | 否 | 头像 fileID（云存储），无头像可为空 |
| name | string | 是 | 姓名 |
| breed | string | 是 | 品种（物种+品种），如「缅因猫」「田园犬」 |
| birthday | string | 否 | 生日，格式 YYYY-MM-DD |
| home_date | string | 否 | 到家日期，格式 YYYY-MM-DD |
| initial_price | number | 否 | 初始身价，单位：分（整数） |
| intro | string | 否 | 简介，纯文本 |
| medical_history | string | 否 | 病史，纯文本 |
| remark | string | 否 | 备注，纯文本 |
| status | string | 是 | 宠物状态：`normal` 正常 / `passed` 去世 / `left` 离家；仅 `normal` 可被选入「添加记录」 |
| tags | array | 否 | 预留，字符串数组，如 `["易应激"]` |
| created_at | number | 是 | 创建时间，时间戳（毫秒） |
| updated_at | number | 是 | 更新时间，时间戳（毫秒） |

**索引建议：** 见第四节。

---

### 4. record（记录表）

**业务规则：** 一条记录 = 一只宠物 + 一次事件；用户选多只宠物提交时，前端/云函数拆成多条写入。事件类型为「其他」时，事件描述必填；事件类型为「称重」时，体重必填。

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | string | 是 | 系统自动，主键 |
| family_id | string | 是 | 所属家庭，便于按家庭查 |
| pet_id | string | 是 | 关联 pet._id |
| event_type | string | 是 | 事件类型：`vomit` 呕吐 / `diarrhea` 拉稀 / `blood_stool` 便血 / `clinic` 就诊 / `weigh` 称重 / `deworm` 驱虫 / `other` 其他 |
| date | string | 是 | 记录日期，格式 YYYY-MM-DD |
| time | string | 是 | 记录时间，格式 HH:mm |
| datetime | number | 是 | 冗余：该记录对应的日期时间时间戳（毫秒），便于排序与范围查询；由前端或云函数根据 date+time 计算（北京时间） |
| event_desc | string | 条件 | 事件描述，可选；当 event_type 为 `other` 时必填 |
| weight | number | 条件 | 体重，单位 kg，精度 0.01（前端展示两位小数）；当 event_type 为 `weigh` 称重时必填 |
| medicine | string | 否 | 用药说明 |
| hospital | string | 否 | 就诊医院 |
| cost | number | 否 | 费用，单位：分（整数） |
| attachments | array | 否 | 附件 fileID 列表，最多 5 个；单文件 ≤10MB，类型不限制 |
| tags | array | 否 | 预留，字符串数组 |
| created_at | number | 是 | 创建时间，时间戳（毫秒） |
| updated_at | number | 是 | 更新时间，时间戳（毫秒） |
| created_by | string | 否 | 创建人 user_id，便于审计 |

**索引建议：** 见第四节（含按宠物、日期、用药、关键词的筛选与按日期由远及近排序）。

---

### 5. staple_food（主粮记录表）

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| _id | string | 是 | 系统自动，主键 |
| family_id | string | 是 | 所属家庭 |
| brand | string | 是 | 品牌 |
| model | string | 否 | 型号/口味，如「六种鱼」「P40」 |
| pet_ids | array | 是 | 食用对象，pet._id 数组，可多选 |
| start_date | string | 是 | 起始日期，格式 YYYY-MM-DD，仅日级别 |
| end_date | string | 否 | 结束日期，格式 YYYY-MM-DD；为空表示「至今」 |
| duration_days | number | 否 | 持续时间（天），冗余；当 end_date 为空时不填，由前端按 start_date 至当前日计算 |
| tags | array | 否 | 预留 |
| created_at | number | 是 | 创建时间，时间戳（毫秒） |
| updated_at | number | 是 | 更新时间，时间戳（毫秒） |

**索引建议：** 见第四节。

---

## 三、事件类型枚举（前端 + 云函数校验）

| 值 | 中文 |
|----|------|
| vomit | 呕吐 |
| diarrhea | 拉稀 |
| blood_stool | 便血 |
| clinic | 就诊 |
| weigh | 称重（此时 weight 必填） |
| deworm | 驱虫 |
| other | 其他（此时 event_desc 必填） |

**条件校验：** `other` → 必填 event_desc；`weigh` → 必填 weight。

---

## 四、索引建议

### 4.1 family

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| 默认 | _id | 主键 | 系统 |

无需额外索引。

---

### 4.2 family_member

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| 默认 | _id | 主键 | 系统 |
| idx_family_user | family_id, user_id | 唯一 | 查某用户是否在某家庭；保证同一家庭下同一用户仅一条 |
| idx_user | user_id | 普通 | 查某用户所属家庭列表 |

---

### 4.3 pet

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| 默认 | _id | 主键 | 系统 |
| idx_family_status | family_id, status | 普通 | 按家庭查宠物列表，可筛 status=normal 供「添加记录」用 |

---

### 4.4 record

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| 默认 | _id | 主键 | 系统 |
| idx_family_datetime | family_id, datetime | 普通 | 家庭维度按时间排序（由远及近用 desc） |
| idx_family_pet_date | family_id, pet_id, date | 普通 | 按宠物、日期筛选；体重趋势按宠物+日期查 |
| idx_family_pet | family_id, pet_id | 普通 | 按宠物筛选记录 |

**说明：** 关键词、用药等全文/模糊搜索，MVP 可用前端过滤或简单 `record.event_desc` / `record.medicine` 等字符串包含查询；若数据量大再考虑全文索引或独立搜索方案。

---

### 4.5 staple_food

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| 默认 | _id | 主键 | 系统 |
| idx_family | family_id | 普通 | 按家庭查主粮列表（当前 + 历史） |

---

## 五、其他约定

- **时区与时间：** 默认北京时间；`created_at` / `updated_at` / `datetime` 均为时间戳（毫秒）。
- **金额：** 人民币，单位分，整数存储。
- **体重：** 单位 kg，精度 0.01，数字类型。
- **附件：** 最多 5 个/条，单文件 ≤10MB，存 fileID 数组；类型不区分。
- **宠物删除：** 有历史记录或主粮引用的宠物不允许删除，仅可改状态为「去世」或「离家」；只有 `status=normal` 的宠物可被选入添加记录。
- **主粮删除：** MVP 允许任意删除，无级联影响。

确认无误后，将按此设计创建 uniCloud 集合与基础云函数（含家庭/成员、宠物、记录、主粮的增删改查及权限校验）。
