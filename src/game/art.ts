import type { FruitKind } from './math';

/*
 * Procedural fruit art. Every fruit is drawn centred on (0, 0) for a body radius r. `drawSkin` is the whole fruit,
 * `drawFlesh` is the cut face as a full disc (the arena clips it to a half). Sprites are cached per size so the
 * arena only blits images each frame.
 */

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const OUTLINE = 'rgba(24, 6, 30, 0.6)';

/** Small seeded PRNG so textures (dimples, seeds, hairs) are identical every time they're drawn. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sphere(ctx: Ctx, r: number, light: string, mid: string, dark: string) {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.08, 0, 0, r * 1.08);
  g.addColorStop(0, light);
  g.addColorStop(0.5, mid);
  g.addColorStop(1, dark);
  return g;
}

function shine(ctx: Ctx, r: number, alpha = 0.6) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(-r * 0.38, -r * 0.42, r * 0.24, r * 0.13, -0.7, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = alpha * 0.6;
  ctx.beginPath();
  ctx.arc(-r * 0.12, -r * 0.62, r * 0.06, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function outline(ctx: Ctx, r: number) {
  ctx.lineWidth = Math.max(1.5, r * 0.055);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function dots(ctx: Ctx, r: number, n: number, color: string, seed: number, size = 0.025, rx = 1, ry = 1) {
  const rand = rng(seed);
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const a = rand() * TAU;
    const d = Math.sqrt(rand()) * 0.9;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d * r * rx, Math.sin(a) * d * r * ry, r * size * (0.6 + rand() * 0.8), 0, TAU);
    ctx.fill();
  }
}

function leaf(ctx: Ctx, x: number, y: number, len: number, angle: number, color = '#4caf32') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.42, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.42, 0, 0);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = Math.max(1, len * 0.06);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(len * 0.1, 0);
  ctx.lineTo(len * 0.85, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  ctx.restore();
}

/** Citrus cross-section: rind, pith, wedge segments. */
function citrusFace(ctx: Ctx, r: number, rind: string, pith: string, pulp: string, pulpDark: string, segments: number) {
  ctx.fillStyle = rind;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = pith;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.82);
  g.addColorStop(0, pulp);
  g.addColorStop(1, pulpDark);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * TAU + 0.05;
    const a1 = ((i + 1) / segments) * TAU - 0.05;
    ctx.beginPath();
    ctx.moveTo(Math.cos((a0 + a1) / 2) * r * 0.08, Math.sin((a0 + a1) / 2) * r * 0.08);
    ctx.arc(0, 0, r * 0.8, a0, a1);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
  }
  // juice vesicles
  const rand = rng(segments * 31);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, r * 0.025);
  for (let i = 0; i < segments * 3; i++) {
    const a = rand() * TAU;
    const d = 0.25 + rand() * 0.45;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * d, Math.sin(a) * r * d);
    ctx.lineTo(Math.cos(a) * r * (d + 0.12), Math.sin(a) * r * (d + 0.12));
    ctx.stroke();
  }
  ctx.fillStyle = pith;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.08, 0, TAU);
  ctx.fill();
}

// ── Skins ─────────────────────────────────────────────────────────────────

function cherry(ctx: Ctx, r: number) {
  // stem + leaf behind the body
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#4a2c12';
  ctx.lineWidth = r * 0.13;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.7);
  ctx.quadraticCurveTo(r * 0.05, -r * 1.35, r * 0.42, -r * 1.62);
  ctx.stroke();
  leaf(ctx, r * 0.38, -r * 1.58, r * 0.75, -0.25);
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.62);
  ctx.bezierCurveTo(r * 0.55, -r * 1.12, r * 1.18, -r * 0.42, r * 0.92, r * 0.32);
  ctx.bezierCurveTo(r * 0.7, r * 0.98, -r * 0.7, r * 0.98, -r * 0.92, r * 0.32);
  ctx.bezierCurveTo(-r * 1.18, -r * 0.42, -r * 0.55, -r * 1.12, 0, -r * 0.62);
  ctx.closePath();
  ctx.fillStyle = sphere(ctx, r, '#ff7a90', '#d6082f', '#5c0016');
  ctx.fill();
  outline(ctx, r);
  shine(ctx, r, 0.7);
}

