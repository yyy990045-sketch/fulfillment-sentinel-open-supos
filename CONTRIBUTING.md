# 贡献指南

## 获取与运行

项目仓库为 [https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos](https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos)。请先 Fork，再 clone 自己的 Fork URL；也可下载源码 ZIP。私有开发仓库的历史不属于本公开仓库。
使用 Node.js ≥22.5，在根目录执行 npm ci、npm run build、npm run demo:judge、npm run demo，访问 localhost:3410。
详细配置见 DEPLOYMENT.md。建议分支 feat/<short-name>、fix/<short-name>、docs/<short-name>。
提交说明写改动目的与范围；一个提交聚焦一个问题，不提交密钥、个人配置、生成产物或无关截图。

## 目录责任

| 目录 | 责任 |
| --- | --- |
| frontend/src | 三个产品空间、场景与前端数据 adapter |
| src/public | 静态服务与现有应用接口 |
| src/integrations/open-supos | canonical 契约、接入、lineage、ProductView |
| src/demo/judge | 确定性判定契约与演示生成 |
| src/ai/copilot | 受事实约束的 AI 解释与校验 |
| src/simulator, src/solution-packs | 演示来源与方案包 |
| deploy | Flow 导出、五模型初始化、安全播种和只读预检探针，不包含平台安装包 |
| docs, scripts | 架构、演示、发行审计 |

## 验证改动

先实际打开受影响页面并完成主要操作；说明数据来自 demo 还是真实 canonical。工程辅助检查使用 npm run build。
本地判定演示：npm run demo:judge。只在隔离的演示 Runtime 上运行 npm run open-supos:verify 及 lineage-negative 命令；它们会发布测试 RAW，不是只读查询。
tests/copilot-ai.test.ts 是保留的 Vitest 测试源码；本发行版没有 Vitest 依赖及测试脚本，不能声称 npm test 可运行。本轮没有新增测试框架。
涉及判定、引用、时间或处置变化需提供前后输入与结果，明确审批不改来源、来源不齐停止判断。

## Issue / PR

使用 Bug Report 或 Feature Request 模板：Problem、Reproduction、Proposed Change、Runtime Impact、Truth Boundary Impact。
附复现命令、版本与脱敏结果，不附生产凭据。PR 使用同样五项并列出验证步骤、依赖/许可变更。
维护者 review 后决定合入；不要改 Judge / Runtime / UNS Contract 却省略影响说明。
缺陷和需求使用 [Issues](https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos/issues)，代码改动通过 [Pull requests](https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos/pulls) 提交。不要在公开 Issue 或 PR 中附带凭据或生产数据。

## 许可

本项目 Apache-2.0，贡献按该许可提交；第三方源码和依赖保留各自许可证及归属，不重新许可。
