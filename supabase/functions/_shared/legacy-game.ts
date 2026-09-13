/**
 * The deterministic part of Cloud Hop.
 *
 * This file deliberately has no DOM, WebAudio, or Supabase dependencies so
 * that the browser and the edge function can use exactly the same rules.
 */

export type Platform = {
  x: number;
  z: number;
  radius: number;
  index: number;
};

export type RunState = {
  seed: number;
  platforms: Platform[];
  index: number;
  score: number;
  combo: number;
  perfectCount: number;
  over: boolean;
};

export const MAX_HOLD_MS = 1200;
export const JUMP_DURATION_MS = 520;
export const MAX_JUMPS = 1000;

// Keeping a reasonably long, deterministic route makes a run useful to both
// local play and server-side replay. The server can still reject a run after
// its own event-count limit.
export const PLATFORM_COUNT = MAX_JUMPS + 1;

const START_RADIUS = 58;
const MIN_PLATFORM_RADIUS = 28;
const MAX_PLATFORM_RADIUS = 47;

const uint32 = (value: number): number => (value >>> 0);

/** A small, fast PRNG whose state is entirely determined by the supplied seed. */
const nextRandom = (state: number): { value: number; state: number } => {
  let next = uint32(state + 0x6d2b79f5);
  next = Math.imul(next ^ (next >>> 15), next | 1);
  next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
  const value = ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  return { value, state: uint32(next) };
};

const clampHold = (holdMs: number): number => {
  if (!Number.isFinite(holdMs)) return 0;
  return Math.max(0, Math.min(MAX_HOLD_MS, holdMs));
};

export const jumpDistance = (holdMs: number): number => 30 + clampHold(holdMs) * 0.24;

const distanceBetween = (a: Platform, b: Platform): number =>
  Math.hypot(b.x - a.x, b.z - a.z);

const makePlatforms = (seed: number): Platform[] => {
  const platforms: Platform[] = [{ x: 0, z: 0, radius: START_RADIUS, index: 0 }];
  let randomState = uint32(seed);

  for (let index = 1; index < PLATFORM_COUNT; index += 1) {
    // Distances sit comfortably inside the jump envelope. They vary with
    // route difficulty, but max hold can always reach the whole platform.
    const distanceRoll = nextRandom(randomState);
    randomState = distanceRoll.state;
    const difficulty = Math.min(1, index / 120);
    const previous = platforms[index - 1];
    const radiusRoll = nextRandom(randomState);
    randomState = radiusRoll.state;
    const radius = MAX_PLATFORM_RADIUS - radiusRoll.value *
      (MAX_PLATFORM_RADIUS - MIN_PLATFORM_RADIUS);

    // Platforms are placed on one isometric axis at a time. The gap is large
    // enough to keep their elliptical footprints separate, while remaining
    // comfortably reachable with the 318-unit maximum jump.
    const minimumGap = previous.radius + radius + 24;
    const distance = Math.max(minimumGap, 125 + distanceRoll.value * (95 - difficulty * 8));
    const axisRoll = nextRandom(randomState);
    randomState = axisRoll.state;
    const directionRoll = nextRandom(randomState);
    randomState = directionRoll.state;
    // Always advance: reversing can overlap older islands and obscure the target.
    const direction = 1;
    const onX = axisRoll.value < 0.5;

    platforms.push({
      x: previous.x + (onX ? direction * distance : 0),
      z: previous.z + (onX ? 0 : direction * distance),
      radius,
      index,
    });
  }
  return platforms;
};

export const createRun = (seed: number): RunState => {
  const normalizedSeed = uint32(Number.isFinite(seed) ? seed : 0);
  return {
    seed: normalizedSeed,
    platforms: makePlatforms(normalizedSeed),
    index: 0,
    score: 0,
    combo: 0,
    perfectCount: 0,
    over: false,
  };
};

/**
 * Apply one release event. This function never mutates `state` or its
 * platform list, which makes replay and optimistic browser state safe.
 */
export const applyJump = (
  state: RunState,
  holdMs: number,
): {
  state: RunState;
  landed: boolean;
  perfect: boolean;
  distance: number;
  target: Platform;
} => {
  const distance = jumpDistance(holdMs);
  const fallback: Platform = { x: 0, z: 0, radius: START_RADIUS, index: state.index };
  const current = state.platforms[state.index] ?? state.platforms[0] ?? fallback;
  const target = state.platforms[state.index + 1] ?? current;

  // A finished run remains finished, and a malformed/empty route fails
  // safely without changing the caller's state.
  if (state.over || !current || !target || target === current) {
    return {
      state: { ...state, platforms: state.platforms.slice() },
      landed: false,
      perfect: false,
      distance,
      target,
    };
  }

  const targetDistance = distanceBetween(current, target);
  const error = Math.abs(distance - targetDistance);
  const landed = error <= target.radius;
  const perfect = landed && error <= target.radius * 0.22;

  if (!landed) {
    return {
      state: { ...state, platforms: state.platforms.slice(), over: true },
      landed: false,
      perfect: false,
      distance,
      target,
    };
  }

  const combo = perfect ? Math.min(5, state.combo + 1) : 0;
  // A perfect landing awards the base point plus the current streak bonus.
  const score = state.score + 1 + (perfect ? combo : 0);
  return {
    state: {
      ...state,
      platforms: state.platforms.slice(),
      index: target.index,
      score,
      combo,
      perfectCount: state.perfectCount + (perfect ? 1 : 0),
      over: target.index >= MAX_JUMPS,
    },
    landed: true,
    perfect,
    distance,
    target,
  };
};