function lemon(ctx: Ctx, r: number) {
  ctx.save();
  ctx.rotate(-0.4);
  const rx = r * 1.1;
  const ry = r * 0.84;
  ctx.beginPath();
  ctx.moveTo(-rx - r * 0.2, 0);
  ctx.quadraticCurveTo(-rx - r * 0.05, -r * 0.16, -rx + r * 0.1, -r * 0.3);
  ctx.ellipse(0, 0, rx, ry, 0, Math.PI + 0.38, -0.38);
  ctx.quadraticCurveTo(rx + r * 0.05, -r * 0.16, rx + r * 0.2, 0);
  ctx.quadraticCurveTo(rx + r * 0.05, r * 0.16, rx - r * 0.1, r * 0.3);
  ctx.ellipse(0, 0, rx, ry, 0, 0.38, Math.PI - 0.38);
  ctx.quadraticCurveTo(-rx - r * 0.05, r * 0.16, -rx - r * 0.2, 0);
  ctx.closePath();
  ctx.fillStyle = sphere(ctx, r, '#fff8b0', '#ffd60a', '#a87b00');
  ctx.fill();
  ctx.save();
  ctx.clip();
  dots(ctx, r, 70, 'rgba(160, 110, 0, 0.22)', 7, 0.025, 1.05, 0.8);
  ctx.restore();
  outline(ctx, r);
  ctx.restore();
  shine(ctx, r, 0.55);
}

function orange(ctx: Ctx, r: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = sphere(ctx, r, '#ffd08a', '#ff8a00', '#9a3f00');
  ctx.fill();
  ctx.save();
  ctx.clip();
  dots(ctx, r, 90, 'rgba(150, 60, 0, 0.2)', 11, 0.022);
  ctx.restore();
  outline(ctx, r);
  shine(ctx, r, 0.5);
  // calyx
  ctx.save();
  ctx.translate(r * 0.12, -r * 0.9);
  ctx.fillStyle = '#3f8f2c';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU - Math.PI / 2;
    const d = i % 2 === 0 ? r * 0.17 : r * 0.07;
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d * 0.6);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  leaf(ctx, r * 0.14, -r * 0.92, r * 0.55, -0.6);
}

function coconut(ctx: Ctx, r: number) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = sphere(ctx, r, '#b07a45', '#6b3f1d', '#26130a');
  ctx.fill();
  ctx.save();
  ctx.clip();
  const rand = rng(23);
  ctx.lineCap = 'round';
  for (let i = 0; i < 160; i++) {
    const a = rand() * TAU;
    const d = Math.sqrt(rand()) * r;
    const x = Math.cos(a) * d;
    const y = Math.sin(a) * d;
    const ang = a + Math.PI / 2 + (rand() - 0.5) * 0.9;
    const len = r * (0.1 + rand() * 0.16);
    ctx.strokeStyle = rand() < 0.5 ? 'rgba(30, 14, 4, 0.45)' : 'rgba(205, 155, 100, 0.3)';
    ctx.lineWidth = Math.max(1, r * 0.022);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    ctx.stroke();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  outline(ctx, r);
  ctx.fillStyle = '#1a0c04';
  for (const [x, y] of [
    [-0.2, -0.36],
    [0.2, -0.36],
    [0, -0.12],
  ]) {
    ctx.beginPath();
    ctx.ellipse(x * r, y * r, r * 0.1, r * 0.12, 0, 0, TAU);
    ctx.fill();
  }
  shine(ctx, r, 0.25);
}

function watermelon(ctx: Ctx, r: number) {
  ctx.save();
  ctx.rotate(0.35);
  const rx = r * 1.12;
  const ry = r * 0.9;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fillStyle = sphere(ctx, r, '#9be36a', '#2f9a3a', '#0a3a14');
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(8, 60, 22, 0.75)';
  for (let i = -3; i <= 3; i++) {
    const cx = (i / 3.4) * rx;
    ctx.beginPath();
    const w = r * 0.11;
    for (let k = 0; k <= 20; k++) {
      const y = -ry + (k / 20) * ry * 2;
      const x = cx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)) + Math.sin(k * 1.3 + i) * r * 0.05;
      if (k === 0) ctx.moveTo(x - w, y);
      else ctx.lineTo(x - w, y);
    }
    for (let k = 20; k >= 0; k--) {
      const y = -ry + (k / 20) * ry * 2;
      const x = cx * Math.sqrt(Math.max(0, 1 - (y / ry) ** 2)) + Math.sin(k * 1.3 + i + 0.6) * r * 0.05;
      ctx.lineTo(x + w, y);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  outline(ctx, r);
  ctx.restore();
  shine(ctx, r, 0.45);
}

