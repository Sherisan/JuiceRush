import { SpriteCache, drawBomb } from './art';
import { FRUITS, FRUIT_ORDER, boostOf, type FruitKind } from './math';
import { sound } from './sound';
import type { SliceOutcome } from './useGame';

/*
 * The canvas side of the game: tosses fruit, tracks the blade, detects slices and animates what the server
 * decided. It never decides outcomes itself. A slice calls `onSlice(kind)`, the fruit hangs frozen with a cut
 * across it until the answer comes back, then splits into juice or reveals the bomb.
 */

export type ArenaMode = 'idle' | 'live' | 'ended';

const TAU = Math.PI * 2;
const BASE_RADIUS: Record<FruitKind, number> = {
  cherry: 30,
  lemon: 36,
  orange: 38,
  coconut: 40,
  watermelon: 52,
  dragonfruit: 42,
};
const TRAIL_MS = 130;
const WAVE_GAP = 0.45;

interface Fruit {
  id: number;
  kind: FruitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  r: number;
  state: 'fly' | 'pending';
  cutAngle: number;
  pendingT: number;
  born: number;
}

interface Half {
  kind: FruitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  skinRot: number;
  r: number;
  side: 1 | -1;
  charred: boolean;
}

interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  life: number;
  max: number;
  glow?: boolean;
  gravity?: number;
}

interface Splat {
  x: number;
  y: number;
  color: string;
  blobs: { dx: number; dy: number; r: number }[];
  life: number;
}

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  max: number;
}

interface Bomb {
  x: number;
  y: number;
  r: number;
  t: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  grow: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

interface Smoke {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
}

interface Spawn {
  at: number;
  kind: FruitKind;
  slot: number;
  slots: number;
}

export interface ArenaHooks {
  onSlice: (kind: FruitKind) => Promise<SliceOutcome>;
  onExplode: () => void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function weightedFruit(): FruitKind {
  const total = FRUIT_ORDER.reduce((n, k) => n + FRUITS[k].weight, 0);
  let roll = Math.random() * total;
  for (const k of FRUIT_ORDER) {
    roll -= FRUITS[k].weight;
    if (roll < 0) return k;
  }
  return 'cherry';
}

export const formatBoost = (kind: FruitKind) => `×${+boostOf(kind).toFixed(2)}`;

export class Arena {
  private ctx: CanvasRenderingContext2D;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private u = 1;
  private sprites = new SpriteCache(1);
  private raf = 0;
  private last = 0;
  private now = 0;
  private nextId = 1;

  private mode: ArenaMode = 'idle';
  private sliceEnabled = false;
  private fruits: Fruit[] = [];
  private spawns: Spawn[] = [];
  private nextWaveAt = 0;
  private halves: Half[] = [];
  private drops: Drop[] = [];
  private splats: Splat[] = [];
  private floaters: Floater[] = [];
  private bombs: Bomb[] = [];
  private rings: Ring[] = [];
  private smoke: Smoke[] = [];
  private flash = 0;
  private shake = 0;
  private streak = 0;
  private showcase = 0;

