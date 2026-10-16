# 3–5 分钟比赛演示

## 预检

按 DEPLOYMENT.md 配好 Runtime、导入八路径并启动应用。用桌面 1440×900，顶部“模拟演示”保持可见。
AI provider 未配置或响应不通过 guard 时明确演示 demo AI，不宣称 live。
主会话只支持 SO-IND-001；002–004 为独立 seeded 边界案例。

## 初始来源发布（演示环境）

deploy/demo-seed.json 含八条来自已验证主案例的 RAW：ERP100、MES96、QMS96、WMS100，加四源 07:00Z 进度。
来源事实时间分别为 05:00/05:30/05:45/05:50Z，交期 06:00Z，共同水位 07:00Z 满足加一小时边界；没有统一伪造事实时间。
使用 Docker Compose 评审路径时，在发行目录按 [十步快速交付](../JUDGE_QUICK_START.md) 先做只读预检、确认隔离目标，再执行：

```sh
npm run demo:prepare
```

“demo:prepare”会先核对隔离目标与显式授权，再复位本应用内存案例并发布测试 RAW。不要在其他人演示期间运行。不同应用端口在第 05 步通过 `APP_PORT` 配置，完整命令见十步快速交付。

## 连续闭环

| 时间 | 页面与动作 | 必须看到的证据 |
| --- | --- | --- |
| 0:00 | 履约工作台 SO-IND-001 | 100 → 96 → 96 → 100，质量到仓库超出 4 件 |
| 0:30 | 查看判断依据 | 同一订单行/批次关联，四源进度覆盖交期 + 1h |
| 1:00 | AI 协同建议、Evidence Sheet | 数据依据、内部 96 件建议、仍保留客户 100 件；检查 live/demo 来源 |
| 1:40 | 确认处理方案 | WAITING，WMS 仍 100；审批不改来源 |
| 2:00 | 模拟仓库更新 | RAW WMS96 经 EMQX → Node-RED → canonical；四源进度推进 |
| 2:30 | open supOS 数据流播放当前事件 | 实际 canonical ID、阶段回放和 WMS 字段映射，历史 100 保留 |
| 3:00 | UNS ShipmentLine Inspector | 当前 96，sourceOrderLineRef 回指 ERP 订单行 |
| 3:30 | 返回工作台/同步最新状态 | 服务器 revalidation CLOSED；ERP 仍 100，剩余 4 件责任不消失 |

当前服务器在新事实与水位成立后自动复核，不提供独立“人为关闭”API。页面播放是交付回放，不是再执行仓库更新。
重启服务或 reset 清空内存时重复初始 seed；一般历史回放不会改数量。验证中心场景不改变主会话。
完整验证脚本另见 DEPLOYMENT.md，不能用它的最终 WMS96 状态冒充初始冲突。
