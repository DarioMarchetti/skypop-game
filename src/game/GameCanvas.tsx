import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  applyJump,
  createRun,
  JUMP_DURATION_MS,
  jumpDistance,
  MAX_HOLD_MS,
  type Platform,
  type RunState,
} from './core';
import { createFxState, drawFx, spawnLandingFx, stepFx, type FxState } from './fx';
import { getAudioDirector } from './audio';
import { drawSceneBackground } from './sceneBackground';
import { drawSceneFall } from './sceneFall';
import { SCENES, type SceneKind } from './sceneTypes';
import { itemAt, drawItem, drawRainbowTrail, ITEM_INFO, type ItemKind } from './items';

export type GameSnapshot = {
  score: number;
  combo: number;
  perfectCount: number;
  phase: 'ready' | 'charging' | 'jumping' | 'gameover';
  /** A normalized value from 0 to 1 while charging. */
  charge: number;
  items?: { kind: ItemKind; remaining: number }[];
};

export type GameResult = {
  score: number;
  perfectCount: number;
  holds: number[];
  durationMs: number;
};

export type GameCanvasProps = {
  seed: number;
  scene?: SceneKind;
  paused: boolean;
  sound: boolean;
  onUpdate: (snapshot: GameSnapshot) => void;
  onGameOver: (result: GameResult) => void;
};

type JumpAnimation = {
  from: Platform;
  target: Platform;
  distance: number;
  landed: boolean;
  perfect: boolean;
  startedAt: number;
  impactSpawned: boolean;
};

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
const sceneScale = (width: number): number => Math.min(1, Math.max(0.52, width / 620));

const project = (
  x: number,
  z: number,
  cameraX: number,
  cameraZ: number,
  width: number,
  height: number,
): { x: number; y: number } => ({
  x: width * 0.5 + (x - cameraX - (z - cameraZ)) * 0.72 * sceneScale(width),
  y: height * 0.64 - (x - cameraX + z - cameraZ) * 0.36 * sceneScale(width),
});

const drawGlow = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void => {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
};

