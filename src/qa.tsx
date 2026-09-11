// Isolated, unranked interaction harness. Excluded from the production entry.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GameCanvas, type GameSnapshot } from './game/GameCanvas';
import { applyJump, createRun, JUMP_DURATION_MS } from './game/core';
import './styles.css';

function Harness() {
  const [generation, setGeneration] = useState(0);
  const [snapshot,setSnapshot] = useState<GameSnapshot>({score:0,combo:0,perfectCount:0,phase:'ready',charge:0});
  const [paused,setPaused] = useState(false);
  const [sound,setSound] = useState(true);
  const [busy,setBusy] = useState(false);
  const [mobile,setMobile] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const run = useRef(createRun(42));
  const token = useRef(0);
  useEffect(()=>()=>{token.current+=1},[]);
  async function play(count:number,perfect:boolean,miss=false) {
    if(busy || paused) return;
    setBusy(true);
    const epoch=++token.current;
    for(let i=0;i<count && epoch===token.current;i++) {
      const current=run.current.platforms[run.current.index], target=run.current.platforms[run.current.index+1];
      if(!target || run.current.over)break;
      const distance=Math.hypot(target.x-current.x,target.z-current.z)+(perfect?0:target.radius*.55);
      const hold=miss ? 25 : Math.round((distance-30)/.24);
      const canvas=root.current?.querySelector('canvas');if(!canvas)break;
      canvas.focus();
      canvas.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true}));
      await new Promise(resolve=>setTimeout(resolve,hold));
      if(epoch!==token.current)break;
      canvas.dispatchEvent(new KeyboardEvent('keyup',{key:' ',code:'Space',bubbles:true}));
      run.current=applyJump(run.current,hold).state;
      await new Promise(resolve=>setTimeout(resolve,JUMP_DURATION_MS+280));
    }
    if(epoch===token.current)setBusy(false);
  }
  function reset() { token.current++;run.current=createRun(42);setGeneration(v=>v+1);setBusy(false);setPaused(false); }
  return <main style={{padding:20,minHeight:'100vh',background:'#070612',color:'#eff'}}>
    <h1 style={{fontSize:22}}>特效验收 · 本地模拟，不写排行榜</h1>
    <div style={{display:'flex',gap:12,flexWrap:'wrap',margin:'20px 0'}}>
      <button onClick={()=>void play(1,false,true)} disabled={busy||paused}>落水测试</button>
      <button onClick={()=>void play(1,false)} disabled={busy||paused}>普通落点</button>
      <button onClick={()=>void play(1,true)} disabled={busy||paused}>完美落点</button>
      <button onClick={()=>void play(5,true)} disabled={busy||paused}>连续完美 ×5</button>
      <button onClick={()=>setPaused(v=>!v)}>{paused?'继续':'暂停'}</button>
      <button onClick={()=>setSound(v=>!v)}>{sound?'静音':'开启声音'}</button>
      <button onClick={()=>setMobile(v=>!v)}>切换390px画布</button>
      <button onClick={reset}>重置</button>
    </div>
    <p role="status">阶段 {snapshot.phase} · 分数 {snapshot.score} · 连击 {snapshot.combo} · 完美 {snapshot.perfectCount} · 道具 {snapshot.items?.map(item=>`${item.kind}:${item.remaining}`).join(',') || '无'}</p>
    <div ref={root} style={{width:mobile?390:900,maxWidth:'100%',height:600,border:'1px solid #7873ae'}}>
      <GameCanvas key={generation} seed={42} paused={paused} sound={sound} onUpdate={setSnapshot} onGameOver={()=>setBusy(false)}/>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<Harness/>);
