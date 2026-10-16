# PUBLIC_RELEASE_AUDIT — GITHUB-PUBLIC-RELEASE-R1-FINAL

2026-10-16展示修订补充：本分支已完成前端可见闭环优化和新的隔离平台、浏览器验收，详见[修订验收](docs/visible-workflow-validation.md)。本轮再次执行公开源码扫描并更新文件清单；以下2026-10-13审计是历史基线记录，不代表修订后的全部文件仍与R2逐字节相同。

公开导出说明（2026-10-16）：本仓库根据已授权的已审计候选独立初始化，不包含旧仓库分支或历史；仅更新仓库链接、贡献入口、版本与清单。以下为2026-10-13原验收记录，其中未发布状态描述当时情况。当前代码不含后续本地Stage B，未重新执行或追加声称本轮业务测试。

日期：2026-10-13。对象为校验通过的 R2 ZIP 独立提取的发布候选。本轮不创建仓库、不 push、不 merge、不公开旧私有仓库；不改原工作区、原 Docker Desktop 平台及 Volume。

## 最终状态

```text
R2_SOURCE_VERIFIED=true
RELEASE_FILES_COMPLETE=true
LICENSE_REVIEW_PASS=true
THIRD_PARTY_REVIEW_PASS=true
SECRET_SCAN_PASS=true
README_READY=true
QUICK_START_READY=true
COMPOSE_REPRODUCTION_PASS=true
GITHUB_RELEASE_CANDIDATE_READY=true
GITHUB_PUBLICATION_COMPLETE=false
```

## 源码完整性

R2 SHA-256：`e77183b4bfabed990fb45ec12a0fa5dd25e47093a2beeaa9481333784d903be7`。213 个保护文件逐字节一致：完整 src/frontend/deploy/tests、锁文件、Dockerfile、Compose、环境模板、Judge/UNS/Flow、业务脚本和 LICENSE，见 [基线审计](docs/release-evidence/r2-source-match.json)。

前后端、AI guard/demo降级、MQTT Runtime、8 Flow、5 UNS初始化、模拟来源、Preflight/Prepare/Verify与治理资料齐备。不携带本机 node_modules、dist、日志、原 Git历史或未公开凭据。本轮只修Quick Start坏命令、更新复测文档与脱敏证据、清单和哈希，不改业务。

## 网络与实际新构建

已区分宿主机、daemon、BuildKit和Hub：宿主机 Registry401/Auth200；daemon既有代理TCP不可达；default builder继承daemon网络，无法解析FROM metadata。未证实Hub全站或独立BuildKit故障。

未改代理全局配置，也未重启daemon。通过官方 registry核验 Node引用/amd64 manifest/config，再核验缓存五层，docker load恢复官方基础tag；使用原Dockerfile正常构建新public-rc1镜像，实际运行build与Judge。未使用旧App代替。缓存npm层复用事实明确记录。详见 [网络证据](docs/release-evidence/final-network.json)、[镜像身份](docs/release-evidence/final-official-base-loaded.json)、[构建证据](docs/release-evidence/final-build.json)。

## 本轮真实平台闭环

独立Ubuntu Engine，Community Edition V1.5.0.0-M、官方commit a36787c81d6c2848bb6dc89d649643f0b0119023。新Compose项目/端口13415，新镜像；复用隔离平台既有8Flow/5UNS，未覆盖平台业务配置。

HTTP健康200 → Preflight平台/MQTT/Flow/UNS PASS → 授权Prepare8RAW → CONFLICT100/96/96/100 → 人工确认WAITING且WMS100不变 → WMS96 RAW经EMQX/Node-RED/canonical → REVALIDATED_CLOSED100/96/96/96。平台UNS ERP100/WMS96，客户剩余需求4。

AI未配置返回AI_NOT_CONFIGURED，主链通过；未调用LLM。三页面HTTP200，浏览器打开新App实际CLOSED界面。原始日志在公开候选之外，脱敏响应见 [复测记录](docs/release-validation.md)。未重跑历史三轮或服务重启，不夸大新的浏览器刷新验收。

## 敏感信息和无关内容

再次运行 `node scripts/public-release-audit.mjs`，覆盖隐藏文件、秘密赋值、JWT/cloud/token/私钥、数据库credential URL、私人路径、内网IP、非模板env、日志/备份/素材和无关项目。只输出风险类型和路径，不打印命中值。

结果见 [扫描](docs/release-evidence/public-release-scan.json)、[内容复核](docs/release-evidence/content-review.json)。公开的实际响应移除本机report路径、Engine与container标识。第三方许可证原作者/联系信息是必须保留的attribution，不当作项目Owner联系方式。

## 许可和依赖

Owner决定Apache-2.0。官方LICENSE SHA-256：`cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30`，正文不改。package和lock根许可统一。291个锁定包位置对应清单；此前实际Linux安装220包核对通过。新增前端/后端依赖为零。

第三方原许可与归属、NOTICE及正文哈希保持，包括MPL-2.0、CC-BY-4.0等，不能被项目Apache重新许可。shadcn MIT/lucide ISC归属保留。程序Three几何无外部照片/字体/模型资产。不编造版权公司或NOTICE。可选开发二进制metadata与正文缺失边界继续见THIRD_PARTY_NOTICES；本包不分发node_modules或完整镜像，此审计不等于未来镜像再分发认证。

## 剩余边界与公开准备

模拟工业数据不是真实工厂；全局代理尚未修复，未来未缓存镜像需正常网络；内存重启需显式播种；live MQTT无账号密码支持；接口无生产鉴权；TSDB历史及原生App Manager未通过。AI不是必要依赖。本候选通过不代表生产Ready或原生安装Gate通过。

仅达到公开源码候选READY，等待Owner批准拟定新仓库及公开动作。本轮没有remote、push、仓库Visibility更改或Release。全量清单/哈希见 [RELEASE_FILE_MANIFEST](RELEASE_FILE_MANIFEST.md)，后续步骤见 [SUBMISSION_READINESS](SUBMISSION_READINESS.md)。
