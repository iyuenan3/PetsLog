# PetsLog 云数据库集合说明

请在 **uniCloud Web 控制台** → **云数据库** 中手动创建以下 5 个集合（表）。集合名为英文，创建空集合即可，字段在首次写入时由云函数带出。

| 集合名 | 说明 |
|--------|------|
| family | 家庭表 |
| family_member | 家庭成员表 |
| pet | 宠物档案表 |
| record | 记录表 |
| staple_food | 主粮记录表 |

## 建议索引（创建集合后在控制台「索引管理」中添加）

- **family_member**：唯一索引 `family_id` + `user_id`；普通索引 `user_id`
- **pet**：普通索引 `family_id` + `status`
- **record**：普通索引 `family_id` + `datetime`；`family_id` + `pet_id` + `date`
- **staple_food**：普通索引 `family_id`

详细字段与规则见项目根目录 `docs/uniCloud-database-design.md`。
