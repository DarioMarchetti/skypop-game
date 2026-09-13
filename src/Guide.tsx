import { useEffect, useRef, type ReactNode } from 'react'
import { ITEM_INFO } from './game/items'
import { SCENES } from './game/sceneTypes'

export default function Guide({children}: {children?: ReactNode}) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { heading.current?.focus() }, [])
  return <main className="guide-page">
    <header className="guide-header"><a className="brand" href="#">云上跳跃</a><a className="quiet-button guide-link" href="#">返回游戏 ↗</a></header>
    <article className="guide-content">
      <span className="eyebrow">HOW TO PLAY</span>
      <h1 ref={heading} tabIndex={-1}>每一跳，都恰到好处。</h1>
      <section><h2>玩法</h2><p>手机按住游戏画面，电脑按住鼠标或空格蓄力，松开起跳。按得越久，跳得越远。观察小人的压缩与小岛上的聚能效果，瞄准下一座岛的黄色圆心。</p><p>右上角可以暂停和静音。打开本说明会暂停当前对局；返回后点击“继续”接着玩。</p></section>
      <section><h2>计分与规则</h2><ul><li>成功落到下一座岛获得 1 分。</li><li>踩中中心区域触发完美落点：额外奖励从 1 分开始，连续完美逐次增加，最高额外 5 分。普通落点清空完美连击。</li><li>未落到目标岛则结束对局，播放当前场景的掉落效果后结算。</li><li>云端比赛可提交昵称与成绩，每局提交一次；昵称最多 16 个字符，榜单展示前 20 名。云端对局有效期为 15 分钟。</li><li>无法连接云端时可本地练习，本地最佳仅保存在当前浏览器。</li></ul></section>
      <section><h2>探索道具</h2><p>落到带道具的岛上即可自动拾取，从下一跳开始生效。同类拾取刷新次数，不额外加分。</p><div className="guide-cards">{Object.values(ITEM_INFO).map(item=><div className="guide-card" key={item.name}><h3 style={{color:item.color}}>{item.name}</h3><p>{item.description}</p></div>)}</div><p>前 3 座岛用于熟悉操作，之后每隔 5～8 座岛出现道具。</p></section>
      <section><h2>五种世界</h2><p>每局随机进入一个场景，连续两局不会重复。所有场景使用相同的跳跃与计分规则。</p><div className="guide-cards">{Object.values(SCENES).map(scene=><div className="guide-card" key={scene.name}><h3 style={{color:scene.rim}}>{scene.name}</h3><p>{scene.fall}</p></div>)}</div></section>
      <section><h2>声音与动态效果</h2><p>声音在首次操作后开启，可随时静音。开启系统“减少动态效果”设置，可降低粒子、镜头和背景运动。</p></section>
      {children}
      <a className="primary-button guide-link" href="#">返回游戏</a>
    </article>
  </main>
}