function dragonfruit(ctx: Ctx, r: number) {
  const rx = r * 0.9;
  const ry = r;
  // bracts (scales) around the body, behind it
  const scales = (alpha: number, front: boolean) => {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + (front ? 0.3 : 0);
      const bx = Math.cos(a) * rx * (front ? 0.55 : 0.92);
      const by = Math.sin(a) * ry * (front ? 0.55 : 0.92);
      const out = a - 0.5;
      const len = r * (front ? 0.38 : 0.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(bx, by);
      ctx.rotate(out);
      ctx.beginPath();
      ctx.moveTo(-len * 0.3, 0);
      ctx.quadraticCurveTo(len * 0.35, -len * 0.38, len, -len * 0.05);
      ctx.quadraticCurveTo(len * 0.3, len * 0.1, -len * 0.3, 0);
      const g = ctx.createLinearGradient(-len * 0.3, 0, len, 0);
      g.addColorStop(0, '#e6007a');
      g.addColorStop(0.55, '#ff5aa8');
      g.addColorStop(1, '#8ee04f');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      ctx.restore();
    }
  };
  scales(1, false);
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fillStyle = sphere(ctx, r, '#ff8cc6', '#e6007a', '#6a0038');
  ctx.fill();
  outline(ctx, r);
  scales(0.95, true);
  shine(ctx, r, 0.45);
}

// ── Cut faces ─────────────────────────────────────────────────────────────

function fleshCherry(ctx: Ctx, r: number) {
  ctx.fillStyle = '#7a0020';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.92);
  g.addColorStop(0, '#ff6f8c');
  g.addColorStop(1, '#c0123c');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f3dcb5';
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.3, r * 0.36, 0, 0, TAU);
  ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.04);
  ctx.strokeStyle = '#b48a5a';
  ctx.stroke();
}

function fleshCoconut(ctx: Ctx, r: number) {
  ctx.fillStyle = '#4a2a10';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fbf8ef';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.88, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.62);
  g.addColorStop(0, '#f2fbff');
  g.addColorStop(1, '#cfe6ee');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, TAU);
  ctx.fill();
}

function fleshWatermelon(ctx: Ctx, r: number) {
  ctx.fillStyle = '#1f7a2e';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#dcf7c8';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, TAU);
  ctx.fill();
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.86);
  g.addColorStop(0, '#ff7486');
  g.addColorStop(1, '#f2223f');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + (i % 2) * 0.2;
    const d = r * (i % 2 ? 0.42 : 0.6);
    ctx.save();
    ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = '#1b1012';
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.045, r * 0.085, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
}

function fleshDragon(ctx: Ctx, r: number) {
  ctx.fillStyle = '#e6007a';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fdf9ff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, TAU);
  ctx.fill();
  dots(ctx, r, 70, '#16101a', 41, 0.028, 0.95, 0.95);
}

const SKIN: Record<FruitKind, (ctx: Ctx, r: number) => void> = {
  cherry,
  lemon,
  orange,
  coconut,
  watermelon,
  dragonfruit,
};

const FLESH: Record<FruitKind, (ctx: Ctx, r: number) => void> = {
  cherry: fleshCherry,
  lemon: (ctx, r) => citrusFace(ctx, r, '#ffd60a', '#fffbe2', '#fff59a', '#ffe14d', 8),
  orange: (ctx, r) => citrusFace(ctx, r, '#ff8a00', '#fff0d9', '#ffc061', '#ff9419', 10),
  coconut: fleshCoconut,
  watermelon: fleshWatermelon,
  dragonfruit: fleshDragon,
};

export const drawSkin = (ctx: Ctx, kind: FruitKind, r: number) => SKIN[kind](ctx, r);
export const drawFlesh = (ctx: Ctx, kind: FruitKind, r: number) => FLESH[kind](ctx, r);

