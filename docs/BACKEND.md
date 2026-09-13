# 云上跳跃后端

当前后端由 Supabase Edge Function `cloud-hop-v2` 和三张带 `cloud_hop_` 前缀的表组成。浏览器只请求 Edge Function；`cloud_hop_sessions`、`cloud_hop_scores` 和 `cloud_hop_rate_limits` 都启用并强制启用 RLS，`anon` 与 `authenticated` 没有表权限。Edge Function 内部使用服务端密钥访问 Postgres，密钥不会进入前端。

## 部署前配置

当前项目已部署；以下步骤适用于在新 Supabase 项目中自行安装。将 [`supabase/schema.sql`](../supabase/schema.sql) 在目标项目的 SQL Editor 中执行，或复制为项目 migration 后通过 CI 应用。随后部署 [`supabase/functions/cloud-hop-v2/index.ts`](../supabase/functions/cloud-hop-v2/index.ts)，并确保函数旁边存在共享核心 `supabase/functions/_shared/game.ts`。

函数需要以下 Supabase 默认环境变量：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`（仅函数 secret；也兼容 `SUPABASE_SECRET_KEY` 或 `SUPABASE_SECRET_KEYS` JSON 中的对应值）
- 可选 `CLOUD_HOP_RATE_LIMIT_SALT`（建议设置独立的随机 secret；不设置时使用服务密钥作为盐）

函数配置 [`supabase/config.toml`](../supabase/config.toml) 将 `verify_jwt` 设为 `false`，因为本功能不依赖匿名 Auth，而是由服务端发放随机局 token。`finish` 仍必须提供局 token；`start` 和排行榜属于公开接口。前端只配置 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY`。

Supabase 官方当前的 Edge Functions 文档说明函数使用 Deno，并建议通过项目 secrets 读取凭据；publishable key 可放入浏览器，secret/service-role key 会绕过 RLS，必须留在服务器：

- <https://supabase.com/docs/guides/functions>
- <https://supabase.com/docs/guides/functions/secrets>
- <https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys>

## 接口

函数 URL 为 `POST /functions/v1/cloud-hop-v2`，请求必须带 `apikey: VITE_SUPABASE_PUBLISHABLE_KEY`。`GET` 返回最多 20 条排行榜。

- `POST {"action":"start"}` 返回 `{id, seed, token}`。token 只返回一次，数据库只保存 SHA-256 摘要；局有效期为 15 分钟。
- `POST {"action":"finish","session":{"id","seed","token"},"result":{"score","perfectCount","holds","durationMs"},"nickname":"..."}`。服务端读取 seed，使用共享 `createRun`/`applyJump` 逐个复算 `holds`，忽略客户端总分，再通过锁定的数据库函数写入。
- 同一局重复提交返回第一次写入的分数；并发请求由 `cloud_hop_submit_score` 的行锁和 `cloud_hop_scores.session_id` 唯一约束串行化。
- 昵称为 1–16 个 Unicode 字符，控制字符会被拒绝；hold 为整数 0–1200ms，最多 1000 次。请求体上限为 128KiB。

每个请求的限流计数落在 `cloud_hop_rate_limits`，通过原子 upsert 的 `cloud_hop_consume_rate_limit` 持久化：默认每个匿名网络指纹每分钟允许 start 20 次、finish 20 次、排行榜 60 次。服务端只保存加盐摘要，不保存原始 IP。

## 防刷边界

服务端验证 token、会话有效期、真实经过时间下限、hold 边界、跳跃序列和共享数学结果，因此客户端不能直接提交任意总分。真实时间下限按每次蓄力加 `JUMP_DURATION_MS` 计算，并留有 1 秒时钟误差容忍；客户端 `durationMs` 仅用于一致性检查。

这仍然不是强对抗反机器人系统：脚本可以等待真实时间后模拟合法 hold 序列，也可以复用公开的确定性游戏规则。若需要竞技级防刷，应增加按跳跃发送的增量事件、设备/挑战证明和异常检测；当前实现不声称阻止机器人。

## 运行检查

本工作区没有 CLI 或已连接的远端数据库，因此未执行实际 migration、RLS 查询或 Edge Function 部署。部署后至少检查：

1. `start` 返回 token，直接读取三张表的浏览器请求被 RLS/权限拒绝。
2. 合法结束局只产生一行 score；重复和并发 finish 返回相同分数。
3. 错误 token、过期局、非法 hold、过长昵称和超限请求被拒绝。
4. GET 排行榜按分数降序、创建时间升序返回，空表返回空数组。

## v2 实际落点
当前前端使用 cloud-hop-v2；共享核心保存 position，从真实落点计算下一跳。旧 cloud-hop 接口仍在线，代码引用 legacy-game.ts，供尚未刷新的旧客户端使用。两个版本沿用现有表与对局凭证验证，无需数据库迁移。
