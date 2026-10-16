# 开源治理

## Maintainer

当前采用单 Maintainer 模式，由项目 Owner 负责审查、许可与发行决策。未设委员会，也未宣称多人社区团队；此文不编造姓名或组织。
项目 [Issues](https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos/issues) 用于问题与需求，[Pull requests](https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos/pulls) 用于代码审查。安全敏感内容按 SECURITY.md 处理，不提交凭据或生产数据。

## Issue / Feature Request / Bug Report

缺陷写复现步骤、输入与预期/实际结果；需求写业务任务、最小范围和对 Runtime / truth boundary 的影响。
使用 .github/ISSUE_TEMPLATE，安全问题按 SECURITY.md 私下报告。
Maintainer 确认范围、是否需要契约讨论和验收方式；不以功能数量取代业务闭环。

## Pull Request / Review

PR 说明 Problem、Reproduction、Proposed Change、Runtime Impact、Truth Boundary Impact 和实际操作结果。
Review 检查业务身份、时间完整性、审批/事实分离、AI 依据、源码/依赖许可以及秘密数据。
小改动优先，不引入未经讨论的规则引擎、后台能力或 UI 架构。作者保留第三方归属；本项目贡献遵循 Apache-2.0。

## Release

发布前确定候选 commit、执行锁文件许可清单、秘密/无关内容扫描、build、Quick Start 与文档链接检查。
本公开仓库从已审计源码快照独立初始化，不导入私有开发历史。后续发行仍需维护者审核，先完成依赖、秘密、文档与真实业务验证，再发布对应版本。
发布记录区分 simulated input、真实 Runtime 验证和未验证能力；不继承上一版本 PASS。
