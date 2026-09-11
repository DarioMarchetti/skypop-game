export type FxParticle = {
  x: number;
  z: number;
  angle: number;
  distance: number;
  speed: number;
  lift: number;
  size: number;
  hue: number;
  age: number;
  life: number;
};

export type FxRing = {
  age: number;
  life: number;
  radius: number;
  width: number;
  hue: number;
  x: number;
  z: number;
};

export type FxText = {
  age: number;
  life: number;
  x: number;
  z: number;
  label: string;
  combo: number;
  perfect: boolean;
};

export type FxState = {
  particles: FxParticle[];
  rings: FxRing[];
  texts: FxText[];
  shake: number;
  pulse: number;
};

export const createFxState = (): FxState => ({ particles: [], rings: [], texts: [], shake: 0, pulse: 0 });

const pushLimited = <T>(items: T[], value: T, limit: number): void => {
  items.push(value);
  if (items.length > limit) items.splice(0, items.length - limit);
};

export const spawnLandingFx = (
  state: FxState,
  x: number,
  z: number,
  perfect: boolean,
  combo: number,
  reducedMotion: boolean,
): void => {
  const count = reducedMotion ? 0 : Math.min(48, 18 + combo * 4 + (perfect ? 12 : 0));
  for (let index = 0; index < count; index += 1) {
    const angle = (index / Math.max(1, count)) * Math.PI * 2 + (index % 3) * 0.08;
    pushLimited(state.particles, {
      x,
      z,
      angle,
      distance: 0,
      speed: 135 + (index * 31) % 150 + combo * 14,
      lift: 80 + (index * 19) % 110,
      size: 2 + (index % 4) * 0.85,
      hue: perfect ? [52, 185, 285][index % 3] : 184 + (index % 3) * 18,
      age: 0,
      life: 0.55 + (index % 5) * 0.065,
    }, 96);
  }
  if (!reducedMotion) {
    pushLimited(state.rings, { age: 0, life: perfect ? 0.62 : 0.48, radius: 7, width: perfect ? 5 : 3, hue: perfect ? 52 : 186, x, z }, 8);
    if (perfect) pushLimited(state.rings, { age: 0.08, life: 0.84, radius: 18, width: 2, hue: 188, x, z }, 8);
    state.shake = Math.max(state.shake, Math.min(11, 3.5 + combo * 0.8 + (perfect ? 2 : 0)));
  }
  if (perfect) pushLimited(state.texts, { age: 0, life: 1.05, x, z, label: combo > 1 ? `PERFECT  ×${combo}` : 'PERFECT', combo, perfect: true }, 5);
  else if (combo > 1) pushLimited(state.texts, { age: 0, life: 0.72, x, z, label: `COMBO  ×${combo}`, combo, perfect: false }, 5);
  if (!reducedMotion) state.pulse = Math.min(1, state.pulse + (perfect ? 0.8 : 0.42));
};

export const stepFx = (state: FxState, deltaSeconds: number, reducedMotion: boolean): void => {
  const dt = Math.max(0, Math.min(0.05, deltaSeconds));
  state.particles = state.particles.filter((particle) => {
    particle.age += dt;
    particle.distance += particle.speed * dt;
    return particle.age < particle.life;
  });
  state.rings = state.rings.filter((ring) => {
    ring.age += dt;
    return ring.age < ring.life;
  });
  state.texts = state.texts.filter((entry) => {
    entry.age += dt;
    return entry.age < entry.life;
  });
  state.pulse = Math.max(0, state.pulse - dt * 2.4);
  if (!reducedMotion) state.shake = Math.max(0, state.shake - dt * 30);
  else state.shake = 0;
};