  private down = false;
  private trail: { x: number; y: number; t: number }[] = [];
  private lastSwipeSound = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private shaker: HTMLElement,
    private hooks: ArenaHooks,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  start() {
    const loop = (t: number) => {
      const dt = Math.min(0.05, this.last ? (t - this.last) / 1000 : 0);
      this.last = t;
      this.now += dt;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.shaker.style.transform = '';
  }

  resize(w: number, h: number, dpr: number) {
    if (w === this.W && h === this.H && dpr === this.dpr) return;
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.sprites = new SpriteCache(dpr);
    this.dpr = dpr;
    this.u = Math.max(0.6, Math.min(1.35, Math.min(w / 760, h / 560)));
    for (const f of this.fruits) f.r = BASE_RADIUS[f.kind] * this.u;
  }

  setHooks(hooks: ArenaHooks) {
    this.hooks = hooks;
  }

  setSliceEnabled(on: boolean) {
    this.sliceEnabled = on;
  }

  setMode(mode: ArenaMode) {
    if (mode === this.mode) return;
    const was = this.mode;
    this.mode = mode;
    if (mode === 'live') {
      // Fresh round: clear leftovers of the last one and toss straight away.
      this.fruits = [];
      this.spawns = [];
      this.bombs = [];
      this.streak = 0;
      this.nextWaveAt = this.now + 0.35;
    } else {
      this.spawns = [];
      if (was === 'live' && mode === 'ended') {
        // Whatever is still flying drops away; it can't be sliced any more.
        for (const f of this.fruits) if (f.state === 'fly') f.vy = Math.max(f.vy, 0);
      }
    }
  }

  /** Win confetti: a fountain of juice drops from the bottom of the arena. */
  celebrate(colors: string[]) {
    const g = this.gravity();
    for (let i = 0; i < 120; i++) {
      // Aim each drop to peak somewhere in the upper half, spread across the width.
      const peak = this.H * rand(0.08, 0.5);
      const vy = -Math.sqrt(2 * g * (this.H * 1.02 - peak));
      this.drops.push({
        x: this.W / 2 + rand(-30, 30) * this.u,
        y: this.H * 1.02,
        vx: rand(-0.55, 0.55) * this.W * (g / -vy) * 0.5,
        vy,
        r: rand(3, 7) * this.u,
        color: colors[i % colors.length],
        life: rand(1.6, 2.4),
        max: 2.4,
      });
    }
  }

  // ── Input ───────────────────────────────────────────────────────────────

  pointerDown(x: number, y: number) {
    this.down = true;
    this.trail = [{ x, y, t: performance.now() }];
    // A tap straight on a fruit slices it too.
    const hit = this.fruits.find((f) => f.state === 'fly' && Math.hypot(f.x - x, f.y - y) < f.r * 0.95);
    if (hit) this.slice(hit, rand(-0.6, 0.6));
  }

  pointerMove(x: number, y: number) {
    if (!this.down) return;
    const t = performance.now();
    const prev = this.trail[this.trail.length - 1];
    this.trail.push({ x, y, t });
    if (!prev) return;
    const dx = x - prev.x;
    const dy = y - prev.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1) return;
    const speed = Math.sqrt(len2) / Math.max(1, t - prev.t);
    if (speed > 1.2 && t - this.lastSwipeSound > 260) {
      this.lastSwipeSound = t;
      sound.swipe();
    }
    // Fruits this segment passes through, in the order the blade reaches them.
    const hits: { f: Fruit; along: number }[] = [];
    for (const f of this.fruits) {
      if (f.state !== 'fly') continue;
      const along = Math.max(0, Math.min(1, ((f.x - prev.x) * dx + (f.y - prev.y) * dy) / len2));
      const cx = prev.x + dx * along;
      const cy = prev.y + dy * along;
      if (Math.hypot(f.x - cx, f.y - cy) < f.r * 0.92) hits.push({ f, along });
    }
    hits.sort((a, b) => a.along - b.along);
    const angle = Math.atan2(dy, dx);
    for (const h of hits) this.slice(h.f, angle);
  }

  pointerUp() {
    this.down = false;
  }

  /** Keyboard play: slice the highest fruit of this kind in the air. Returns false if there is none. */
  sliceKind(kind: FruitKind): boolean {
    const f = this.fruits
      .filter((x) => x.kind === kind && x.state === 'fly' && x.y < this.H - x.r * 0.5)
      .sort((a, b) => a.y - b.y)[0];
    if (!f) return false;
    this.trail = [
      { x: f.x - f.r * 1.6, y: f.y - f.r * 0.5, t: performance.now() - 40 },
      { x: f.x + f.r * 1.6, y: f.y + f.r * 0.5, t: performance.now() },
    ];
    this.slice(f, Math.atan2(f.r, f.r * 3.2));
    return true;
  }

  // ── Slicing ─────────────────────────────────────────────────────────────

  private slice(f: Fruit, angle: number) {
    if (!this.sliceEnabled || this.mode !== 'live' || f.state !== 'fly') return;
    f.state = 'pending';
    f.cutAngle = angle;
    f.pendingT = 0;
    sound.chop();
    const vx = f.vx;
    this.hooks.onSlice(f.kind).then((outcome) => {
      // Gone, or already blasted away by an explosion that landed first.
      if (!this.fruits.includes(f) || f.state !== 'pending') return;
      if (outcome === 'safe') this.splitSafe(f);
      else if (outcome === 'bomb') this.revealBomb(f);
      else {
        // Didn't count (round already over, or the request failed): let it drop.
        f.state = 'fly';
        f.vx = vx * 0.3;
        f.vy = 0;
      }
    });
  }

