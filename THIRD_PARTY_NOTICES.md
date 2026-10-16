# Third-party notices

本项目自有代码采用 Apache-2.0；以下依赖、源码组件与外部平台不因此改变许可。
清单依据当前 package-lock.json 及实际安装 package.json；锁文件共 291 个包位置，实际安装 220 个。
平台可选包仍列入锁文件清单，未安装的跨平台二进制没有凭空复制许可证。
完整版本、安装状态、许可声明和原文哈希见 [dependency-licenses.json](docs/dependency-licenses.json)。
已安装包的 LICENSE/COPYING/NOTICE/COPYRIGHT 原文保存在 [third_party/licenses](third_party/licenses)，不是统一重许可。
Node.js 本身与容器底层 OS 的 notices 应随其原始发行包保留；本源码包不分发 Node/OS 二进制。

## 直接依赖

| 包 | 锁定版本 | 许可 metadata | 用途 |
| --- | --- | --- | --- |
| @tanstack/react-query | 5.104.1 | MIT | 运行 |
| class-variance-authority | 0.7.1 | Apache-2.0 | 运行 |
| clsx | 2.1.1 | MIT | 运行 |
| lucide-react | 0.468.0 | ISC | 运行 |
| motion | 14.0.0 | MIT | 运行 |
| mqtt | 5.16.0 | MIT | 运行 |
| radix-ui | 1.7.0 | MIT | 运行 |
| react | 19.3.0 | MIT | 运行 |
| react-dom | 19.3.0 | MIT | 运行 |
| react-router-dom | 7.18.4 | MIT | 运行 |
| tailwind-merge | 3.7.0 | MIT | 运行 |
| three | 0.186.1 | MIT | 运行 |
| tsx | 4.23.15 | MIT | 运行 |
| @tailwindcss/vite | 4.3.3 | MIT | 开发 |
| @types/node | 24.19.1 | MIT | 开发 |
| @types/react | 19.3.0 | MIT | 开发 |
| @types/react-dom | 19.3.0 | MIT | 开发 |
| @types/three | 0.186.0 | MIT | 开发 |
| @vitejs/plugin-react | 5.2.0 | MIT | 开发 |
| tailwindcss | 4.3.3 | MIT | 开发 |
| typescript | 5.9.3 | Apache-2.0 | 开发 |
| vite | 7.3.6 | MIT | 开发 |

shadcn/ui 不是本项目 npm 安装包；frontend/src/components/ui 的可定制源码模式遵循上游 MIT，保留 [上游原文](third_party/shadcn-ui-LICENSE.md) 与 [来源](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)。没有指定生成器版本，不编造版本号。
lucide-react 的包 metadata 为 ISC，实际 LICENSE 包含其图标来源的 MIT attribution；原文全部保留，不能仅以 ISC 简写覆盖其中内容。

## 全部锁定依赖许可分布

- MIT: 260 个包位置
- Apache-2.0: 5 个包位置
- CC-BY-4.0: 1 个包位置
- ISC: 10 个包位置
- BSD-3-Clause: 2 个包位置
- MPL-2.0: 12 个包位置
- 0BSD: 1 个包位置

lightningcss 及可选平台包为 MPL-2.0；caniuse-lite 数据为 CC-BY-4.0；其他 ISC/BSD/0BSD/MIT/Apache 声明按各包保留。
本轮未改这些第三方文件。分发构建产物或镜像时，应保留其实际用到的许可证/归属与对应源码要求；不能只带本项目 LICENSE。
本 Dockerfile 带入此处第三方许可目录。新增/升级依赖时，重新生成许可清单，不沿用旧扫描结论。

## 外部运行平台（不打包、不重新许可）

| 平台 | 已观察版本/依据 | 许可边界 |
| --- | --- | --- |
| open supOS deploy | a36787c81d6c2848bb6dc89d649643f0b0119023，官方 deploy checkout LICENSE | MulanPSL-2.0；仅确认 deploy 仓库，不代表其各服务镜像均同许可 |
| EMQX | supOS emqx:5.8 镜像内 releases 为 5.8.4 | 上游 v5.8.4 Open Source 的 APL.txt 为 Apache-2.0；定制镜像其他内容须按原发行 notice，不推断 Enterprise 或未来版本 |
| Node-RED | supOS node-red:4.0.8-22-supos，容器 node-red package.json | Node-RED 核心 Apache-2.0；supOS 扩展节点/镜像整体不自动视为同一许可 |

上游依据：[open supOS deploy](https://gitee.com/supos-community-edition/supos-ce-deploy)、[EMQX v5.8.4 APL](https://github.com/emqx/emqx/blob/v5.8.4/APL.txt)、[Node-RED](https://github.com/node-red/node-red/blob/4.0.8/LICENSE)。
这些平台由使用者独立安装，本源码发行不复制它们的镜像、平台源码或未知许可证正文。没有把平台可用性等同于法律再分发授权。
EMQX 新版本许可可能变化，升级时必须重新核验，不把 5.8.4 的结论延伸到 5.9+。

## 许可文件补充依据

三项平台二进制包未随包提供独立 LICENSE：@esbuild/win32-x64 使用同版本 esbuild 许可，两个 @rollup/win32 包使用同版本 rollup 的完整多来源许可。
react-remove-scroll-bar@2.3.8 的安装 metadata / README 声明 MIT、未附 LICENSE；附录保留官方 master LICENSE（2026-10-07 获取），明确不冒充 2.3.8 tag 原文。具体来源与哈希见 JSON 清单。
没有为缺失文件编造作者、版本或许可正文。


## 2026-10-13 发布候选复核

锁文件未改变；全部 291 个包位置逐项核对。原 JSON 的 installed 字段保留 R2 的安装快照，releaseInstalledLinux 标记本轮 Ubuntu/linux/amd64 的 220 个实际安装包；每个版本和 license metadata 均匹配锁定清单。
补充保留 Linux 实際所用 @tailwindcss/oxide 和 lightningcss 原许可证；@esbuild/linux-x64 及 @rollup/rollup-linux-x64-gnu 使用同版本父包完整许可证，不将平台包统一改为 Apache-2.0。

可选开发依赖 @napi-rs/lzma-linux-x64-gnu@1.5.1 的 npm package metadata 声明 MIT；对应上游提交 f164df92d83e095f195d628b1a68a141ae2eb638 和发布 tarball 没有独立 LICENSE 文件。本候选不分发该原生二进制，不编造作者或正文；具体来源写入 dependency-licenses.json。未来重新分发开发工具二进制应补核完整 notice 与 Rust 组件许可，不能把本轮源代码审计当作完整镜像法律认证。

项目图形为 Three.js 程序几何及一个源码 SVG 图标；未携带照片、旧截图、付费模型、字体文件或外部纹理。字体使用系统 font-family，不分发 Microsoft/PingFang 字体。图标来自 lucide-react，shadcn 源码组件保留上游 MIT 许可。
Owner 已选定自有代码 Apache-2.0；没有添加虚构版权主体，没有为本项目另编 NOTICE。上游许可证中的真实归属、联系字段仍按原文保留，不作为项目自身联系方式。
