/**
 * Draws the calm, top-down water surface used by the game scene.
 * All marks are procedural so the background does not need image or DOM assets.
 */
export const drawOcean = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeMs: number,
  reducedMotion: boolean,
): void => {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (w === 0 || h === 0) return;

  const phase = reducedMotion ? 0 : Math.max(0, timeMs) * 0.00035;
  context.save();

  const water = context.createLinearGradient(0, 0, w, h);
  water.addColorStop(0, '#062a63');
  water.addColorStop(0.45, '#075a88');
  water.addColorStop(1, '#08a7b3');
  context.fillStyle = water;
  context.fillRect(0, 0, w, h);

  // Broad, softly layered wave bands keep the surface legible at a glance.
  context.lineCap = 'round';
  const bands = 7;
  for (let band = 0; band < bands; band += 1) {
    const yBase = h * (0.1 + band * 0.145);
    const amplitude = 7 + (band % 3) * 3;
    context.beginPath();
    for (let x = -48; x <= w + 48; x += 24) {
      const y = yBase
        + Math.sin(x * 0.012 + band * 1.7 + phase * (0.75 + band * 0.05)) * amplitude
        + Math.sin(x * 0.026 - band * 0.8 + phase * 0.4) * 3.5;
      if (x === -48) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = band % 2 === 0 ? 'rgba(113, 232, 228, 0.13)' : 'rgba(1, 24, 76, 0.16)';
    context.lineWidth = 12 + (band % 2) * 6;
    context.shadowColor = band % 2 === 0 ? 'rgba(94, 235, 229, 0.14)' : 'rgba(0, 14, 57, 0.12)';
    context.shadowBlur = 14;
    context.stroke();
  }

  // Small broken highlights suggest reflected sky without becoming a grid.
  context.shadowBlur = 0;
  for (let index = 0; index < 58; index += 1) {
    const x = ((index * 83 + 19) % 997) / 997 * w;
    const y = ((index * 137 + 31) % 991) / 991 * h;
    const drift = reducedMotion ? 0 : Math.sin(phase * 1.8 + index * 0.83) * 6;
    const length = 8 + (index % 5) * 3;
    context.globalAlpha = 0.13 + (index % 4) * 0.025;
    context.strokeStyle = index % 3 === 0 ? '#b9ffff' : '#64e4e3';
    context.lineWidth = 1 + (index % 3) * 0.35;
    context.beginPath();
    context.moveTo(x + drift, y);
    context.lineTo(x + length + drift, y + Math.sin(index * 2.1) * 1.2);
    context.stroke();
  }
  context.restore();
};

/** Draw one bounded, short-lived splash at a water impact point. */
export const drawSplash = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  ageSeconds: number,
  reducedMotion: boolean,
): void => {
  const age = Math.max(0, Math.min(0.9, ageSeconds));
  const progress = age / 0.9;
  const fade = Math.max(0, 1 - progress);
  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';

  // The ripple remains visible even when motion is reduced; only the droplets vanish.
  const ripple = Math.min(1, age / 0.12);
  context.globalAlpha = fade * 0.72;
  context.strokeStyle = '#b9ffff';
  context.shadowColor = '#79f1f2';
  context.shadowBlur = 9;
  context.lineWidth = 2.2 * (1 - progress * 0.45);
  context.beginPath();
  context.ellipse(x, y + 2, 8 + ripple * 38, 3 + ripple * 13, 0, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = fade * 0.32;
  context.lineWidth = 1.1;
  context.beginPath();
  context.ellipse(x, y + 2, 14 + ripple * 54, 5 + ripple * 19, 0, 0, Math.PI * 2);
  context.stroke();

  if (!reducedMotion) {
    const droplets = 14;
    context.globalAlpha = fade;
    context.fillStyle = '#d8ffff';
    context.strokeStyle = '#8ceff4';
    context.shadowBlur = 7;
    for (let index = 0; index < droplets; index += 1) {
      const angle = (index / droplets) * Math.PI * 2 + (index % 2) * 0.12;
      const launch = 12 + (index % 4) * 3;
      const flight = Math.min(1, age / (0.38 + (index % 3) * 0.045));
      const distance = launch + flight * (20 + (index % 5) * 6);
      const lift = (34 + (index % 4) * 7) * Math.sin(Math.PI * flight);
      const px = x + Math.cos(angle) * distance;
      const py = y - lift + Math.sin(angle) * distance * 0.42;
      const radius = Math.max(0.8, (2.5 - progress * 1.4) * (1 - index * 0.018));
      context.beginPath();
      context.arc(px, py, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
};
