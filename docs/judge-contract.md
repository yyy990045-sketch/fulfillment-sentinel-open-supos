# Judge Contract

当前主场景比较 ERP 订单承诺、MES 完工、QMS 放行和 WMS 执行承诺。判定需要同时满足：

- Same Object：跨系统事实必须指向同一业务对象，并通过 lineage 关系解析。
- Source Complete：相关来源进度事实齐备。
- Same Time Boundary：使用共同 Global Watermark 判断事实是否完整。
- Cross-System Invariant：比较订单承诺与生产、质量和发运事实，定位真实状态冲突。

内部 disposition 不改变 WMS 的现实执行事实。只有新来源事实到达并通过 revalidation，状态才可关闭。AI 推荐是可选解释；审批与执行由既有治理流程约束。