export const drawFx = (
  context: CanvasRenderingContext2D,
  state: FxState,
  projectPoint: (x: number, z: number) => { x: number; y: number },
  scale: number,
  reducedMotion: boolean,
): void => {
  state.rings.forEach((ring) => {
    const point = projectPoint(ring.x, ring.z);
    const progress = ring.age / ring.life;
    context.save();
    context.globalAlpha = (1 - progress) * 0.85;
    context.strokeStyle = `hsl(${ring.hue} 100% 70%)`;
    context.shadowColor = context.strokeStyle;
    context.shadowBlur = 16;
    context.lineWidth = ring.width * (1 - progress * 0.35);
    const expansion = 1 - Math.pow(1 - progress, 3);
    const radius = ring.radius + expansion * (ring.hue === 52 ? 175 : 115);
    if (ring.hue === 52) {
      const glow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, 130 * scale);
      glow.addColorStop(0, `rgba(255,221,60,${0.22 * (1-progress)})`);
      glow.addColorStop(0.4, `rgba(203,55,255,${0.13 * (1-progress)})`);
      glow.addColorStop(1, 'rgba(80,30,170,0)');
      context.fillStyle = glow;
      context.fillRect(point.x-130*scale, point.y-130*scale, 260*scale, 260*scale);
    }
    context.beginPath();
    context.ellipse(point.x, point.y + 7, radius * scale, radius * 0.43 * scale, 0, 0, Math.PI * 2);
    context.stroke();
    if (ring.hue === 52 && progress < 0.72) {
      context.globalAlpha *= 0.62;
      context.lineWidth = 1.2;
      for (let ray = 0; ray < 16; ray += 1) {
        const angle = ray * Math.PI / 8 + progress * 0.3;
        const inner = 24 + expansion * 92;
        const outer = inner + 35 * (1 - progress);
        context.beginPath();
        context.moveTo(point.x + Math.cos(angle) * inner * scale, point.y + 7 + Math.sin(angle) * inner * 0.42 * scale);
        context.lineTo(point.x + Math.cos(angle) * outer * scale, point.y + 7 + Math.sin(angle) * outer * 0.42 * scale);
        context.stroke();
      }
    }
    context.restore();
  });
  state.particles.forEach((particle) => {
    const point = projectPoint(particle.x, particle.z);
    const progress = particle.age / particle.life;
    const distance = particle.distance * scale;
    const px = point.x + Math.cos(particle.angle) * distance;
    const py = point.y + 5 - Math.sin(particle.angle) * distance * 0.42 - particle.lift * scale * progress * (1 - progress);
    context.save();
    context.globalAlpha = 1 - progress;
    context.fillStyle = `hsl(${particle.hue} 100% 70%)`;
    context.shadowColor = context.fillStyle;
    context.shadowBlur = 9;
    context.strokeStyle = context.fillStyle;
    context.lineWidth = Math.max(1, particle.size * 0.4);
    const tail = Math.min(distance, particle.speed * scale * 0.045);
    context.beginPath();
    context.moveTo(px, py);
    context.lineTo(px - Math.cos(particle.angle)*tail, py + Math.sin(particle.angle)*tail*0.42);
    context.stroke();
    context.beginPath();
    context.arc(px, py, particle.size * (1 - progress * 0.45), 0, Math.PI * 2);
    context.fill();
    context.restore();
  });
  state.texts.forEach((entry) => {
    const point = projectPoint(entry.x, entry.z);
    const progress = entry.age / entry.life;
    context.save();
    context.globalAlpha = Math.min(1, (1 - progress) * 2.5);
    context.translate(point.x, point.y - 52 - progress * 28);
    context.textAlign = 'center';
    context.font = `900 ${Math.round((entry.perfect ? 25 : 18) * Math.max(0.8, scale) * (1 + Math.min(entry.combo, 5) * 0.045))}px system-ui, sans-serif`;
    context.fillStyle = entry.perfect ? '#fff16a' : '#83eaff';
    context.shadowColor = context.fillStyle;
    context.shadowBlur = entry.perfect ? 18 : 10;
    context.fillText(entry.label, 0, 0);
    context.restore();
  });
};
