import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { GameCanvas, type GameResult, type GameSnapshot } from './game/GameCanvas'
import {
  finishSession,
  getLeaderboard,
  isCloudConfigured,
  startSession,
} from './lib/api'
import { ITEM_INFO } from './game/items'
import { chooseScene, isScene, SCENES, type SceneKind } from './game/sceneTypes'
import Guide from './Guide'
import './styles.css'

type RunMode = 'loading' | 'cloud' | 'local'
type LeaderboardState = 'loading' | 'ready' | 'error'
type LeaderboardEntry = { id: string; nickname: string; score: number; created_at: string }

const BEST_KEY = 'cloud-hop-best'
const NICKNAME_KEY = 'cloud-hop-nickname'

function getStoredNumber(key: string) {
  try {
    const value = Number.parseInt(localStorage.getItem(key) ?? '0', 10)
    return Number.isFinite(value) ? value : 0
  } catch {
    return 0
  }
}

function randomSeed() {
  const cryptoApi = globalThis.crypto
  if (cryptoApi?.getRandomValues) {
    const buffer = new Uint32Array(1)
    cryptoApi.getRandomValues(buffer)
    return buffer[0] >>> 0
  }
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0
}

function formatRankDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
}

function Icon({ name }: { name: 'pause' | 'play' | 'sound' | 'mute' | 'arrow' | 'refresh' | 'cloud' }) {
  if (name === 'pause') return <span aria-hidden="true" className="icon icon-pause"><i /><i /></span>
  if (name === 'play') return <span aria-hidden="true" className="icon icon-play" />
  if (name === 'sound') return <span aria-hidden="true" className="icon icon-sound"><i /><i /><i /></span>
  if (name === 'mute') return <span aria-hidden="true" className="icon icon-mute"><i /><i /><b /></span>
  if (name === 'refresh') return <span aria-hidden="true" className="icon icon-refresh">↻</span>
  if (name === 'cloud') return <span aria-hidden="true" className="icon icon-cloud">◆</span>
  return <span aria-hidden="true" className="icon icon-arrow">↗</span>
}

