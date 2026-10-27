# 食光转盘 · 在线部署工程

本目录保存正式在线服务的可复现源码，使用 Sites 的 Vinext / Cloudflare Worker / D1 运行环境。

公开地址：https://food-wheel-lavieme.haivivi-8454.chatgpt.site
正式 GitHub 入口：https://lavieme.github.io/my-food-wheel/

- `worker/index.ts` 优先处理食光转盘静态文件和 `/api/` 请求，再保留框架默认处理器。
- `cloud/api.mjs` 为公开跨域 API，仅允许本站及 GitHub 前端源的浏览器跨域请求。
- `db/schema.ts` 与 `drizzle/` 定义持久化存储和迁移。
- `lib/food-wheel-assets.mjs` 是由根目录前端生成的快照，请勿直接编辑。
- `scripts/sync-food-wheel.mjs` 从父目录同步前端及 API 到云端工程。
- `.openai/hosting.json` 保存现有工程 ID 和 DB 逻辑绑定，不包含访问令牌。

维护时先安装本目录锁定依赖；同步源代码、生成必要迁移并构建后，通过 Sites 的源代码同步与发布流程更新现有工程。完整说明见根目录 README。
