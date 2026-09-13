/** Collectable item scheduling and Canvas icons for the ocean route. */

export type ItemKind = 'compass' | 'shell' | 'pearl'

export const ITEM_INFO: Record<ItemKind, {
  name: string
  duration: number
  description: string
  color: string
}> = {
  compass: {
    name: '潮汐罗盘',
    duration: 3,
    description: '接下来 3 跳，蓄力时显示预计落点',
    color: '#62d9ff',
  },
  shell: {
    name: '回声海螺',
    duration: 3,
    description: '接下来 3 跳，接近中心所需力度时闪光并提示音',
    color: '#ff8c9e',
  },
  pearl: {
    name: '流星珍珠',
    duration: 5,
    description: '5 跳彩虹拖尾星光落地（不额外加分）',
    color: '#ffd66e',
  },
}

const MAX_PLATFORMS = 1024
const MAX_SEEDS = 8
const schedules = new Map<number, Array<ItemKind | null>>()

/** A small integer hash. All schedule decisions derive from this function. */
function hash(seed: number, salt: number): number {
  let value = (Math.trunc(seed) | 0) ^ Math.imul((salt + 0x9e3779b9) | 0, 0x45d9f3b)
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  return (value ^ (value >>> 16)) >>> 0
}

function pickKind(seed: number, itemNumber: number, previous: ItemKind | null): ItemKind {
  const roll = hash(seed, itemNumber * 3 + 1) % 100
  let picked: ItemKind = roll < 40 ? 'compass' : roll < 75 ? 'shell' : 'pearl'
  // Keep the weighted draw, but rotate a repeat to make adjacent items distinct.
  if (picked === previous) {
    picked = picked === 'compass' ? 'shell' : picked === 'shell' ? 'pearl' : 'compass'
  }
  return picked
}

function buildSchedule(seed: number, through: number): Array<ItemKind | null> {
  const requested = Math.min(MAX_PLATFORMS - 1, Math.max(0, Math.trunc(through)))
  const schedule = schedules.get(seed) ?? []
  let cursor = schedule.length
  let lastItemIndex = -1
  let previous: ItemKind | null = null
  for (let i = 0; i < schedule.length; i += 1) {
    if (schedule[i]) { lastItemIndex = i; previous = schedule[i] }
  }
  let nextItem = lastItemIndex < 0
    ? 4 + hash(seed, 0) % 4
    : lastItemIndex + 5 + hash(seed, lastItemIndex + 17) % 4

  while (cursor <= requested) {
    if (cursor < 4) {
      schedule[cursor] = null
    } else if (cursor === nextItem) {
      schedule[cursor] = pickKind(seed, schedule.filter(Boolean).length, previous)
      previous = schedule[cursor]
      nextItem += 5 + hash(seed, nextItem + 17) % 4
    } else {
      schedule[cursor] = null
    }
    cursor += 1
  }
  schedules.set(seed, schedule)
  while (schedules.size > MAX_SEEDS) {
    const oldest = schedules.keys().next().value
    if (oldest === undefined) break
    schedules.delete(oldest)
  }
  return schedule
}

/** Return the deterministic item on a platform, or null when it has none. */
export function itemAt(seed: number, index: number): ItemKind | null {
  if (!Number.isFinite(seed) || !Number.isInteger(index) || index < 0 || index >= MAX_PLATFORMS) return null
  const schedule = schedules.get(seed)
  if (schedule && index < schedule.length) return schedule[index]
  return buildSchedule(seed, index)[index] ?? null
}

/** Draw a compact floating item icon. The caller's Canvas state is preserved. */
export function drawItem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: ItemKind,
  timeMs: number,
  reducedMotion: boolean,
): void {
  if (!ITEM_INFO[kind]) return
  ctx.save()
  const bob = reducedMotion ? 0 : Math.sin(timeMs / 500) * 2
  const cy = y + bob
  ctx.lineWidth = 1.8
  ctx.shadowBlur = 8
  ctx.shadowColor = ITEM_INFO[kind].color
  ctx.strokeStyle = ITEM_INFO[kind].color
  ctx.fillStyle = ITEM_INFO[kind].color
  if (kind === 'compass') {
    ctx.beginPath()
    ctx.arc(x, cy, 10, 0, Math.PI * 2)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(x, cy - 7); ctx.lineTo(x + 4, cy + 6); ctx.lineTo(x, cy + 3); ctx.lineTo(x - 4, cy + 6); ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#153c69'; ctx.beginPath(); ctx.arc(x, cy, 2, 0, Math.PI * 2); ctx.fill()
  } else if (kind === 'shell') {
    ctx.beginPath(); ctx.arc(x, cy + 2, 10, Math.PI, 0); ctx.quadraticCurveTo(x + 7, cy + 10, x, cy + 10); ctx.quadraticCurveTo(x - 7, cy + 10, x - 10, cy + 2); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = '#7e3657'
    for (let i = -5; i <= 5; i += 5) { ctx.beginPath(); ctx.moveTo(x, cy + 2); ctx.quadraticCurveTo(x + i, cy - 2, x + i * 1.1, cy - 7); ctx.stroke() }
  } else {
    ctx.beginPath(); ctx.arc(x, cy, 8, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#fff0ad'; ctx.beginPath(); ctx.arc(x, cy, 12, 0, Math.PI * 2); ctx.stroke()
    for (const [dx, dy] of [[0, -14], [12, 0], [-12, 0]]) { ctx.beginPath(); ctx.arc(x + dx, cy + dy, 1.5, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.shadowBlur = 0
  ctx.restore()
}

/** Draw the pearl's short rainbow arc and star points without retaining state. */
export function drawRainbowTrail(ctx: CanvasRenderingContext2D, x: number, y: number, timeMs: number): void {
  ctx.save()
  const drift = Math.sin(timeMs / 650) * 1.5
  const colors = ['#ff6e8a', '#ffb45e', '#ffe36b', '#72e59b', '#63caff', '#ad8cff']
  ctx.lineWidth = 2
  colors.forEach((color, i) => {
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(x, y + drift + i * 1.1, 14 - i * 0.6, Math.PI * 1.08, Math.PI * 1.82)
    ctx.stroke()
  })
  ctx.fillStyle = '#fff5be'
  for (const [dx, dy] of [[-15, 4], [15, -3], [4, -13]]) {
    ctx.beginPath(); ctx.arc(x + dx, y + drift + dy, 1.5, 0, Math.PI * 2); ctx.fill()
  }
  ctx.restore()
}
