# 证据导入契约

CT-604 零依赖参考引擎在 CT-603 完整性验证之后，把带外部锚点的 Evidence
Core 包导入不可变身份台账，并检查规范单位、UTC 时间顺序、精确版本引用、
租户闭包、幂等语义和追加式失败记录。

台账只保存身份与指纹，不保存客户原始内容。它是互操作参考实现，不是托管
数据库、身份系统、授权服务、测量复核方或认证机构。

参见[中文规范](../../docs/evidence/import-and-idempotency-v1.zh-CN.md)或
[英文规范](../../docs/evidence/import-and-idempotency-v1.md)。
