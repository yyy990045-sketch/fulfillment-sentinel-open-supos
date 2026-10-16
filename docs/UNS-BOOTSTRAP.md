# open supOS V1.5.0.0-M：J2 UNS 模型复建清单

本清单根据 2026-10-08 当前运行实例的“数据建模 → 工厂模型”页面逐项读取。在独立 V1.5.0.0-M 平台上，已通过原生 OpenAPI 实测 `deploy/provision-uns.mjs` 创建五个文件，并在模拟 RAW 发布后通过原生当前值 API 查到事实。脚本只在干净隔离平台运行一次；评委按 [十步快速交付](../JUDGE_QUICK_START.md) 操作。当前平台的 UNS“导出”点击生成时返回“有接口不存在”，因此没有可移植的官方导出 JSON。

在隔离的评审 open supOS 实例中进入“数据建模 → 工厂模型”，创建 `supos` 文件夹，再在该文件夹中创建下列五个**时序型、自定义属性**文件。完整 MQTT topic 为 `/supos/<文件名>`。新建表单会自动加入 `quality: LONG` 和 `timeStamp: DATETIME`，只需增加表中其余字段。当前实例的“启用历史数据”为“否”；不要据此声称 TSDB 持久化已验证。若表单默认启用“模拟数据”，在受控演示中关闭它，避免平台生成额外事实；此项尚未在全新平台实测。

| 文件 | 自定义字段与类型 |
| --- | --- |
| `J2_ERP_OrderLine` | `businessKey STRING`, `orderLineRef STRING`, `requiredQty DOUBLE`, `dueAt DATETIME`, `sourceTime DATETIME` |
| `J2_MES_Production` | `businessKey STRING`, `productionOrderRef STRING`, `orderLineRef STRING`, `productionLotRef STRING`, `completedQty DOUBLE`, `state STRING`, `sourceTime DATETIME` |
| `J2_QMS_Quality` | `businessKey STRING`, `qualityLotRef STRING`, `productionLotRef STRING`, `releasedQty DOUBLE`, `sourceTime DATETIME` |
| `J2_WMS_Shipment` | `businessKey STRING`, `shipmentLineRef STRING`, `sourceOrderLineRef STRING`, `executionCommittedQty DOUBLE`, `sourceTime DATETIME` |
| `J2_SourceProgress` | `businessKey STRING`, `sourceSystem STRING`, `eventType STRING`, `sourceProgressAt DATETIME`, `sourceTime DATETIME` |

这些引用是消息内的业务键关系，不是额外的原生数据库外键：MES.`orderLineRef` → ERP.`orderLineRef`；QMS.`productionLotRef` → MES.`productionLotRef`；WMS.`sourceOrderLineRef` → ERP.`orderLineRef`。不要把 WMS 错接到 QMS 批次。`J2_SourceProgress` 中每个来源分别报告覆盖时间；共同水位需覆盖交期加一小时。

随后在 Node-RED Editor **导入** `deploy/nodered-j2-flow.json` 的八条 J2 路径；它含 8 个 MQTT in、8 个函数和 8 个 MQTT out。导入前检查目标实例没有同名 Flow、节点 ID 或 `/source/j2/*` topic 冲突，配置 broker 为当前平台的 `emqx:1883` 或其实际地址，只部署新导入的节点。此步骤不能由应用 Compose 自动创建；本次已在独立 Node-RED 的原空白“流程 1”中实际导入并部署。

验证时先启动应用，执行只读 `npm run demo:preflight`，人工确认目标后运行 `npm run demo:prepare` 和 `npm run demo:verify`。Prepare 会先建立 canonical 订阅再发布 RAW；直接运行 `seed-runtime.mjs` 需要 `DEMO_RESET_AUTHORIZED=YES`，不建议绕开目标环境检查。在平台模型页面检查五个 topic，并以应用 `product-view` 的 lineage、来源进度和状态作为业务证据。若目标版本无法建模或导入 Flow，应停止验收并记录原始错误，不能只用 seeded 页面替代。