  private removeFruit(f: Fruit) {
    this.fruits = this.fruits.filter((x) => x !== f);
  }

  private spawnHalves(f: Fruit, charred: boolean) {
    const nx = -Math.sin(f.cutAngle);
    const ny = Math.cos(f.cutAngle);
    const push = 150 * this.u;
    for (const side of [-1, 1] as const) {
      this.halves.push({
        kind: f.kind,
        x: f.x + nx * side * 2,
        y: f.y + ny * side * 2,
        vx: nx * side * push + rand(-30, 30),
        vy: ny * side * push - 120 * this.u,
        rot: f.cutAngle,
        vrot: side * rand(1.4, 3.2),
        skinRot: f.rot - f.cutAngle,
        r: f.r,
        side,
        charred,
      });
    }
  }

  private juice(x: number, y: number, color: string, angle: number, n: number, r: number) {
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() < 0.5 ? 0 : Math.PI) + rand(-0.9, 0.9);
      const sp = rand(90, 420) * this.u;
      this.drops.push({
        x: x + rand(-r, r) * 0.3,
        y: y + rand(-r, r) * 0.3,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 120 * this.u,
        r: rand(2, 5.5) * this.u,
        color,
        life: rand(0.45, 0.9),
        max: 0.9,
      });
    }
  }

  private splat(x: number, y: number, color: string, r: number) {
    const blobs = [{ dx: 0, dy: 0, r: r * rand(0.55, 0.75) }];
    for (let i = 0; i < 9; i++) {
      const a = rand(0, TAU);
      const d = r * rand(0.45, 1.25);
      blobs.push({ dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: r * rand(0.06, 0.24) });
    }
    this.splats.push({ x, y, color, blobs, life: 9 });
    if (this.splats.length > 40) this.splats.shift();
  }

  private splitSafe(f: Fruit) {
    this.removeFruit(f);
    const color = FRUITS[f.kind].juice;
    this.spawnHalves(f, false);
    this.juice(f.x, f.y, color, f.cutAngle, 18, f.r);
    this.splat(f.x, f.y, color, f.r);
    this.rings.push({ x: f.x, y: f.y, r: f.r * 0.8, grow: 220 * this.u, life: 0.35, max: 0.35, color, width: 4 * this.u });
    this.floaters.push({
      x: f.x,
      y: f.y - f.r * 0.6,
      text: formatBoost(f.kind),
      color: FRUITS[f.kind].ink,
      size: 30 * this.u,
      life: 1,
      max: 1,
    });
    this.streak += 1;
    sound.squish(this.streak);
  }

  private revealBomb(f: Fruit) {
    this.removeFruit(f);
    this.spawnHalves(f, true);
    this.juice(f.x, f.y, FRUITS[f.kind].juice, f.cutAngle, 8, f.r);
    this.bombs.push({ x: f.x, y: f.y, r: Math.max(f.r, 34 * this.u), t: 0 });
    sound.fuse();
  }

