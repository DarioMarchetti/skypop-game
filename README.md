# SkyPop Game · 云上跳跃

原创等距视角网页小游戏：按住蓄力、松开起跳、精准落点连击。支持桌面鼠标、空格键和移动端触控。

**[在线试玩](https://cloud-hop.vercel.app/)** · **[GitHub 仓库](https://github.com/DarioMarchetti/skypop-game)**

前端已部署至 Vercel，排行榜使用 Supabase。本次线上发布使用构建产物上传；GitHub 自动部署尚未绑定。

## 运行

要求 Node.js 22.12+。

```sh
git clone https://github.com/DarioMarchetti/skypop-game.git
cd skypop-game
npm ci
cp .env.example .env.local
npm run dev
```

启动后打开终端显示的本地地址（默认 http://localhost:5173）。

未配置 Supabase 时自动进入本地练习，最佳成绩仅保存在当前浏览器。云端接入失败不会阻止本地游玩，也不会显示虚构排行榜。

```sh
npm test
npm run build
```

## 架构

| 模块 | 实现 |
| --- | --- |
| 页面与局生命周期 | React + TypeScript |
| 游戏渲染、输入与声音 | Canvas 2D、Pointer Events、WebAudio |
| 计分与平台生成 | 前后端共享确定性 TypeScript 核心 |
| 排行榜与对局 | Supabase Postgres + Edge Function |
| 前端部署 | Vercel，Vite 构建产物 `dist` |

详见 [详细设计与实施计划](docs/DESIGN.md) 及 [后端部署说明](docs/BACKEND.md)。三个 Luna 模型按固定接口分别实现引擎、界面和后端，主代理负责整合与验证。

## 云端配置

1. 按 `docs/BACKEND.md` 创建数据库资源并部署 `cloud-hop-v2` Edge Function。
2. 前端环境变量设置 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY`。
3. 重新运行构建；Vite 在构建时写入公开配置。

不要把数据库密码、service role 或 secret key 写入任何 `VITE_` 变量或提交到 Git。前端只使用可公开的 publishable key。

## GitHub 与 Vercel

将完整源码推送至自己的 GitHub 仓库，在 Vercel 导入该仓库并选择 Vite。构建命令 `npm run build`、输出目录 `dist` 已在 `vercel.json` 声明。设置上述两个前端变量后部署；之后 main 分支更新可由 Vercel Git 集成触发部署。

也可使用已登录的 Vercel CLI `vercel --prod` 发布。CI 运行 `npm ci`、`npm test`、`npm run build`。

## 成绩完整性与限制

服务器发放种子和一次性对局凭证，根据蓄力记录复算分数，并校验时长、记录范围、过期和重复提交。数据库启用 RLS，公开客户端无法直接写入成绩。

这能阻止直接篡改总分，无法彻底阻止自动化程序模拟合法跳跃。当前版本用于休闲排行榜，不用于奖金或强竞技场景。昵称和分数会公开显示；本地最佳及昵称保存在浏览器中。

## 视听特效

霓虹街机升级详见 [EFFECTS.md](docs/EFFECTS.md)。`npm run build:qa` 生成独立的 `dist-qa/qa.html` 验收页，可测试普通落点、完美落点与连续完美；不连接数据库、不计入排行榜。生产构建不包含该页面。

## 怎么玩

- 手机按住游戏画面、电脑按住鼠标或空格蓄力，松开起跳；按得越久跳得越远。
- 小人压缩、发光与脚下岛屿聚能表示蓄力，不使用进度条。
- 落到下一座岛得 1 分；中心落点触发完美连击，额外奖励最高 5 分。
- 跳空会触发当前场景的掉落效果，动画完成后结算。可输入昵称提交云端排行榜或重新开始。
- 右上角可暂停和静音；声音需首次操作解锁；系统“减少动态效果”设置会降低动画强度。

## 海上道具

落到带道具的岛上自动拾取。同种道具刷新持续跳数，不额外加分。

| 名称 | 外观 | 功能 |
| --- | --- | --- |
| 潮汐罗盘 | 青蓝罗盘 | 接下来 3 跳，按住时显示预计落点 |
| 回声海螺 | 珊瑚粉贝壳 | 接下来 3 跳，力度接近中心落点时，小人闪光并播放提示音 |
| 流星珍珠 | 金色珍珠与星环 | 接下来 5 跳，彩虹拖尾与星光落地 |

前 3 岛不生成道具，首次位于索引 4–7，之后间隔 5–8 岛。位置与种类由种子确定，基础抽签权重 40/35/25，连续同类会轮换，因此最终占比不严格等于基础权重。完整算法见 [ITEMS.md](docs/ITEMS.md)。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 本地开发 |
| `npm test` | 核心规则与道具排程测试 |
| `npm run build` | 类型检查并构建生产 `dist` |
| `npm run preview -- --host 0.0.0.0` | 预览生产构建 |
| `npm run build:qa` | 构建独立验收页 `dist-qa/qa.html` |

后端初始化 SQL、Edge Function 和部署步骤见 [BACKEND.md](docs/BACKEND.md)。

## 随机场景
每次开局随机进入 **岩浆、高空、大海、冰块、藤蔓** 之一，连续两局不会重复。每种场景都有独立背景、平台配色及掉落效果：熔岩火星、穿云风线、落水涟漪、碎冰和断藤落叶。玩法与计分一致。详见 [SCENES.md](docs/SCENES.md)。

## 页面布局
主页面以居中的大画面为主，分数、场景和有效道具浮在画面内，排行榜移至玩法说明页。右上角「玩法说明」进入独立页面（[打开说明](https://cloud-hop.vercel.app/#/guide)），包含玩法、规则、道具和场景介绍。打开说明暂停对局，返回后点击继续。

## 全屏与真实落点更新
- 画面铺满浏览器视口，控制收纳到右上角 ☰ 菜单；玩法和排行榜从菜单进入。
- 游戏中的道具仅显示图标，剩余次数使用小圆点。说明页保留名称和功能。
- 角色停在真实落点，下一跳从当前位置朝目标岛中心计算，不再自动归中。
- 结算弹窗可勾选“以后不再显示此弹窗”，保存在当前浏览器；仍可手动提交成绩，菜单可恢复自动提示。