/** The bomb hiding in a fruit. `t` drives the fuse spark. */
export function drawBomb(ctx: Ctx, r: number, t: number) {
  // danger glow
  const pulse = 0.5 + 0.5 * Math.sin(t * 40);
  const glow = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.9);
  glow.addColorStop(0, `rgba(255, 40, 60, ${0.35 + pulse * 0.25})`);
  glow.addColorStop(1, 'rgba(255, 40, 60, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.9, 0, TAU);
  ctx.fill();
  // fuse
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#c9a36a';
  ctx.lineWidth = r * 0.1;
  ctx.beginPath();
  ctx.moveTo(r * 0.38, -r * 0.82);
  ctx.quadraticCurveTo(r * 0.7, -r * 1.25, r * 0.98, -r * 1.12);
  ctx.stroke();
  // cap
  ctx.fillStyle = '#6f6f80';
  ctx.save();
  ctx.translate(r * 0.33, -r * 0.76);
  ctx.rotate(0.6);
  ctx.fillRect(-r * 0.2, -r * 0.14, r * 0.4, r * 0.26);
  ctx.restore();
  // body
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, TAU);
  ctx.fillStyle = sphere(ctx, r, '#5a5a6e', '#1d1d28', '#050508');
  ctx.fill();
  outline(ctx, r);
  shine(ctx, r * 0.9, 0.45);
  // spark
  ctx.save();
  ctx.translate(r * 0.98, -r * 1.12);
  const rand = rng(Math.floor(t * 30));
  for (let i = 0; i < 9; i++) {
    const a = rand() * TAU;
    const len = r * (0.18 + rand() * 0.3);
    ctx.strokeStyle = i % 2 ? '#fff3a0' : '#ff9d2e';
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.09, 0, TAU);
  ctx.fill();
  ctx.restore();
}

// ── Sprite cache ──────────────────────────────────────────────────────────

/** Sprites are square: the fruit sits in the middle with room for stems, leaves and scales. */
export const SPRITE_PAD = 1.9;

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Half the sprite's size in CSS px. */
  half: number;
}

function makeSprite(r: number, dpr: number, draw: (ctx: Ctx) => void): Sprite {
  const half = r * SPRITE_PAD;
  const px = Math.max(2, Math.ceil(half * 2 * dpr));
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(px / (half * 2), px / (half * 2));
  ctx.translate(half, half);
  draw(ctx);
  return { canvas, half };
}

export class SpriteCache {
  private skins = new Map<string, Sprite>();
  private flesh = new Map<string, Sprite>();

  constructor(private dpr: number) {}

  skin(kind: FruitKind, r: number): Sprite {
    const key = `${kind}:${Math.round(r * 2)}`;
    let s = this.skins.get(key);
    if (!s) this.skins.set(key, (s = makeSprite(r, this.dpr, (ctx) => drawSkin(ctx, kind, r))));
    return s;
  }

  face(kind: FruitKind, r: number): Sprite {
    const key = `${kind}:${Math.round(r * 2)}`;
    let s = this.flesh.get(key);
    if (!s) this.flesh.set(key, (s = makeSprite(r, this.dpr, (ctx) => drawFlesh(ctx, kind, r))));
    return s;
  }
}

const iconCache = new Map<string, string>();

/** Icon framing: how far each fruit reaches beyond its body radius, and a nudge to centre it (cherry's stem). */
const ICON_FRAME: Record<FruitKind, { pad: number; dy: number }> = {
  cherry: { pad: 1.32, dy: 0.4 },
  lemon: { pad: 1.32, dy: 0 },
  orange: { pad: 1.28, dy: 0.14 },
  coconut: { pad: 1.08, dy: 0 },
  watermelon: { pad: 1.18, dy: 0 },
  dragonfruit: { pad: 1.42, dy: 0 },
};

/** A PNG data URL of the whole fruit, `size` CSS px square, for the DOM (paytable, history). */
export function fruitIconUrl(kind: FruitKind, size: number): string {
  const key = `${kind}:${size}`;
  let url = iconCache.get(key);
  if (!url) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const { pad, dy } = ICON_FRAME[kind];
    const r = size / (2 * pad);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.ceil(size * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.translate(size / 2, size / 2 + dy * r);
    drawSkin(ctx, kind, r);
    url = canvas.toDataURL();
    iconCache.set(key, url);
  }
  return url;
}