  private explode(b: Bomb) {
    const { x, y } = b;
    this.flash = 1;
    this.shake = 1;
    this.hooks.onExplode();
    sound.boom();
    this.rings.push(
      { x, y, r: b.r, grow: 1400 * this.u, life: 0.55, max: 0.55, color: '#ffffff', width: 10 * this.u },
      { x, y, r: b.r * 0.6, grow: 900 * this.u, life: 0.8, max: 0.8, color: '#ff8a2e', width: 16 * this.u },
    );
    for (let i = 0; i < 60; i++) {
      const a = rand(0, TAU);
      const sp = rand(200, 950) * this.u;
      this.drops.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        r: rand(1.5, 4) * this.u,
        color: i % 3 ? '#ffb02e' : '#fff3a0',
        life: rand(0.4, 1),
        max: 1,
        glow: true,
        gravity: 0.35,
      });
    }
    for (let i = 0; i < 14; i++) {
      const a = rand(0, TAU);
      const sp = rand(30, 160) * this.u;
      this.smoke.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, r: rand(20, 46) * this.u, life: 1.6, max: 1.6 });
    }
    this.splats.push({
      x,
      y,
      color: '#0a0610',
      blobs: [{ dx: 0, dy: 0, r: b.r * 1.6 }, ...Array.from({ length: 10 }, () => {
        const a = rand(0, TAU);
        const d = b.r * rand(1, 2.4);
        return { dx: Math.cos(a) * d, dy: Math.sin(a) * d, r: b.r * rand(0.1, 0.35) };
      })],
      life: 9,
    });
    // Blast everything else away.
    for (const f of this.fruits) {
      const dx = f.x - x;
      const dy = f.y - y;
      const d = Math.max(30, Math.hypot(dx, dy));
      const k = (900 * this.u * 120) / (d + 120);
      f.state = 'fly';
      f.vx += (dx / d) * k;
      f.vy += (dy / d) * k - 200 * this.u;
      f.vrot += rand(-6, 6);
    }
    for (const h of this.halves) {
      const dx = h.x - x;
      const dy = h.y - y;
      const d = Math.max(30, Math.hypot(dx, dy));
      h.vx += (dx / d) * 500 * this.u;
      h.vy += (dy / d) * 500 * this.u;
    }
  }

  // ── Simulation ──────────────────────────────────────────────────────────

  private gravity() {
    return this.H * 0.9;
  }

  private queueWave() {
    const roll = Math.random();
    const n = roll < 0.35 ? 2 : roll < 0.75 ? 3 : 4;
    const kinds = Array.from({ length: n }, weightedFruit);
    // Spread launch positions over n slots, in random order.
    const slots = Array.from({ length: n }, (_, i) => i).sort(() => Math.random() - 0.5);
    kinds.forEach((kind, i) => this.spawns.push({ at: this.now + i * 0.2 + rand(0, 0.15), kind, slot: slots[i], slots: n }));
  }

  private launch(s: Spawn) {
    const { W, H } = this;
    const r = BASE_RADIUS[s.kind] * this.u;
    const g = this.gravity();
    const lane = (s.slot + 0.5) / s.slots;
    const x = W * (0.14 + lane * 0.72) + rand(-0.05, 0.05) * W;
    const apexY = H * rand(0.2, 0.42);
    const y = H + r;
    const h = y - apexY;
    const vy = -Math.sqrt(2 * g * h);
    const flight = (2 * -vy) / g;
    const land = Math.min(W * 0.9, Math.max(W * 0.1, x + rand(-0.28, 0.28) * W));
    this.fruits.push({
      id: this.nextId++,
      kind: s.kind,
      x,
      y,
      vx: (land - x) / flight,
      vy,
      rot: rand(0, TAU),
      vrot: rand(-2.6, 2.6),
      r,
      state: 'fly',
      cutAngle: 0,
      pendingT: 0,
      born: this.now,
    });
    sound.toss();
  }

  private update(dt: number) {
    const g = this.gravity();
    const { H, W } = this;

    if (this.mode === 'live') {
      const due = this.spawns.filter((s) => s.at <= this.now);
      if (due.length) {
        this.spawns = this.spawns.filter((s) => s.at > this.now);
        due.forEach((s) => this.launch(s));
      }
      if (this.fruits.length === 0 && this.spawns.length === 0) {
        if (this.nextWaveAt === 0) this.nextWaveAt = this.now + WAVE_GAP;
        else if (this.now >= this.nextWaveAt) {
          this.nextWaveAt = 0;
          this.queueWave();
        }
      }
    }

    for (const f of this.fruits) {
      if (f.state === 'pending') {
        f.pendingT += dt;
        f.rot += Math.sin(f.pendingT * 50) * 0.01;
        continue;
      }
      f.vy += g * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vrot * dt;
    }
    this.fruits = this.fruits.filter((f) => f.state === 'pending' || f.y < H + f.r * 2.2 || f.vy < 0);
    // Fruit blown sideways off-screen is gone too.
    this.fruits = this.fruits.filter((f) => f.state === 'pending' || (f.x > -f.r * 3 && f.x < W + f.r * 3));

    for (const h of this.halves) {
      h.vy += g * dt;
      h.x += h.vx * dt;
      h.y += h.vy * dt;
      h.rot += h.vrot * dt;
    }
    this.halves = this.halves.filter((h) => h.y < H + h.r * 2.5);

    for (const d of this.drops) {
      d.vy += g * (d.gravity ?? 1) * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.life -= dt;
    }
    this.drops = this.drops.filter((d) => d.life > 0);

    for (const s of this.splats) s.life -= dt;
    this.splats = this.splats.filter((s) => s.life > 0);

    for (const fl of this.floaters) {
      fl.life -= dt;
      fl.y -= 55 * this.u * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);

    for (const b of this.bombs) b.t += dt;
    const ready = this.bombs.filter((b) => b.t >= 0.42);
    if (ready.length) {
      this.bombs = this.bombs.filter((b) => b.t < 0.42);
      ready.forEach((b) => this.explode(b));
    }

    for (const r of this.rings) {
      r.life -= dt;
      r.r += r.grow * dt;
      r.grow *= 1 - 3 * dt;
    }
    this.rings = this.rings.filter((r) => r.life > 0);

    for (const s of this.smoke) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 1 - 1.5 * dt;
      s.vy *= 1 - 1.5 * dt;
      s.r += 30 * this.u * dt;
    }
    this.smoke = this.smoke.filter((s) => s.life > 0);

    this.flash = Math.max(0, this.flash - dt * 2.6);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.8);
      const m = this.shake * this.shake * 14;
      this.shaker.style.transform = this.shake > 0 ? `translate(${rand(-m, m)}px, ${rand(-m, m)}px)` : '';
    }

    const cutoff = performance.now() - TRAIL_MS;
    this.trail = this.trail.filter((p) => p.t >= cutoff);

    const quiet = this.mode !== 'live' && this.fruits.length === 0 && this.halves.length === 0 && this.bombs.length === 0;
    this.showcase = Math.max(0, Math.min(1, this.showcase + (quiet ? dt * 2 : -dt * 5)));
  }

  // ── Drawing ─────────────────────────────────────────────────────────────

  private draw() {
    const { ctx, W, H, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    for (const s of this.splats) {
      ctx.globalAlpha = 0.28 * Math.min(1, s.life / 3);
      ctx.fillStyle = s.color;
      for (const b of s.blobs) {
        ctx.beginPath();
        ctx.arc(s.x + b.dx, s.y + b.dy, b.r, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    if (this.showcase > 0) this.drawShowcase();

    for (const s of this.smoke) {
      ctx.globalAlpha = 0.35 * (s.life / s.max);
      ctx.fillStyle = '#3a3340';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const h of this.halves) this.drawHalf(h);
    for (const f of this.fruits) this.drawFruit(f);

    for (const b of this.bombs) {
      ctx.save();
      ctx.translate(b.x, b.y);
      const grow = 0.55 + Math.min(1, b.t / 0.42) * 0.6;
      ctx.scale(grow, grow);
      drawBomb(ctx, b.r, b.t);
      ctx.restore();
    }

    for (const d of this.drops) {
      const a = Math.min(1, (d.life / d.max) * 1.6);
      ctx.fillStyle = d.color;
      if (d.glow) {
        // A soft halo without shadowBlur, which is slow on phones with many sparks.
        ctx.globalAlpha = a * 0.25;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * 2.6, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const r of this.rings) {
      ctx.globalAlpha = r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (r.life / r.max);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const fl of this.floaters) {
      const t = 1 - fl.life / fl.max;
      const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15) * 0.3);
      ctx.globalAlpha = Math.min(1, fl.life / 0.35);
      ctx.font = `700 ${fl.size * pop}px Fredoka, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = fl.size * 0.2;
      ctx.strokeStyle = 'rgba(20, 6, 28, 0.85)';
      ctx.strokeText(fl.text, fl.x, fl.y);
      ctx.fillStyle = fl.color;
      ctx.fillText(fl.text, fl.x, fl.y);
    }
    ctx.globalAlpha = 1;

    this.drawTrail();

    if (this.flash > 0) {
      ctx.globalAlpha = this.flash * 0.85;
      ctx.fillStyle = '#fff6e0';
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  private drawSprite(kind: FruitKind, r: number, face = false) {
    const s = face ? this.sprites.face(kind, r) : this.sprites.skin(kind, r);
    this.ctx.drawImage(s.canvas, -s.half, -s.half, s.half * 2, s.half * 2);
  }

  private drawLabel(x: number, y: number, kind: FruitKind, alpha = 1, base = 13) {
    const { ctx, u } = this;
    const text = formatBoost(kind);
    const size = Math.round(base * Math.max(0.85, u));
    ctx.font = `700 ${size}px Fredoka, system-ui, sans-serif`;
    const w = ctx.measureText(text).width + size;
    const h = size * 1.55;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(18, 8, 28, 0.78)';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = FRUITS[kind].ink;
    ctx.fillText(text, x, y + 1);
    ctx.globalAlpha = 1;
  }

  private drawFruit(f: Fruit) {
    const { ctx } = this;
    if (f.kind === 'dragonfruit') {
      const pulse = 0.6 + 0.4 * Math.sin(this.now * 6 + f.id);
      const g = ctx.createRadialGradient(f.x, f.y, f.r * 0.6, f.x, f.y, f.r * 2);
      g.addColorStop(0, `rgba(255, 210, 90, ${0.35 * pulse})`);
      g.addColorStop(1, 'rgba(255, 210, 90, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 2, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(f.x, f.y);
    if (f.state === 'pending') {
      const j = 1.5 * this.u;
      ctx.translate(rand(-j, j), rand(-j, j));
    }
    ctx.save();
    ctx.rotate(f.rot);
    this.drawSprite(f.kind, f.r);
    ctx.restore();
    if (f.state === 'pending') {
      // The cut line, drawn across the fruit while the result is pending.
      const k = Math.min(1, f.pendingT / 0.12);
      const L = f.r * 1.35 * k;
      ctx.rotate(f.cutAngle);
      ctx.strokeStyle = '#fff';
      ctx.shadowColor = '#bff8ff';
      ctx.shadowBlur = 14;
      ctx.lineWidth = 3.5 * this.u;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-L, 0);
      ctx.lineTo(L, 0);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(f.pendingT * 30);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, f.r * (1.15 + f.pendingT * 0.6), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (f.state === 'fly' && this.mode === 'live') this.drawLabel(f.x, f.y + f.r + 16 * this.u, f.kind);
  }

  private drawHalf(h: Half) {
    const { ctx } = this;
    const R = h.r * 2;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    ctx.beginPath();
    ctx.rect(-R, h.side < 0 ? -R : 0, R * 2, R);
    ctx.clip();
    if (h.charred) ctx.filter = 'brightness(0.45) saturate(0.6)';
    ctx.save();
    ctx.rotate(h.skinRot);
    this.drawSprite(h.kind, h.r);
    ctx.restore();
    this.drawSprite(h.kind, h.r * 0.9, true);
    ctx.filter = 'none';
    ctx.restore();
  }

  private drawTrail() {
    const pts = this.trail;
    if (pts.length < 2) return;
    const { ctx } = this;
    const maxW = 9 * this.u;
    const left: [number, number][] = [];
    const right: [number, number][] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      const w = (maxW * (i + 1)) / pts.length;
      const nx = -Math.sin(ang) * w * 0.5;
      const ny = Math.cos(ang) * w * 0.5;
      left.push([pts[i].x + nx, pts[i].y + ny]);
      right.push([pts[i].x - nx, pts[i].y - ny]);
    }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left) ctx.lineTo(x, y);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.shadowColor = '#7ff4ff';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /** Between rounds: the six fruits bob in a row with their boosts. */
  private drawShowcase() {
    const { ctx, W, H } = this;
    const n = FRUIT_ORDER.length;
    const span = Math.min(W * 0.86, 720 * this.u);
    const scale = Math.min(0.95, span / n / 110);
    FRUIT_ORDER.forEach((kind, i) => {
      ctx.globalAlpha = this.showcase;
      const x = W / 2 - span / 2 + (span / n) * (i + 0.5);
      const y = H * 0.6 + Math.sin(this.now * 1.8 + i * 0.9) * 8 * this.u;
      const r = BASE_RADIUS[kind] * scale * this.u * 1.1;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(this.now * 1.2 + i) * 0.12);
      this.drawSprite(kind, r);
      ctx.restore();
      this.drawLabel(x, H * 0.6 + 62 * scale * this.u + 10, kind, this.showcase, 16);
    });
    ctx.globalAlpha = 1;
  }
}
