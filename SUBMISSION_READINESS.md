# 提交版本说明

## 当前版本

项目仓库：[https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos](https://github.com/yyy990045-sketch/fulfillment-sentinel-open-supos)。

本仓库基于2026-10-13已审计最终源码候选独立初始化；未导入私有开发历史。除公开链接、贡献入口及本说明等文档外，业务源码、依赖锁文件、部署配置、Judge、UNS与Flow保持基线一致。

## 已有验证

已验收候选完成原Dockerfile构建、HTTP健康检查、Preflight、授权Prepare与Verify，在隔离open supOS CE V1.5.0.0-M中通过一次真实平台闭环：100/96/96/100冲突 → 人工确认且WMS仍100 → 新WMS96 RAW经EMQX/Node-RED/canonical/UNS → 重新验证关闭，ERP100和客户剩余4件需求保留。

实际证据见[发行复测](docs/release-validation.md)，部署见[评委快速指南](JUDGE_QUICK_START.md)。本次公开动作没有重新运行上述业务测试；只进行源码一致性、内容、许可、文档及远程访问核对。

## 版本边界与其他提交材料

- 本仓库不含后续本地Stage A/Stage B可信来源和持久化增强；不得配合介绍这些新增能力的材料宣称同版实现。
- 内存重启需显式重新播种；原生应用管理安装、TSDB历史、生产鉴权与真实工厂执行未通过或未实现。
- 项目提交表、PPT、作品介绍和视频按官方提交要求另行准备，并与所选源码版本一致。源码公开不代表比赛材料已经全部提交。
- 官方赛事入口为 https://www.oschina.net/os2026/ ，以报名确认邮件和最新官网要求为准。