const drawPlatform = (
  context: CanvasRenderingContext2D,
  platform: Platform,
  cameraX: number,
  cameraZ: number,
  width: number,
  height: number,
  active: boolean,
  scene: SceneKind,
): void => {
  const palette = SCENES[scene];
  const center = project(platform.x, platform.z, cameraX, cameraZ, width, height);
  const rx = platform.radius * 0.98 * sceneScale(width);
  const ry = platform.radius * 0.48 * sceneScale(width);
  if (center.x < -rx * 2 || center.x > width + rx * 2 || center.y < -ry * 3 || center.y > height + ry * 3) {
    return;
  }

  context.save();
  // A thick underside and two offset rims sell the floating depth at a glance.
  context.save();
  context.translate(0, 15);
  context.fillStyle = palette.underside;
  context.shadowColor = palette.rim;
  context.shadowBlur = active ? 24 : 11;
  context.beginPath();
  context.ellipse(center.x, center.y, rx * 1.04, ry * 0.94, 0, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.globalAlpha = active ? 0.88 : 0.56;
  context.strokeStyle = palette.rim;
  context.lineWidth = active ? 3 : 2;
  context.beginPath();
  context.ellipse(center.x, center.y + 9, rx * 1.02, ry * 0.95, 0, 0, Math.PI * 2);
  context.stroke();

  if (active) drawGlow(context, center.x, center.y + 3, platform.radius * 1.7, 'rgba(64, 205, 255, 0.13)');
  const fill = context.createLinearGradient(center.x, center.y - ry, center.x, center.y + ry);
  fill.addColorStop(0, palette.top);
  fill.addColorStop(1, palette.bottom);
  context.fillStyle = fill;
  context.strokeStyle = active ? 'rgba(232, 255, 255, 0.94)' : 'rgba(154, 226, 255, 0.68)';
  context.lineWidth = active ? 2 : 1;
  context.beginPath();
  context.ellipse(center.x, center.y, rx, ry, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.globalAlpha = 0.22;
  context.strokeStyle = '#d7f9ff';
  context.lineWidth = 1;
  context.beginPath();
  context.ellipse(center.x, center.y - 2, rx * 0.67, ry * 0.58, 0, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = active ? 0.42 : 0.2;
  context.strokeStyle = palette.rim;
  context.lineWidth = 1;
  context.beginPath();
  context.ellipse(center.x, center.y + 5, rx * 0.82, ry * 0.67, 0, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = active ? 0.85 : 0.6;
  context.strokeStyle = palette.rim;
  context.lineWidth = 1.4;
  if (scene === 'lava' || scene === 'ice') {
    // Surface cracks and facets stay inside the physical landing ellipse.
    for (let ray = 0; ray < 5; ray++) {
      const angle = ray * Math.PI * 0.4 + platform.index;
      context.beginPath(); context.moveTo(center.x, center.y);
      context.lineTo(center.x + Math.cos(angle + 0.2) * rx * 0.4, center.y + Math.sin(angle + 0.2) * ry * 0.4);
      context.lineTo(center.x + Math.cos(angle) * rx * 0.85, center.y + Math.sin(angle) * ry * 0.85);
      context.stroke();
    }
  } else if (scene === 'vines') {
    for (let vine = -1; vine <= 1; vine++) {
      const vx = center.x + vine * rx * 0.6;
      context.strokeStyle = '#64a755'; context.lineWidth = 2;
      context.beginPath(); context.moveTo(vx, center.y + ry * 0.7);
      context.bezierCurveTo(vx + 9, center.y + ry + 10, vx - 9, center.y + ry + 18, vx, center.y + ry + 30);
      context.stroke();
      context.fillStyle = '#9cce65'; context.beginPath(); context.ellipse(vx + 4, center.y + ry + 14, 6, 3, -0.7, 0, Math.PI * 2); context.fill();
    }
  } else if (scene === 'sky') {
    context.fillStyle = '#eefaff';
    for (let puff = -2; puff <= 2; puff++) {
      context.beginPath(); context.ellipse(center.x + puff * rx * 0.29, center.y + ry * 0.5, rx * 0.24, ry * 0.4, 0, 0, Math.PI * 2); context.fill();
    }
  }
  context.restore();
};

const drawCharacter = (
  context: CanvasRenderingContext2D,
  position: { x: number; z: number; height: number },
  cameraX: number,
  cameraZ: number,
  width: number,
  height: number,
  options: { scaleX?: number; scaleY?: number; rotation?: number; alpha?: number; charge?: number } = {},
): void => {
  const point = project(position.x, position.z, cameraX, cameraZ, width, height);
  const y = point.y - position.height;
  const scaleX = options.scaleX ?? 1;
  const scaleY = options.scaleY ?? 1;
  drawGlow(context, point.x, y, 31, 'rgba(245, 228, 80, 0.2)');
  context.save();
  context.globalAlpha = options.alpha ?? 1;
  context.translate(point.x, y);
  context.rotate(options.rotation ?? 0);
  context.scale(scaleX, scaleY);
  context.shadowColor = 'rgba(250, 226, 45, 0.72)';
  context.shadowBlur = 14 + (options.charge ?? 0) * 28;
  context.fillStyle = (options.charge ?? 0) > 0.8 ? '#fff5a3' : '#e9ed42';
  context.strokeStyle = '#fff69a';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(0, -17);
  context.lineTo(12, -7);
  context.lineTo(9, 11);
  context.lineTo(0, 18);
  context.lineTo(-9, 11);
  context.lineTo(-12, -7);
  context.closePath();
  context.fill();
  context.stroke();
  context.fillStyle = '#173c70';
  context.shadowBlur = 0;
  context.beginPath();
  context.arc(-4, -3, 2, 0, Math.PI * 2);
  context.arc(4, -3, 2, 0, Math.PI * 2);
  context.fill();
  context.restore();
};

export function GameCanvas({ seed, scene = 'ocean', paused, sound, onUpdate, onGameOver }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // `createRun` builds the complete deterministic route. Keep the ref lazy so
  // high-frequency snapshot renders never regenerate all 1024 platforms.
  const runRef = useRef<RunState>(null!);
  if (!runRef.current) runRef.current = createRun(seed);
  const phaseRef = useRef<GameSnapshot['phase']>('ready');
  const chargeStartRef = useRef(0);
  const itemsRef = useRef<Record<ItemKind, number>>({compass:0,shell:0,pearl:0});
  const hintPlayedRef = useRef(false);
  const activePointerRef = useRef<number | null>(null);
  const keyChargingRef = useRef(false);
  const jumpRef = useRef<JumpAnimation | null>(null);
  const holdsRef = useRef<number[]>([]);
  const runStartedRef = useRef<number | null>(null);
  const cameraRef = useRef({ x: 0, z: 0 });
  const fxRef = useRef<FxState>(createFxState());
  const lastFrameRef = useRef(0);
  const pausedAtRef = useRef<number | null>(null);
  const pausedRef = useRef(paused);
  const autoPausedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const soundRef = useRef(sound);
  const onUpdateRef = useRef(onUpdate);
  const onGameOverRef = useRef(onGameOver);
  const endedRef = useRef(false);
  const audioRef = useRef(getAudioDirector());

  useEffect(() => { soundRef.current = sound; audioRef.current.setEnabled(sound); if (!sound) audioRef.current.stop(); }, [sound]);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
  useEffect(() => { onGameOverRef.current = onGameOver; }, [onGameOver]);

  const publish = useCallback((charge = 0): void => {
    const run = runRef.current;
    onUpdateRef.current({
      score: run.score,
      combo: run.combo,
      perfectCount: run.perfectCount,
      phase: phaseRef.current,
      charge: clamp(charge, 0, 1),
      items: (Object.keys(itemsRef.current) as ItemKind[]).filter(kind => itemsRef.current[kind] > 0).map(kind => ({kind, remaining:itemsRef.current[kind]})),
    });
  }, []);

  const resetCharge = useCallback((): void => {
    activePointerRef.current = null;
    keyChargingRef.current = false;
    chargeStartRef.current = 0;
    if (phaseRef.current === 'charging') {
      phaseRef.current = 'ready';
      publish(0);
    }
  }, [publish]);

  const releaseCharge = useCallback((releasedAt: number): void => {
    if (phaseRef.current !== 'charging') return;
    const hold = Math.round(clamp(releasedAt - chargeStartRef.current, 0, MAX_HOLD_MS));
    const run = runRef.current;
    const platform = run.platforms[run.index] ?? run.platforms[0];
    const from = { ...platform, ...(run.position ?? { x: platform.x, z: platform.z }) };
    const result = applyJump(run, hold);
    runRef.current = result.state;
    holdsRef.current.push(hold);
    if (runStartedRef.current === null) runStartedRef.current = chargeStartRef.current;
    jumpRef.current = {
      from,
      // Keep the target platform metadata (radius/index) while animating to
      // the actual point reached by this release.
      target: { ...result.target, ...result.state.position },
      distance: result.distance,
      landed: result.landed,
      perfect: result.perfect,
      startedAt: releasedAt,
      impactSpawned: false,
    };
    phaseRef.current = 'jumping';
    activePointerRef.current = null;
    keyChargingRef.current = false;
    audioRef.current.tone('release', run.combo);
    publish(0);
  }, [publish]);

  const beginCharge = useCallback((eventTime: number): void => {
    if (phaseRef.current !== 'ready' || paused || autoPausedRef.current || endedRef.current) return;
    phaseRef.current = 'charging';
    hintPlayedRef.current = false;
    chargeStartRef.current = eventTime;
    if (runStartedRef.current === null) runStartedRef.current = eventTime;
    audioRef.current.setEnabled(soundRef.current);
    audioRef.current.activate();
    audioRef.current.tone('charge', runRef.current.combo);
    publish(0);
  }, [paused, publish]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (activePointerRef.current !== null || keyChargingRef.current || event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.focus();
    beginCharge(now());
    if (phaseRef.current === 'charging') {
      activePointerRef.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }, [beginCharge]);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (activePointerRef.current !== event.pointerId) return;
    event.preventDefault();
    releaseCharge(now());
  }, [releaseCharge]);

  const onPointerCancel = useCallback((event: ReactPointerEvent<HTMLCanvasElement>): void => {
    if (activePointerRef.current === event.pointerId) resetCharge();
  }, [resetCharge]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLCanvasElement>): void => {
    if (event.code !== 'Space') return;
    event.preventDefault();
    if (event.repeat || keyChargingRef.current || activePointerRef.current !== null) return;
    beginCharge(now());
    if (phaseRef.current === 'charging') keyChargingRef.current = true;
  }, [beginCharge]);

  const onKeyUp = useCallback((event: ReactKeyboardEvent<HTMLCanvasElement>): void => {
    if (event.code !== 'Space' || !keyChargingRef.current) return;
    event.preventDefault();
    releaseCharge(now());
  }, [releaseCharge]);

  useEffect(() => {
    runRef.current = createRun(seed);
    phaseRef.current = 'ready';
    jumpRef.current = null;
    fxRef.current = createFxState();
    holdsRef.current = [];
    runStartedRef.current = null;
    endedRef.current = false;
    audioRef.current.pause();
    cameraRef.current = { x: 0, z: 0 };
    publish(0);
    canvasRef.current?.focus({ preventScroll: true });
  }, [publish, seed]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      reducedMotionRef.current = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    }
  }, []);

  useEffect(() => {
    const onVisibility = (): void => {
      autoPausedRef.current = document.visibilityState === 'hidden';
      if (autoPausedRef.current) audioRef.current.pause();
      if (autoPausedRef.current && phaseRef.current === 'charging') resetCharge();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [resetCharge]);

  useEffect(() => {
    if ((paused || autoPausedRef.current) && phaseRef.current === 'charging') resetCharge();
    if (paused || autoPausedRef.current) audioRef.current.pause();
  }, [paused, resetCharge]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const draw = (timestamp: number): void => {
      const cssWidth = Math.max(280, canvas.clientWidth || 640);
      const cssHeight = Math.max(260, canvas.clientHeight || 500);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const pixelWidth = Math.floor(cssWidth * dpr);
      const pixelHeight = Math.floor(cssHeight * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const isPaused = pausedRef.current || autoPausedRef.current;
      if (isPaused) {
        if (pausedAtRef.current === null) pausedAtRef.current = timestamp;
      } else if (pausedAtRef.current !== null) {
        const gap = timestamp - pausedAtRef.current;
        if (jumpRef.current) jumpRef.current.startedAt += gap;
        if (runStartedRef.current !== null) runStartedRef.current += gap;
        pausedAtRef.current = null;
      }

      const run = runRef.current;
      const jump = jumpRef.current;
      const gameTimestamp = isPaused ? (pausedAtRef.current ?? timestamp) : timestamp;
      const deltaSeconds = lastFrameRef.current > 0 ? (timestamp - lastFrameRef.current) / 1000 : 0;
      if (!isPaused) stepFx(fxRef.current, deltaSeconds, reducedMotionRef.current);
      const currentPlatform = run.platforms[run.index] ?? run.platforms[0];
      let actor = currentPlatform ? { ...currentPlatform, ...(run.position ?? { x: currentPlatform.x, z: currentPlatform.z }) } : currentPlatform;
      let actorHeight = 18;
      let progress = 0;
      let fallAge = -1;
      if (phaseRef.current === 'jumping' && jump) {
        progress = clamp((gameTimestamp - jump.startedAt) / JUMP_DURATION_MS, 0, 1);
        const arc = 4 * progress * (1 - progress);
        const targetDistance = Math.hypot(jump.target.x - jump.from.x, jump.target.z - jump.from.z);
        const landingRatio = targetDistance > 0 ? jump.distance / targetDistance : 1;
        const landingX = jump.from.x + (jump.target.x - jump.from.x) * landingRatio;
        const landingZ = jump.from.z + (jump.target.z - jump.from.z) * landingRatio;
        actor = {
          x: jump.from.x + (landingX - jump.from.x) * progress,
          z: jump.from.z + (landingZ - jump.from.z) * progress,
          radius: jump.target.radius,
          index: jump.target.index,
        };
        actorHeight = 18 + arc * (jump.distance * 0.32 + 48);
        if (!jump.landed && progress >= 1) {
          const fallMs = gameTimestamp - jump.startedAt - JUMP_DURATION_MS;
          actorHeight = 18 - Math.min(65, fallMs * 0.26);
          fallAge = (fallMs - 200) / 1000;
          if (!isPaused && fallAge >= 0 && !jump.impactSpawned) {
            jump.impactSpawned = true;
            audioRef.current.tone('fail', 0, scene);
          }
        }
        if (!isPaused && progress >= 1 && (jump.landed || fallAge >= 0.9)) {
          if (jump.landed && !jump.impactSpawned) {
            jump.impactSpawned = true;
            if (itemsRef.current.pearl > 0 && !reducedMotionRef.current) {
              for (let star = 0; star < 12; star++) fxRef.current.particles.push({x:jump.target.x,z:jump.target.z,angle:star*Math.PI/6,distance:0,speed:140,lift:110,size:3,hue:star*30,age:0,life:0.75});
              fxRef.current.particles = fxRef.current.particles.slice(-96);
            }
            for (const kind of Object.keys(itemsRef.current) as ItemKind[]) itemsRef.current[kind] = Math.max(0, itemsRef.current[kind] - 1);
            const pickup = itemAt(seed, jump.target.index);
            if (pickup) {
              itemsRef.current[pickup] = ITEM_INFO[pickup].duration;
            }
            spawnLandingFx(fxRef.current, jump.target.x, jump.target.z, jump.perfect, run.combo, reducedMotionRef.current);
          }
          const finished = !jump.landed || run.over;
          phaseRef.current = finished ? 'gameover' : 'ready';
          if (finished) {
            endedRef.current = true;
            onGameOverRef.current({
              score: run.score,
              perfectCount: run.perfectCount,
              holds: holdsRef.current.slice(),
              durationMs: Math.max(0, Math.round(timestamp - (runStartedRef.current ?? timestamp))),
            });
          } else {
            audioRef.current.tone('land', run.combo);
          }
          if (finished && jump.landed) audioRef.current.finish();
          publish(0);
        }
      } else if (phaseRef.current === 'charging' && !isPaused) {
        publish(clamp((gameTimestamp - chargeStartRef.current) / MAX_HOLD_MS, 0, 1));
      }

      const focus = actor ?? { x: 0, z: 0 };
      cameraRef.current.x += (focus.x - cameraRef.current.x) * (reducedMotionRef.current ? 0.28 : 0.1);
      cameraRef.current.z += (focus.z - cameraRef.current.z) * (reducedMotionRef.current ? 0.28 : 0.1);
      const shake = isPaused || reducedMotionRef.current ? 0 : fxRef.current.shake;
      const visualTimestamp = gameTimestamp;
      const cameraX = cameraRef.current.x + Math.sin(visualTimestamp * 0.071) * shake * 0.16;
      const cameraZ = cameraRef.current.z + Math.cos(visualTimestamp * 0.089) * shake * 0.13;

      drawSceneBackground(context, cssWidth, cssHeight, visualTimestamp, reducedMotionRef.current, scene);

      const visibleIndex = phaseRef.current === 'jumping' && jump ? jump.from.index : run.index;
      const first = Math.max(0, visibleIndex - 3);
      const last = Math.min(run.platforms.length, visibleIndex + 8);
      for (let index = last - 1; index >= first; index -= 1) {
        drawPlatform(context, run.platforms[index], cameraX, cameraZ, cssWidth, cssHeight, index === visibleIndex, scene);
        const item = index > visibleIndex ? itemAt(seed, index) : null;
        if (item) {
          const point = project(run.platforms[index].x, run.platforms[index].z, cameraX, cameraZ, cssWidth, cssHeight);
          drawItem(context, point.x, point.y - 40, item, visualTimestamp, reducedMotionRef.current);
        }
      }

      const nextPlatform = run.platforms[run.index + 1];
      if (nextPlatform && phaseRef.current !== 'jumping') {
        const marker = project(nextPlatform.x, nextPlatform.z, cameraX, cameraZ, cssWidth, cssHeight);
        context.save();
        context.strokeStyle = '#e9ed42';
        context.lineWidth = 1.5;
        context.beginPath();
        context.ellipse(marker.x, marker.y, nextPlatform.radius * 0.22 * sceneScale(cssWidth), nextPlatform.radius * 0.11 * sceneScale(cssWidth), 0, 0, Math.PI * 2);
        context.stroke();
        context.restore();
      }

      if (jump && phaseRef.current === 'jumping' && progress < 1) {
        const from = project(jump.from.x, jump.from.z, cameraX, cameraZ, cssWidth, cssHeight);
        const to = project(jump.target.x, jump.target.z, cameraX, cameraZ, cssWidth, cssHeight);
        context.save();
        context.setLineDash([3, 8]);
        context.lineWidth = 2;
        context.strokeStyle = jump.perfect ? 'rgba(255, 234, 94, 0.86)' : 'rgba(113, 224, 255, 0.72)';
        context.beginPath(); context.moveTo(from.x, from.y - 4); context.lineTo(to.x, to.y - 4); context.stroke();
        context.restore();

        // Stretching ghosts make the jump readable at a glance and follow the travel direction.
        if (!reducedMotionRef.current) {
          for (let trail = 4; trail >= 1; trail -= 1) {
            const trailProgress = clamp(progress - trail * 0.055, 0, 1);
            const trailArc = 4 * trailProgress * (1 - trailProgress);
            const targetDistance = Math.hypot(jump.target.x - jump.from.x, jump.target.z - jump.from.z);
            const ratio = targetDistance > 0 ? jump.distance / targetDistance : 1;
            const trailX = jump.from.x + (jump.from.x + (jump.target.x - jump.from.x) * ratio - jump.from.x) * trailProgress;
            const trailZ = jump.from.z + (jump.from.z + (jump.target.z - jump.from.z) * ratio - jump.from.z) * trailProgress;
            if (itemsRef.current.pearl > 0) {
              const trailPoint = project(trailX, trailZ, cameraX, cameraZ, cssWidth, cssHeight);
              drawRainbowTrail(context, trailPoint.x, trailPoint.y - (18 + trailArc * (jump.distance * 0.32 + 48)), visualTimestamp + trail * 100);
            }
            drawCharacter(context, { x: trailX, z: trailZ, height: 18 + trailArc * (jump.distance * 0.32 + 48) }, cameraX, cameraZ, cssWidth, cssHeight, {
              scaleX: 1 - trail * 0.035,
              scaleY: 1 + trail * 0.035,
              alpha: 0.07 * (5 - trail),
            });
          }
        }
      }

      const actorCharge = phaseRef.current === 'charging' ? clamp((gameTimestamp - chargeStartRef.current) / MAX_HOLD_MS, 0, 1) : 0;
      const actorArc = phaseRef.current === 'jumping' ? 4 * progress * (1 - progress) : 0;
      const actorJitter = actorCharge > 0 && !reducedMotionRef.current ? Math.sin(timestamp * 0.14) * actorCharge * 2.5 : 0;
      if (phaseRef.current === 'charging') {
        const current = actor, target = run.platforms[run.index + 1];
        if (target) {
          const distance = jumpDistance(actorCharge * MAX_HOLD_MS);
          const span = Math.hypot(target.x-current.x, target.z-current.z);
          const close = Math.abs(distance-span) <= target.radius * 0.22;
          if (itemsRef.current.compass > 0 && span > 0) {
            const point = project(current.x+(target.x-current.x)*distance/span, current.z+(target.z-current.z)*distance/span, cameraX,cameraZ,cssWidth,cssHeight);
            context.save();
            context.strokeStyle = close ? '#fff17a' : '#a6ffff';
            context.lineWidth = 2; context.shadowColor = context.strokeStyle; context.shadowBlur = 12;
            context.beginPath(); context.ellipse(point.x,point.y,11,5,0,0,Math.PI*2); context.stroke();
            context.restore();
          }
          if (itemsRef.current.shell > 0 && close) {
            const point = project(actor.x,actor.z,cameraX,cameraZ,cssWidth,cssHeight);
            drawGlow(context,point.x,point.y-20,45,'rgba(255,163,203,0.6)');
            if (!hintPlayedRef.current && !isPaused) { audioRef.current.hint(); hintPlayedRef.current=true; }
          }
        }
      }
      // Grounded charge feedback: the island gathers energy into the character.
      if (phaseRef.current === 'charging') {
        const origin = project(actor.x, actor.z, cameraX, cameraZ, cssWidth, cssHeight);
        const radius = run.platforms[run.index].radius * sceneScale(cssWidth);
        const energy = 0.15 + actorCharge * 0.85;
        const reduced = reducedMotionRef.current;
        const color = actorCharge > 0.8 ? '#fff07a' : SCENES[scene].rim;
        context.save();
        context.translate(origin.x, origin.y);
        context.scale(1, 0.49);
        drawGlow(context, 0, 0, radius * 1.65, `rgba(93, 238, 255, ${energy * 0.42})`);
        context.shadowColor = color;
        context.shadowBlur = 12 + energy * 18;
        context.strokeStyle = color;
        context.lineWidth = 2 + energy * 2;
        context.globalAlpha = 0.4 + energy * 0.5;
        context.beginPath();
        context.arc(0, 0, radius * 0.99, 0, Math.PI * 2);
        context.stroke();
        // Complete rings contract; they are not a radial progress meter.
        for (let ring = 0; ring < (reduced ? 1 : 3); ring++) {
          const cycle = reduced ? 0.5 : ((visualTimestamp * 0.0015 + ring / 3) % 1);
          context.globalAlpha = energy * Math.sin(cycle * Math.PI) * 0.75;
          context.lineWidth = 1.2 + energy * 1.6;
          context.beginPath();
          context.arc(0, 0, radius * (1.35 - cycle * 1.12), 0, Math.PI * 2);
          context.stroke();
        }
        context.restore();
        if (!reduced) {
          context.save();
          context.strokeStyle = color;
          context.fillStyle = color;
          context.shadowColor = color;
          context.shadowBlur = 10;
          for (let spark = 0; spark < 18; spark++) {
            const cycle = (visualTimestamp * 0.0012 + spark * 0.137) % 1;
            const angle = spark * 2.399 + visualTimestamp * 0.0003;
            const orbit = radius * (1.5 - cycle * 1.38);
            const sx = origin.x + Math.cos(angle) * orbit;
            const sy = origin.y + Math.sin(angle) * orbit * 0.49 - cycle * 19;
            context.globalAlpha = Math.sin(cycle * Math.PI) * energy;
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(sx + Math.cos(angle) * (4 + energy * 6), sy + Math.sin(angle) * 3);
            context.lineTo(sx, sy);
            context.stroke();
            context.beginPath(); context.arc(sx, sy, 1.5 + energy, 0, Math.PI * 2); context.fill();
          }
          context.restore();
        }
      }
      if (actor && fallAge < 0 && !(phaseRef.current === 'gameover' && jump && !jump.landed)) drawCharacter(context, { ...actor, x: actor.x + actorJitter, height: actorHeight - actorCharge * 8.1 }, cameraX, cameraZ, cssWidth, cssHeight, {
        charge: actorCharge,
        scaleX: phaseRef.current === 'charging' ? 1 + actorCharge * 0.48 : 1 - actorArc * 0.08,
        scaleY: phaseRef.current === 'charging' ? 1 - actorCharge * 0.45 : 1 + actorArc * 0.18,
        rotation: phaseRef.current === 'jumping' ? (jump?.target.x ?? actor.x) - (jump?.from.x ?? actor.x) > 0 ? -0.06 : 0.06 : actorJitter * 0.02,
      });

      drawFx(context, fxRef.current, (x, z) => project(x, z, cameraX, cameraZ, cssWidth, cssHeight), sceneScale(cssWidth), reducedMotionRef.current);

      if (fallAge >= 0) {
        const fallPoint = project(actor.x, actor.z, cameraX, cameraZ, cssWidth, cssHeight);
        drawSceneFall(context, fallPoint.x, fallPoint.y + 22, fallAge, reducedMotionRef.current, scene);
      }

      if (isPaused) {
        context.fillStyle = 'rgba(0, 6, 28, 0.4)';
        context.fillRect(0, 0, cssWidth, cssHeight);
        context.fillStyle = '#e8f8ff';
        context.font = '600 15px system-ui, sans-serif';
        context.textAlign = 'center';
        context.fillText('已暂停', cssWidth / 2, cssHeight / 2);
      }

      lastFrameRef.current = timestamp;
      rafRef.current = window.requestAnimationFrame(draw);
    };

    rafRef.current = window.requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      audioRef.current.pause();
    };
  }, [publish, scene, seed]);

  return (
    <canvas
      ref={canvasRef}
      className="game-canvas"
      role="application"
      aria-label="云上跳跃游戏画面，按住并松开以跳跃"
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onBlur={resetCharge}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      style={{ touchAction: 'none', display: 'block', width: '100%', height: '100%' }}
    />
  );
}

export default GameCanvas;
