# 云上跳跃 / CLOUD HOP — 设计与实施计划

## 1. 产品目标
制作一个打开即可游玩的中文网页跳跃小游戏，借鉴按住蓄力、松开跳跃的操作方式，使用原创视觉与名称。第一版覆盖桌面和手机、单局计分、本地最佳、云端排行榜。无需注册即可本地练习；云端比赛使用服务器发放的种子与一次性局号。无付费、社交、微信登录或微信商标素材。

## 2. 玩法规格
- 状态：ready → charging → jumping → ready / gameover；暂停时取消未释放蓄力，切后台自动暂停。
- 鼠标/单指按住游戏画面或空格蓄力，松开触发；忽略重复按键、多指与 UI 点击。蓄力最长 1200ms。
- 世界坐标二维，平台沿 x 或 z 方向生成；视觉以等距投影呈现。角色跳跃轨迹采用抛物线，落点由蓄力毫秒数决定。
- 确定性核心：seed 生成平台与方向；跳跃距离 = 30 + clamp(ms,0,1200) × 0.24；平台距离随难度微调、半径随机变化，始终可达；到达第 1000 座目标平台完成本局。
- 普通落点 +1；距平台中心 ≤ 半径的 22% 视为完美，完美连续次数决定附加分（上限 5）；普通落点清空连击；离开目标平台即失败。
- 固定种子与蓄力记录可复算整个对局。前后端必须复用同一核心，禁止接受客户端总分作为真实成绩。
- 结算展示分数、最佳、完美次数、一键重来、昵称提交成绩；重试提交复用同一 session 防止重复成绩。

## 3. 视觉与交互
深海蓝背景、冰蓝浮空平台、荧光黄主角与强调色；等距场景占屏幕主体，细网格与轻量轨迹提供空间感。顶部品牌、声音和暂停；左侧当前分数/最佳，右侧小型排行榜；手机变成顶部 HUD 与游戏下方排行榜。按钮、对话框有键盘焦点；遵循 reduced-motion；文本说明与状态为屏幕阅读器提供替代。
不依赖外部图片或字体，Canvas 绘制功能性平台与角色几何图形。音效使用 WebAudio，由用户交互后开启，可关闭。

## 4. 技术架构
- React + TypeScript + Vite，Canvas 2D 游戏渲染，requestAnimationFrame 驱动且使用真实时间。
- 纯 TypeScript 游戏数学模块放 supabase/functions/_shared/game.ts；前端通过 src/game/core.ts 再导出，Edge Function 直接导入，确保复算一致。
- Supabase Postgres 保存 cloud_hop_sessions / cloud_hop_scores；所有表启用 RLS，浏览器不能写入，Edge Function 使用服务端凭据处理校验与持久化。
- Edge Function cloud-hop：POST action=start 发放 seed/session/token；POST action=finish 接收 jump 记录并复算；GET 返回排行榜。局 token SHA-256 存库。每局有过期与记录数上限、最小真实经过时间、已用状态、昵称校验；服务端时间限制与数据库锁/原子更新避免重复提交。基础限流需持久化，不能只依赖进程内内存。
- 允许未配置后端的本地练习，明确显示“本地练习”；不生成假排行榜。比赛 session 获取失败时可练习且不提交云端。
- 前端只包含 Supabase URL 和 publishable key；service_role 不进入前端、Git 或 Vercel 客户端变量。

## 5. 模块接口（并行实施契约）
### 共享核心
`export type Platform = {x:number;z:number;radius:number;index:number}`
`export type RunState = {seed:number;platforms:Platform[];index:number;score:number;combo:number;perfectCount:number;over:boolean}`
`createRun(seed:number):RunState`；`applyJump(state:RunState,holdMs:number):{state:RunState;landed:boolean;perfect:boolean;distance:number;target:Platform}`，不修改输入。
`jumpDistance(holdMs:number):number`；`MAX_HOLD_MS=1200`；`JUMP_DURATION_MS=520`。
### Canvas 组件（游戏代理负责）
`GameCanvas({seed:number,paused:boolean,sound:boolean,onUpdate:(s:GameSnapshot)=>void,onGameOver:(r:GameResult)=>void})`
`GameSnapshot={score:number;combo:number;perfectCount:number;phase:'ready'|'charging'|'jumping'|'gameover';charge:number}`
`GameResult={score:number;perfectCount:number;holds:number[];durationMs:number}`
组件路径 src/game/GameCanvas.tsx；相应类型由此导出；新局由父组件 key 重建。
### 后端客户端（后端代理负责）
src/lib/api.ts 导出 `startSession():Promise<{id:string;seed:number;token:string}>`、`finishSession(session,result,nickname):Promise<{score:number}>`、`getLeaderboard():Promise<Array<{id:string;nickname:string;score:number;created_at:string}>>`、`isCloudConfigured:boolean`。session/result 使用结构类型。使用原生 fetch，不需 supabase-js；请求 public Edge Function，显式 apikey，并限制超时。
### UI（界面代理负责）
src/App.tsx / src/styles.css，导入 GameCanvas 与 api。负责局生命周期、localStorage 最佳与昵称、模态框、排行榜真实空态与错误态、暂停和声音、练习降级提示。

