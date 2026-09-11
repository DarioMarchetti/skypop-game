import { drawSplash } from './ocean';
import type { SceneKind } from './sceneTypes';

const DURATION = 0.9;

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** Draws the brief impact effect for a scene change or failed landing. */
export const drawSceneFall = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ageSeconds: number,
  reducedMotion: boolean,
  scene: SceneKind,
): void => {
  const progress = clamp01(Math.max(0, ageSeconds) / DURATION);
  const fade = 1 - progress;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = fade;

  switch (scene) {
    case 'ocean':
      drawSplash(ctx, x, y, ageSeconds, reducedMotion);
      break;
    case 'lava':
      drawLavaFall(ctx, x, y, progress, reducedMotion);
      break;
    case 'sky':
      drawSkyFall(ctx, x, y, progress, reducedMotion);
      break;
    case 'ice':
      drawIceFall(ctx, x, y, progress, reducedMotion);
      break;
    case 'vines':
      drawVinesFall(ctx, x, y, progress, reducedMotion);
      break;
    default:
      break;
  }

  ctx.restore();
};

const drawLavaFall = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  reducedMotion: boolean,
): void => {
  const motion = reducedMotion ? 0.28 : 1;
  const spread = 12 + progress * 14 * motion;

  // A compact hot core anchors the effect while the sparks disperse around it.
  ctx.globalAlpha *= 0.45 * (1 - progress * 0.35);
  ctx.fillStyle = '#ff7a1a';
  ctx.shadowColor = '#ff4b16';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(x, y, 8 + (1 - progress) * 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.globalAlpha *= 1.6;
  for (let index = 0; index < 13; index += 1) {
    const angle = -Math.PI * 0.96 + (index / 12) * Math.PI * 1.92;
    const flight = clamp01(progress / (0.28 + (index % 4) * 0.055));
    const distance = 9 + (index % 5) * 5 + flight * spread * (0.7 + (index % 3) * 0.2);
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance - Math.sin(Math.PI * flight) * (18 + (index % 4) * 5) * motion;
    const radius = Math.max(0.8, 2.7 - progress * 1.7 - (index % 3) * 0.3);
    ctx.fillStyle = index % 3 === 0 ? '#ffd45b' : '#ff6920';
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Smoke hangs above the impact and drifts only slightly in reduced motion.
  ctx.globalAlpha *= 0.52;
  for (let index = 0; index < 5; index += 1) {
    const drift = Math.sin(index * 2.4) * (4 + progress * 7 * motion);
    const smokeY = y - 13 - index * 9 - progress * (9 + index * 3) * motion;
    ctx.fillStyle = index % 2 === 0 ? '#3d2d32' : '#594044';
    ctx.beginPath();
    ctx.arc(x + drift, smokeY, 5 + index * 1.8 + progress * 3, 0, Math.PI * 2);
    ctx.fill();
  }
};

const drawSkyFall = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  reducedMotion: boolean,
): void => {
  const motion = reducedMotion ? 0.2 : 1;
  ctx.globalAlpha *= 0.4;
  ctx.fillStyle = '#d8f4ff';
  ctx.shadowColor = '#b9e9ff';
  ctx.shadowBlur = 18;
  for (let index = 0; index < 7; index += 1) {
    const cloudX = x + (index - 3) * 10 + Math.sin(index * 1.7) * progress * 10 * motion;
    const cloudY = y - 4 + Math.cos(index * 1.3) * 5 + progress * (8 + index) * motion;
    ctx.beginPath();
    ctx.arc(cloudX, cloudY, 7 + (index % 3) * 3 + progress * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  // Wind lines are short and angled; they deliberately never form water-like rings.
  ctx.globalAlpha *= 1.7;
  ctx.strokeStyle = '#e9fbff';
  for (let index = 0; index < 6; index += 1) {
    const offset = (index - 2.5) * 8;
    const lineY = y + offset + progress * 18 * motion;
    const lineX = x - 34 + (index % 2) * 8;
    const length = 17 + (index % 3) * 7;
    ctx.lineWidth = 1.2 + (index % 2) * 0.6;
    ctx.beginPath();
    ctx.moveTo(lineX, lineY);
    ctx.lineTo(lineX + length, lineY - 5 - (index % 2) * 3);
    ctx.stroke();
  }
};

const drawIceFall = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  reducedMotion: boolean,
): void => {
  const motion = reducedMotion ? 0.18 : 1;
  const radius = 8 + progress * 37 * motion;
  ctx.globalAlpha *= 0.86;
  ctx.strokeStyle = '#d8fbff';
  ctx.shadowColor = '#8defff';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 1.5;
  for (let ray = 0; ray < 10; ray += 1) {
    const angle = (ray / 10) * Math.PI * 2 + 0.08;
    const length = radius * (0.7 + (ray % 3) * 0.13);
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(angle) * 3, y + Math.sin(angle) * 3);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
    if (ray % 2 === 0) {
      const branch = length * 0.58;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle) * branch, y + Math.sin(angle) * branch);
      ctx.lineTo(x + Math.cos(angle + 0.45) * (branch + 8), y + Math.sin(angle + 0.45) * (branch + 8));
      ctx.stroke();
    }
  }
  ctx.shadowBlur = 0;

  ctx.globalAlpha *= 0.78;
  for (let index = 0; index < 6; index += 1) {
    const angle = index * 1.07;
    const distance = 15 + progress * (24 + index * 4) * motion;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance + progress * 20 * motion;
    ctx.fillStyle = index % 2 === 0 ? '#efffff' : '#91deef';
    ctx.beginPath();
    ctx.moveTo(px, py - 5);
    ctx.lineTo(px + 5, py + 2);
    ctx.lineTo(px - 2, py + 5);
    ctx.closePath();
    ctx.fill();
  }
};

const drawVinesFall = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  progress: number,
  reducedMotion: boolean,
): void => {
  const motion = reducedMotion ? 0.2 : 1;
  ctx.strokeStyle = '#b2e878';
  ctx.lineWidth = 3;
  ctx.globalAlpha *= 0.9;
  for (let index = 0; index < 4; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const startX = x + side * (5 + index * 2);
    const startY = y - 3;
    const recoil = Math.sin(progress * Math.PI) * (16 + index * 4) * motion;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.quadraticCurveTo(
      startX + side * (13 + recoil),
      startY - 9 - index * 3,
      startX + side * (24 + recoil * 0.65),
      startY + 7 + progress * 14 * motion,
    );
    ctx.stroke();
  }

  ctx.globalAlpha *= 1.15;
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2 + 0.2;
    const distance = 8 + progress * (18 + (index % 4) * 5) * motion;
    const leafX = x + Math.cos(angle) * distance;
    const leafY = y + Math.sin(angle) * distance + progress * 14 * motion;
    ctx.fillStyle = index % 3 === 0 ? '#d1f28a' : '#71bf68';
    ctx.save();
    ctx.translate(leafX, leafY);
    ctx.rotate(angle + Math.PI / 4);
    ctx.beginPath();
    ctx.ellipse(0, 0, 3 + (index % 2), 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
};
