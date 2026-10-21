# 独立结果审核

CT-527 从不可变的[审核包](../../evidence/poc/ct-527-independent-review-packet-20261021.json)开始。审核包锁定 CT-521 至 CT-526 的公开回执、源提交、共同环境指纹、必审步骤和签署 Schema。

审核人必须独立于实测执行方，以只读方式访问受限证据包，重新计算全部引用哈希，检查原始失败样本与统计代码，并在选择 `accepted`、`qualified` 或 `rejected` 前记录发现。在合规签署文件产生之前，CT-527 状态保持 `awaiting_independent_review`；审核包准备完成不等于审核通过。
