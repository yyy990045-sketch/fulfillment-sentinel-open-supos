# 安全说明

本发行版用于模拟工业数据与隔离 Runtime 演示；不是已经加固的生产服务。
现有 demo mutation 端点只有浏览器 Origin 检查，没有生产身份/角色鉴权，也不限制任意非浏览器调用。勿暴露到公网或生产 broker。
Docker 默认仅绑定回环地址；本地启动建议 HOST=127.0.0.1。接入真实工厂前需单独安全设计与验收。

API key、MQTT 凭据使用服务器环境变量；.env.example 中秘密值为空。不要提交 .env、凭据、Docker credential、生产来源记录或含个人路径的日志。
AI provider 可能记录输入，接入前确认自身数据授权和提供者政策；当前输入为演示工业事实。
当前 live Product session 不传递 MQTT 用户名/密码（CLI verifiers 支持）；有鉴权的 broker 需要另行支持，不要为运行而关闭现有平台安全策略。

## 报告安全问题

当前无已公布专用安全邮箱、远程仓库安全报告入口或响应 SLA。
通过已存在的项目 Owner 私下沟通渠道，先发不含敏感值的影响说明，再约定安全传输；不要公开 exploit 凭据或客户数据。
远程仓库创建后可启用其私密漏洞报告入口，再更新此文件。普通 bug 使用 Issue 模板。

## 边界

SIMULATED_INDUSTRIAL_DATA=true；REAL_FACTORY_DATA=false。已跑通 Runtime 不代表真实生产安全、TSDB 持久化或客户部署认证。