## 6. 数据与安全
成绩仅保留昵称、分数、完美次数和时间；不公开 session token、IP。防刷摘要若采用 IP 应加服务端盐并限制保留期。成绩验证防止直接伪造总分，不能声称可阻止机器人或脚本求解；竞技强对抗需后续增量事件验证。
排行榜只开放 top 20，有稳定排序（分数降序、创建时间升序）。输入校验：昵称 1–16 个 Unicode 字符；整数 hold 0–1200；最多 1000 次跳跃；请求体上限。数据表/函数名称带 cloud_hop 前缀避免与现有业务冲突。

## 7. Luna 分工及交付顺序
1. 主代理：设计、接口契约、项目脚手架、账户检查、整合、代码审查、浏览器验收和实际发布。
2. Luna A：确定性数学核心、Canvas 游戏、输入处理、音效；只修改共享核心及 src/game。
3. Luna B：React UI、响应式、排行榜与结算状态；只修改 App.tsx/styles.css。
4. Luna C：Supabase SQL、Edge Function、前端 API 适配器及后端部署说明；只修改 supabase（_shared/game.ts 除外）、src/lib。
核心接口先固定，所有代理可并行；不得自行部署或修改他人文件。主代理统一决定接口变化。

## 8. 验收与发布
- 核心测试：同 seed 同结果、普通与完美计分、跳空失败、边界 hold、输入不可变。
- 实机浏览器：桌面与手机视口、按住/释放与空格、失败重开、暂停/切后台、对话框及错误态、控制台错误、构建产物。
- 后端：非法成绩、重复提交、过期 token、RLS、真实排行榜查询；无法连接时标记未验证，不声称完成。
- GitHub 默认新建私有 cloud-hop 仓库（能力允许时）；提交源码/lockfile/设计/SQL/README，忽略所有秘密。
- Vercel 使用 Vite build → dist，从 GitHub 持续部署；配置公开 Supabase 环境变量。验证部署 READY 及线上主流程。
- 外部账户或写入权限缺失时，先完成可审查的代码与测试，然后明确提供最小剩余操作，不编造发布地址。


# 视听升级：霓虹节奏街机

目标：通过动作的收放节奏让简单跳跃具有蓄势、释放和命中的快感。特效服务落点判断，保持原有共享物理与云端计分。

| 时刻 | 画面 | 声音 | 节奏 |
| --- | --- | --- | --- |
| 待机 | 深紫星空、极光、发光浮岛与缓慢背景脉动 | 首次操作前静音 | 留出视觉呼吸 |
| 蓄力 | 角色压缩、能量向内收拢、蓄力环逐渐增强 | 上升音高，背景鼓点持续 | 张力逐渐累积 |
| 松手 | 角色拉伸、光尾与释放环 | 清晰的起跳音 | 迅速释放 |
| 普通落地 | 局部冲击环、短促粒子、分数弹跳 | 落地打击与短音 | 命中瞬间集中反馈 |
| 完美落地 | 更强光环与粒子、PERFECT 字样、轻微震屏 | 更饱满和弦 | 奖励准确操作 |
| 连续完美 | 特效强度随已有连击等级增加，最高5级 | 和弦/节拍层次增加 | 形成持续兴奋感 |
| 失败/结算 | 短暂消散、成绩与再来按钮 | 下降音效，停止背景节拍 | 明确结束与重试入口 |

## 实施边界
- 游戏核心和 Supabase 计分规则不变，无节拍判定、额外分数、付费内容或新账号功能。
- 一个可复用 AudioContext；声音由用户手势解锁；静音、暂停、切后台、结算和卸载停止节拍调度。
- 动画按实际时间推进；粒子和轨迹有限额；Canvas 主要动画保持在 ref 中，避免每帧重建场景或音频资源。
- 尊重 prefers-reduced-motion，减少镜头运动和快速视觉变化；不使用全屏白色频闪。
- 发布前验证：原5项核心测试、生产构建、普通/完美/连续完美的前端表现、暂停/声音、手机布局与控制台。
- Luna A 实施 Canvas 特效与 WebAudio，Luna B 实施 HUD 与界面动画，主代理整合、验收、部署并更新源码包。


## 最新交互与海洋道具
当前设计以 docs/EFFECTS.md 与 docs/ITEMS.md 的海洋升级为准。蓄力进度条已移除，由角色及当前岛屿表现蓄力；失败时下坠落水后结算。三种道具由种子决定出现位置，提供落点辅助或视觉奖励，不修改共享计分。源码仓库：https://github.com/DarioMarchetti/skypop-game 。


## 五场景升级
新增岩浆、高空、大海、冰块、藤蔓五套场景，每局随机选择且不连续重复。各自平台外观、掉落效果和声音不同，物理计分保持一致。设计与验收见 [SCENES.md](SCENES.md)。