export default function App() {
  const [guideOpen, setGuideOpen] = useState(() => window.location.hash === '#/guide')
  useEffect(() => {
    const navigate = () => { const open = window.location.hash === '#/guide'; setGuideOpen(open); if (open) setPaused(true) }
    navigate()
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  useEffect(() => {
    const stopPageScroll = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || window.location.hash === '#/guide') return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, button, a, [contenteditable="true"]')) return
      event.preventDefault()
    }
    document.addEventListener('keydown', stopPageScroll)
    return () => document.removeEventListener('keydown', stopPageScroll)
  }, [])
  const [menuOpen, setMenuOpen] = useState(false)
  const menuWasPaused = useRef(false)
  const [resultOpen, setResultOpen] = useState(false)
  const [skipResult, setSkipResult] = useState(() => { try { return localStorage.getItem('cloud-hop-skip-result') === 'true' } catch { return false } })
  const saveSkipResult = (value: boolean) => { setSkipResult(value); try { localStorage.setItem('cloud-hop-skip-result', String(value)) } catch { /* Optional preference storage. */ } }
  const [seed, setSeed] = useState<number | null>(null)
  const [roundKey, setRoundKey] = useState(0)
  const [scene, setScene] = useState<SceneKind>('ocean')
  const lastSceneRef = useRef<SceneKind | null>(null)
  const [mode, setMode] = useState<RunMode>('loading')
  const [session, setSession] = useState<{ id: string; seed: number; token: string } | null>(null)
  const [paused, setPaused] = useState(false)
  const [sound, setSound] = useState(true)
  const [snapshot, setSnapshot] = useState<GameSnapshot>({ score: 0, combo: 0, perfectCount: 0, phase: 'ready', charge: 0 })
  const [result, setResult] = useState<GameResult | null>(null)
  const [best, setBest] = useState(() => getStoredNumber(BEST_KEY))
  const [newRecord, setNewRecord] = useState(false)
  const [nickname, setNickname] = useState(() => {
    try { return localStorage.getItem(NICKNAME_KEY) ?? '' } catch { return '' }
  })
  const [finishState, setFinishState] = useState<'idle' | 'submitting' | 'submitted' | 'error'>('idle')
  const [finishError, setFinishError] = useState('')
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([])
  const [leaderboardState, setLeaderboardState] = useState<LeaderboardState>(isCloudConfigured ? 'loading' : 'ready')
  const [leaderboardError, setLeaderboardError] = useState('')
  const mountedRef = useRef(true)
  const roundRequestRef = useRef(0)
  const dialogRef = useRef<HTMLElement>(null)
  const previousPhaseRef = useRef<GameSnapshot['phase']>('ready')
  const impactTimerRef = useRef<number | null>(null)
  const [impactPulse, setImpactPulse] = useState(false)

  const loadLeaderboard = useCallback(async () => {
    if (!isCloudConfigured) return
    setLeaderboardState('loading')
    setLeaderboardError('')
    try {
      const rows = await getLeaderboard()
      if (!mountedRef.current) return
      setLeaders(rows.slice(0, 20))
      setLeaderboardState('ready')
    } catch {
      if (!mountedRef.current) return
      setLeaderboardState('error')
      setLeaderboardError('排行榜暂时离线')
    }
  }, [])

  const beginRound = useCallback(async () => {
    const requestId = ++roundRequestRef.current
    setResult(null)
    setResultOpen(false)
    setMenuOpen(false)
    setNewRecord(false)
    setFinishState('idle')
    setFinishError('')
    setPaused(window.location.hash === '#/guide')
    setSnapshot({ score: 0, combo: 0, perfectCount: 0, phase: 'ready', charge: 0 })
    previousPhaseRef.current = 'ready'
    setImpactPulse(false)
    if (impactTimerRef.current !== null) window.clearTimeout(impactTimerRef.current)
    setSession(null)
    setMode('loading')
    try {
      if (isCloudConfigured) {
        const nextSession = await startSession()
        if (!mountedRef.current || requestId !== roundRequestRef.current) return
        setSession(nextSession)
        setSeed(nextSession.seed)
        setMode('cloud')
      } else {
        if (!mountedRef.current || requestId !== roundRequestRef.current) return
        setSeed(randomSeed())
        setMode('local')
      }
    } catch {
      if (!mountedRef.current || requestId !== roundRequestRef.current) return
      setSeed(randomSeed())
      setMode('local')
    }
    let previous = lastSceneRef.current
    if (!previous) { try { const stored = sessionStorage.getItem('cloud-hop-scene'); if (isScene(stored)) previous = stored } catch { /* Storage is optional. */ } }
    const nextScene = chooseScene(previous)
    lastSceneRef.current = nextScene
    setScene(nextScene)
    try { sessionStorage.setItem('cloud-hop-scene', nextScene) } catch { /* Keep this round playable. */ }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void beginRound()
    void loadLeaderboard()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setPaused(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mountedRef.current = false
      if (impactTimerRef.current !== null) window.clearTimeout(impactTimerRef.current)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [beginRound, loadLeaderboard])

  useEffect(() => {
    if (!result || !resultOpen || !dialogRef.current) return
    const dialog = dialogRef.current
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)'))
    window.requestAnimationFrame(() => focusable()[0]?.focus())
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const items = focusable()
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [result, resultOpen, guideOpen])

  const onUpdate = useCallback((next: GameSnapshot) => {
    // The engine publishes the new score at jump start. Save the visual hit
    // for the actual landing transition so scoring never fires early.
    if (previousPhaseRef.current === 'jumping' && next.phase === 'ready') {
      setImpactPulse(false)
      window.requestAnimationFrame(() => {
        if (!mountedRef.current) return
        setImpactPulse(true)
        if (impactTimerRef.current !== null) window.clearTimeout(impactTimerRef.current)
        impactTimerRef.current = window.setTimeout(() => setImpactPulse(false), 460)
      })
    }
    previousPhaseRef.current = next.phase
    // Keep score and combo on the previous landing until the jump resolves.
    // GameCanvas can publish the authoritative result at jump start; the HUD
    // should reveal it with the landing pulse instead of spoiling the hit.
    setSnapshot((current) => next.phase === 'jumping'
      ? { ...next, score: current.score, combo: current.combo, perfectCount: current.perfectCount }
      : next)
  }, [])

  const onGameOver = useCallback((next: GameResult) => {
    setResult(next)
    setResultOpen(!skipResult)
    setNewRecord(next.score > best)
    setSnapshot((current) => ({ ...current, score: next.score, perfectCount: next.perfectCount, phase: 'gameover', charge: 0 }))
    setBest((currentBest) => {
      const nextBest = Math.max(currentBest, next.score)
      try { localStorage.setItem(BEST_KEY, String(nextBest)) } catch { /* storage can be disabled */ }
      return nextBest
    })
  }, [best, skipResult])

  const restart = useCallback(() => {
    setRoundKey((value) => value + 1)
    void beginRound()
  }, [beginRound])

  const submitScore = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!result || !session || finishState === 'submitting') return
    const cleanName = nickname.trim()
    if (!cleanName || [...cleanName].length > 16) {
      setFinishState('error')
      setFinishError('请输入 1–16 个字符的昵称')
      return
    }
    setFinishState('submitting')
    setFinishError('')
    const requestId = roundRequestRef.current
    try {
      const accepted = await finishSession(session, result, cleanName)
      if (!mountedRef.current || requestId !== roundRequestRef.current) return
      try { localStorage.setItem(NICKNAME_KEY, cleanName) } catch { /* storage can be disabled */ }
      setFinishState('submitted')
      if (accepted.score > best) {
        setBest(accepted.score)
        try { localStorage.setItem(BEST_KEY, String(accepted.score)) } catch { /* storage can be disabled */ }
      }
      void loadLeaderboard()
    } catch (error) {
      if (!mountedRef.current || requestId !== roundRequestRef.current) return
      setFinishState('error')
      setFinishError(error instanceof Error ? error.message : '提交失败，请稍后再试')
    }
  }, [best, finishState, loadLeaderboard, nickname, result, session])

  const isPlaying = mode !== 'loading' && snapshot.phase !== 'gameover' && seed !== null
  const statusText = mode === 'local' ? '本地练习 · 成绩仅保存在本机' : mode === 'cloud' ? '云端比赛 · 记录可提交排行榜' : '正在准备下一朵云…'
  const leaderboardMessage = useMemo(() => {
    if (!isCloudConfigured) return '连接云端后，前 20 名会在这里出现'
    if (leaderboardState === 'loading') return '正在加载…'
    if (leaderboardState === 'error') return leaderboardError
    return '还没有成绩，成为第一位登榜者'
  }, [leaderboardError, leaderboardState])

  return (
    <>
    {guideOpen && <Guide>
        <aside className="leaderboard-panel" aria-labelledby="leaderboard-title">
          <div className="panel-heading"><div><span className="eyebrow">TOP 20</span><h2 id="leaderboard-title">云端排行榜</h2></div><Icon name="arrow" /></div>
          <div className="leaderboard-body">
            {leaders.length > 0 ? <ol className="leader-list">{leaders.map((entry, index) => <li key={entry.id} className={index < 3 ? 'podium' : ''}><span className="rank">{String(index + 1).padStart(2, '0')}</span><span className="leader-name">{entry.nickname}</span><span className="leader-score">{entry.score}</span><time>{formatRankDate(entry.created_at)}</time></li>)}</ol> : <div className="leader-empty"><span className="empty-cloud">☁</span><strong>{leaderboardState === 'loading' ? '排行榜加载中' : leaderboardState === 'error' ? '暂时无法连接' : '还没有人登榜'}</strong><p>{leaderboardMessage}</p>{leaderboardState === 'error' && <button type="button" className="text-button" onClick={() => void loadLeaderboard()}><Icon name="refresh" />重新加载</button>}</div>}
          </div>

        </aside>
    </Guide>}
    <main className="app-shell" style={{display:guideOpen ? 'none' : undefined}}>
      <div className="floating-menu">
        <button className="menu-toggle" aria-label="游戏菜单" aria-expanded={menuOpen} aria-controls="game-menu-panel" onClick={() => { if (!menuOpen) { menuWasPaused.current=paused; setPaused(true) } else setPaused(menuWasPaused.current); setMenuOpen(!menuOpen) }}>☰</button>
        {menuOpen && <nav id="game-menu-panel" className="menu-panel" aria-label="游戏设置">
          <a href="#/guide" onClick={()=>setMenuOpen(false)}>玩法与排行榜 ↗</a>
          <button onClick={()=>setSound(value=>!value)} aria-pressed={sound}>{sound?'关闭声音':'开启声音'}</button>
          <button onClick={()=>{setMenuOpen(false);setPaused(false)}} disabled={!isPlaying}>继续游戏</button>
          <label><input type="checkbox" checked={skipResult} onChange={e=>saveSkipResult(e.target.checked)} />不再自动弹出成绩提交</label>
        </nav>}
      </div>

      <div className="layout-grid">
        <section className="game-column" aria-label="游戏区域">
          <div className={`game-frame ${paused ? 'is-paused' : ''} ${impactPulse ? 'is-impact' : ''}`}>
            <div className="play-hud">
              <div className="play-score"><span>分数</span><strong className={impactPulse ? 'is-impact' : ''}>{snapshot.score.toString().padStart(2, '0')}</strong>{snapshot.combo > 1 && <b>连击 ×{snapshot.combo}</b>}</div>
              <div className="play-meta"><span style={{color:SCENES[scene].rim}}>{SCENES[scene].name}</span><span>最佳 {best}</span>{mode === 'local' && <span>本地练习</span>}</div>
            </div>
            {!!snapshot.items?.length && <div className="play-items item-inventory" aria-label="当前道具">{snapshot.items.map(item=><span key={item.kind} aria-label={`${ITEM_INFO[item.kind].name}，剩余${item.remaining}跳`} style={{color:ITEM_INFO[item.kind].color}}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">{item.kind==='compass'?<><circle cx="12" cy="12" r="9"/><path d="M12 5l4 13-4-3-4 3z"/></>:item.kind==='shell'?<><path d="M3 13a9 9 0 0118 0l-4 7H7z"/><path d="M12 19V5M12 19L6 8M12 19l6-11"/></>:<><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="10"/></>}</svg><em className="item-charges" aria-hidden="true">{Array.from({length:item.remaining},(_,i)=><i key={i}/>)}</em></span>)}</div>}
            <span className="game-a11y-help" aria-live="polite">{statusText}</span>
            {mode !== 'loading' && seed !== null && <GameCanvas key={`${seed}-${roundKey}`} seed={seed} scene={scene} paused={paused} sound={sound} onUpdate={onUpdate} onGameOver={onGameOver} />}
            {mode === 'loading' && <div className="game-loading" aria-live="polite"><span className="loader" />正在连接云端…</div>}
            {paused && isPlaying && <div className="pause-cover"><span className="pause-symbol"><Icon name="play" /></span><strong>游戏已暂停</strong><button className="secondary-button" onClick={()=>{setPaused(false);setMenuOpen(false)}}>继续游戏</button></div>}
            <div className="game-a11y-help" aria-live="polite">
              {snapshot.phase === 'ready' && '按住画面或空格蓄力，松开起跳'}
              {snapshot.phase === 'charging' && '蓄力中'}
              {snapshot.phase === 'jumping' && '跳跃中'}
              {snapshot.phase === 'gameover' && '游戏结束'}
            </div>
          </div>

        </section>


      </div>

      {result && !resultOpen && <div className="quick-result" role="status"><strong>{result.score} 分</strong><button className="primary-button" onClick={restart}>再来一局</button>{mode==='cloud' && finishState!=='submitted' && <button className="quiet-button" onClick={()=>setResultOpen(true)}>提交成绩</button>}</div>}
      {result && resultOpen && <div className="modal-backdrop" role="presentation"><section ref={dialogRef} className="result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title" tabIndex={-1}>
        <div className="result-glow" />
        <span className="result-kicker">{mode === 'cloud' ? '比赛结束' : '练习结束'}</span>
        <h1 id="result-title">这次跳了 {result.score} 分<span>，再试一次？</span></h1>
        <div className="result-score"><span>本局得分</span><strong>{result.score}</strong>{newRecord && <em>新纪录</em>}</div>
        <div className="result-stats"><div><strong>{result.perfectCount}</strong><span>完美落点</span></div><div><strong>{result.holds.length}</strong><span>跳跃次数</span></div><div><strong>{Math.round(result.durationMs / 1000)}s</strong><span>坚持时间</span></div></div>
        {mode === 'cloud' && session && finishState !== 'submitted' ? <form className="submit-form" onSubmit={submitScore}><label htmlFor="nickname">留下你的名字</label><div className="name-row"><input id="nickname" value={nickname} onChange={(event) => { setNickname(event.target.value); if (finishState === 'error') setFinishState('idle') }} maxLength={16} placeholder="输入昵称" autoComplete="nickname" /><button className="primary-button" type="submit" disabled={finishState === 'submitting'}>{finishState === 'submitting' ? '提交中…' : '登上榜单'} <Icon name="arrow" /></button></div>{finishState === 'error' && <p className="form-error" role="alert">{finishError}</p>}</form> : mode === 'cloud' && finishState === 'submitted' ? <p className="submitted-note" role="status">已提交到云端排行榜</p> : <p className="practice-note">这是一次本地练习，成绩已保存为本地最佳。</p>}
        <label className="skip-result"><input type="checkbox" checked={skipResult} onChange={e=>saveSkipResult(e.target.checked)} />以后不再显示此弹窗</label>
        <button className="text-button" disabled={finishState==='submitting'} onClick={()=>setResultOpen(false)}>跳过提交</button>
        <div className="result-actions"><button className="secondary-button" type="button" onClick={restart} disabled={finishState === 'submitting'}><Icon name="refresh" /> {finishState === 'submitting' ? '提交中…' : '再来一局'}</button></div>
      </section></div>}
    </main>
    </>
  )
}
