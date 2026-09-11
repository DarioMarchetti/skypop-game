import { drawOcean } from './ocean';
import type { SceneKind } from './sceneTypes';

const clampSize = (value: number): number => Math.max(0, Number.isFinite(value) ? value : 0);

const drawCloud = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, alpha: number): void => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(x, y + 8, width * 0.46, 13, 0, 0, Math.PI * 2);
  ctx.ellipse(x - width * 0.25, y + 3, width * 0.2, 12, 0, 0, Math.PI * 2);
  ctx.ellipse(x + width * 0.08, y - 3, width * 0.24, 18, 0, 0, Math.PI * 2);
  ctx.ellipse(x + width * 0.3, y + 5, width * 0.18, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const drawSky = (ctx: CanvasRenderingContext2D, width: number, height: number, timeMs: number, reducedMotion: boolean): void => {
  const phase = reducedMotion ? 0 : Math.max(0, timeMs) * 0.000018;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#2d83d8');
  sky.addColorStop(0.56, '#86d7ef');
  sky.addColorStop(1, '#d4f1e9');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.2;
  const sunlight = ctx.createRadialGradient(width * 0.78, height * 0.2, 0, width * 0.78, height * 0.2, Math.min(width, height) * 0.14);
  sunlight.addColorStop(0, '#ffffff'); sunlight.addColorStop(1, 'rgba(248,255,255,0)');
  ctx.fillStyle = sunlight;
  ctx.beginPath();
  ctx.arc(width * 0.78, height * 0.2, Math.min(width, height) * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Keep the cloud bands high and at the edges so the central play area remains clear.
  const clouds = [
    [width * 0.13, height * 0.16, width * 0.2],
    [width * 0.84, height * 0.3, width * 0.27],
    [width * 0.27, height * 0.42, width * 0.22],
    [width * 0.73, height * 0.56, width * 0.18],
  ];
  for (let index = 0; index < clouds.length; index += 1) {
    const [baseX, y, cloudWidth] = clouds[index];
    const drift = reducedMotion ? 0 : Math.sin(phase + index * 1.7) * width * 0.018;
    drawCloud(ctx, baseX + drift, y, cloudWidth, index === 2 ? 0.24 : 0.34);
  }

  ctx.save();
  ctx.globalAlpha = 0.2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(1, width * 0.002);
  for (let band = 0; band < 3; band += 1) {
    const y = height * (0.68 + band * 0.08);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.quadraticCurveTo(width * 0.18, y - 13, width * 0.36, y);
    ctx.quadraticCurveTo(width * 0.5, y + 10, width * 0.66, y);
    ctx.quadraticCurveTo(width * 0.84, y - 11, width, y + 1);
    ctx.stroke();
  }
  ctx.restore();
};

const drawLava = (ctx: CanvasRenderingContext2D, width: number, height: number, timeMs: number, reducedMotion: boolean): void => {
  const phase = reducedMotion ? 0 : Math.max(0, timeMs) * 0.00006;
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, '#170d24');
  sky.addColorStop(0.48, '#4e1821');
  sky.addColorStop(1, '#130b13');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.17;
  ctx.fillStyle = '#ff5024';
  for (let plume = 0; plume < 5; plume += 1) {
    const x = width * (0.08 + plume * 0.22);
    const y = height * (0.2 + (plume % 2) * 0.08);
    const radius = Math.min(width, height) * (0.1 + (plume % 3) * 0.02);
    const glow = ctx.createRadialGradient(x,y,0,x,y,radius);
    glow.addColorStop(0, '#ff5024'); glow.addColorStop(1, 'rgba(255,80,36,0)'); ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Broad obsidian plates frame the arena; glowing rivers deliberately skirt the center.
  ctx.save();
  ctx.lineJoin = 'round';
  const plates = 12;
  for (let index = 0; index < plates; index += 1) {
    const x = ((index * 149) % 127) / 127 * width;
    const y = height * (0.61 + (index % 4) * 0.115);
    const size = Math.min(width, height) * (0.15 + (index % 3) * 0.035);
    ctx.fillStyle = index % 2 ? '#211827' : '#2b1b25';
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x - size * 0.45, y - size * 0.46);
    ctx.lineTo(x + size * 0.58, y - size * 0.4);
    ctx.lineTo(x + size, y + size * 0.1);
    ctx.lineTo(x + size * 0.38, y + size * 0.57);
    ctx.lineTo(x - size * 0.72, y + size * 0.47);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round';
  for (let river = 0; river < 5; river += 1) {
    const y = height * (0.72 + river * 0.07);
    ctx.beginPath();
    for (let x = -30; x <= width + 30; x += 24) {
      const wobble = Math.sin(x * 0.017 + river * 2.1 + phase) * (8 + river * 2);
      if (x === -30) ctx.moveTo(x, y + wobble);
      else ctx.lineTo(x, y + wobble);
    }
    ctx.strokeStyle = '#f14218';
    ctx.shadowColor = '#ff5b1f';
    ctx.shadowBlur = 15;
    ctx.lineWidth = 8 - river * 0.6;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffb52e';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  ctx.restore();
};

const drawIce = (ctx: CanvasRenderingContext2D, width: number, height: number, timeMs: number, reducedMotion: boolean): void => {
  const glacial = ctx.createLinearGradient(0, 0, width, height);
  glacial.addColorStop(0, '#073f58');
  glacial.addColorStop(0.55, '#116d82');
  glacial.addColorStop(1, '#b5e9e5');
  ctx.fillStyle = glacial;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.32;
  ctx.fillStyle = '#d9ffff';
  for (let ridge = 0; ridge < 7; ridge += 1) {
    const x = width * (0.03 + ridge * 0.17);
    const top = height * (0.18 + (ridge % 3) * 0.05);
    const span = width * (0.2 + (ridge % 2) * 0.06);
    ctx.beginPath();
    ctx.moveTo(x - span * 0.55, height * 0.72);
    ctx.lineTo(x, top);
    ctx.lineTo(x + span * 0.55, height * 0.72);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(180, 255, 255, 0.5)';
  ctx.lineWidth = 1.4;
  for (let crack = 0; crack < 12; crack += 1) {
    const edge = crack % 2 === 0;
    const startX = edge ? width * (0.03 + (crack * 0.17) % 0.34) : width * (0.66 + (crack * 0.13) % 0.3);
    const startY = height * (0.4 + (crack % 5) * 0.1);
    const phase = reducedMotion ? 0 : Math.sin(timeMs * 0.0002 + crack) * 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(startX + width * (edge ? 0.08 : -0.08), startY + height * 0.12 + phase);
    ctx.lineTo(startX + width * (edge ? 0.13 : -0.14), startY + height * 0.2);
    ctx.lineTo(startX + width * (edge ? 0.2 : -0.2), startY + height * 0.24);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(239, 255, 255, 0.65)';
  for (let flake = 0; flake < 32; flake += 1) {
    const x = ((flake * 71 + 18) % 101) / 101 * width;
    const y = ((flake * 113 + 9) % 89) / 89 * height * 0.65;
    const size = 1 + (flake % 3) * 0.55;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
};

const drawVines = (ctx: CanvasRenderingContext2D, width: number, height: number, timeMs: number, reducedMotion: boolean): void => {
  const forest = ctx.createLinearGradient(0, 0, 0, height);
  forest.addColorStop(0, '#092b2c');
  forest.addColorStop(0.5, '#145548');
  forest.addColorStop(1, '#071d22');
  ctx.fillStyle = forest;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  for (let layer = 0; layer < 3; layer += 1) {
    ctx.globalAlpha = 0.28 - layer * 0.05;
    ctx.fillStyle = layer === 0 ? '#4fbf78' : '#0a6e50';
    for (let leaf = 0; leaf < 11; leaf += 1) {
      const x = width * ((leaf * 0.137 + layer * 0.29) % 1);
      const y = height * (0.14 + ((leaf * 0.19 + layer * 0.13) % 0.6));
      const radius = Math.min(width, height) * (0.07 + (leaf % 3) * 0.012);
      ctx.beginPath();
      ctx.ellipse(x, y, radius * 1.8, radius * 0.55, (leaf % 2 ? 1 : -1) * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.lineCap = 'round';
  for (let vine = 0; vine < 8; vine += 1) {
    const x = width * (0.04 + vine * 0.14);
    const sway = reducedMotion ? 0 : Math.sin(timeMs * 0.001 + vine) * 5;
    ctx.strokeStyle = vine % 2 ? '#24785a' : '#67b86a';
    ctx.lineWidth = 3 + (vine % 3);
    ctx.beginPath();
    ctx.moveTo(x, -8);
    ctx.bezierCurveTo(x + sway, height * 0.2, x - 16 - sway, height * 0.35, x + 12, height * (0.45 + (vine % 3) * 0.1));
    ctx.stroke();
    for (let leaf = 0; leaf < 4; leaf += 1) {
      const ly = height * (0.1 + leaf * 0.09);
      const lx = x + Math.sin(leaf + vine) * 12;
      ctx.fillStyle = '#83d476';
      ctx.beginPath();
      ctx.ellipse(lx + (leaf % 2 ? 9 : -9), ly, 11, 5, leaf % 2 ? 0.45 : -0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  const glow = ctx.createRadialGradient(width * 0.5, height * 0.26, 0, width * 0.5, height * 0.26, width * 0.38);
  glow.addColorStop(0, 'rgba(213, 255, 138, 0.16)');
  glow.addColorStop(1, 'rgba(213, 255, 138, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(226, 255, 158, 0.48)';
  for (let mote = 0; mote < 18; mote += 1) {
    const x = width * ((mote * 0.31) % 1);
    const y = height * (0.18 + ((mote * 0.23) % 0.58));
    ctx.beginPath();
    ctx.arc(x, y, 1.2 + (mote % 3) * 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
};

export const drawSceneBackground = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  reducedMotion: boolean,
  scene: SceneKind,
): void => {
  const w = clampSize(width);
  const h = clampSize(height);
  if (w === 0 || h === 0) return;
  ctx.save();
  switch (scene) {
    case 'lava':
      drawLava(ctx, w, h, timeMs, reducedMotion);
      break;
    case 'sky':
      drawSky(ctx, w, h, timeMs, reducedMotion);
      break;
    case 'ice':
      drawIce(ctx, w, h, timeMs, reducedMotion);
      break;
    case 'vines':
      drawVines(ctx, w, h, timeMs, reducedMotion);
      break;
    case 'ocean':
    default:
      drawOcean(ctx, w, h, timeMs, reducedMotion);
      break;
  }
  ctx.restore();
};
