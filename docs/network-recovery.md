# 隔离 Engine 基础镜像恢复说明

本轮不改 Docker 全局代理。宿主机直连官方 Registry/Auth 可用，但 daemon 指向的既有代理不可达。正常评审环境优先修复其自身网络后 `docker pull node:24-bookworm-slim`；若需改全局代理，必须另获环境 Owner 授权，不从本报告自动继承权限。

本轮实际备用方法仅适用于 **Docker 29 containerd image store 已缓存官方完整基础层** 的环境：

1. 通过官方 Auth 获取只读 `library/node:pull` 凭证；只在进程内使用，不打印或保存。
2. 从 `registry-1.docker.io/v2/library/node/manifests/<digest>` 获取官方索引，再选择 linux/amd64 manifest；使用 SHA-256 校验索引、manifest、config。
3. 只读访问 containerd content store 的对应 blobs，逐个校验 manifest 声明的五层 digest。缺任意层或校验不符即停止；不从旧应用镜像反向拼凑。
4. 将已核验 config、原始压缩层和 `manifest.json` 写入临时 Docker archive。manifest.json 内容为一个元素的数组：`Config` 指向 config 文件，`RepoTags` 为 `["node:24-bookworm-slim"]`，`Layers` 按原顺序指向层文件。
5. `docker load -i <核验后的官方基础镜像archive>`。之后读取加载 manifest 的 config digest，与官方 config 对比，并将 `docker image inspect` 的 RootFS Layers 与官方 config 的 rootfs.diff_ids逐个比较，确认 linux/amd64。
6. 原 Dockerfile 不修改，正常执行 Compose build。只有应用 build、Judge和后续真实平台闭环实际完成，才报告候选通过。

官方索引、amd64 manifest、config、五层、导入后镜像身份均记录在 [基础镜像证据](release-evidence/final-official-base-loaded.json)。归档导入导致 manifest mediaType/序列化转换，因此导入后 manifest ID 不等于官方 registry digest；不能只核对 tag 便声称身份一致。

此方法不修复全局代理，不保证未来未缓存镜像下载，也不将本源码包变成离线交付包。不使用第三方镜像站、旧 App镜像或关闭 TLS 校验。
