# Runtime Proof

真实 open supOS Runtime、EMQX、Node-RED canonical flow 和 UNS 模型验证已完成。验证链路为来源 MQTT → EMQX → Node-RED → canonical UNS → Fulfillment Sentinel。公开仓库不包含 Runtime 主机地址、broker 凭据、个人机器路径或验证机专属配置。

验证数据是模拟工业数据，并非真实工厂事实。open supOS TSDB 持久化尚未验证。

```text
SIMULATED_INDUSTRIAL_DATA=true
REAL_FACTORY_DATA=false
REAL_OPEN_SUPOS_RUNTIME=true
REAL_OPEN_SUPOS_EMQX=true
REAL_OPEN_SUPOS_NODERED_FLOW=true
REAL_OPEN_SUPOS_UNS_MODEL=true
OPEN_SUPOS_TSDB_PERSISTENCE_VERIFIED=false
```

本地 synthetic demo 不连接真实 Runtime。实时验证需要使用者自行配置 `J2_MQTT_URL` 和可选凭据。

## 发行审计的只读复查（2026-10-07）

现有部署 ProductView 返回 200、connected=true、REVALIDATED_CLOSED、lineage=RESOLVED，当前 13 条事件。
来源数量为 ERP100 / MES96 / QMS96 / WMS96。共同水位 2026-03-01T08:00:00.000Z，交期加一小时边界 07:00Z；来源日期为演示事实日期，不伪装成当天工厂生产。
当前 canonical WMS96 的内容派生 ID 为 j2-026005be7d0e0cc6830d9c3a，先前 WMS100 ID 为 j2-32e76aff2fa5426140239f2a。
本轮只读取现有状态、导出 Flow 并核对函数；未重新发布到真实 broker、修改 Flow 或改变业务状态。
八条导出函数与现有 Node-RED 原函数一致；本地 seed-to-function 检查不是新的真实 Runtime 验证。
已有 live AI 证据来自 Integration-R1 / UI-R9；本轮未调用付费模型或接入新的提供者。

Node-RED 运行文件 SHA-256：cb5124116ee8711d2b8a56b249aa29b1afd9cc81b8c82813156f6ee189c26ad9，本轮未变。
