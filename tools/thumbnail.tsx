/* The lobby thumbnail (see thumbnail.html). */
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import '@fontsource/jetbrains-mono/700.css';
import { drawBomb, drawFlesh, drawSkin } from '../src/game/art';
import { MAX_MULTIPLIER, boostOf, type FruitKind } from '../src/game/math';

type Ctx = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Whole fruit: [kind, x, y, radius, rotation]. */
const WHOLE: [FruitKind, number, number, number, number][] = [
  ['watermelon', 985, 215, 96, -0.35],
  ['lemon', 700, 185, 56, 0.4],
  ['cherry', 1185, 120, 44, 0.15],
  ['dragonfruit', 1160, 455, 70, 0.3],
  ['coconut', 860, 615, 58, -0.2],
];

/** Boost tags under the fruit, as the game shows them. */
const TAGS: [FruitKind, number, number][] = [
  ['watermelon', 985, 330],
  ['dragonfruit', 1160, 548],
  ['lemon', 700, 258],
];

/** A cut half, as the arena draws it: the skin clipped to one side of the cut, the cut face over it. */
function half(ctx: Ctx, kind: FruitKind, r: number, x: number, y: number, rot: number, side: -1 | 1, skinRot: number) {
  const R = r * 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.rect(-R, side < 0 ? -R : 0, R * 2, R);
  ctx.clip();
  ctx.save();
  ctx.rotate(skinRot);
  drawSkin(ctx, kind, r);
  ctx.restore();
  drawFlesh(ctx, kind, r * 0.9);
  ctx.restore();
}

function draw(ctx: Ctx) {
  const at = (x: number, y: number, rot: number, paint: () => void) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    paint();
    ctx.restore();
  };

  // A lit bomb that was hiding in a fruit.
  at(1030, 600, 0, () => drawBomb(ctx, 54, 0.37));

  for (const [kind, x, y, r, rot] of WHOLE) at(x, y, rot, () => drawSkin(ctx, kind, r));

  // The orange being sliced: two halves flying apart, juice spraying from the cut.
  const cx = 770;
  const cy = 430;
  const cut = -0.55;
  const gap = 20;
  const r = 78;
  half(ctx, 'orange', r, cx + Math.sin(cut) * gap, cy - Math.cos(cut) * gap, cut - 0.18, -1, 0.4);
  half(ctx, 'orange', r, cx - Math.sin(cut) * gap, cy + Math.cos(cut) * gap, cut + 0.16, 1, 0.4);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 46; i++) {
    const along = (rnd() - 0.5) * 2.4 * r;
    const out = (rnd() < 0.5 ? -1 : 1) * (0.25 + rnd() * 1.4) * r;
    const x = cx + Math.cos(cut) * along - Math.sin(cut) * out;
    const y = cy + Math.sin(cut) * along + Math.cos(cut) * out;
    const s = 3 + rnd() * 9;
    ctx.fillStyle = rnd() < 0.7 ? '#ff9a1f' : '#ffc46b';
    ctx.globalAlpha = 0.65 + rnd() * 0.35;
    ctx.beginPath();
    ctx.ellipse(x, y, s * 1.4, s, cut + (rnd() - 0.5), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // The blade's trail through the cut.
  const L = 260;
  const pts = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23 - 0.5;
    return [cx + Math.cos(cut) * t * 2 * L, cy + Math.sin(cut) * t * 2 * L - Math.sin((t + 0.5) * Math.PI) * 10];
  });
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const w = 1 + 7 * Math.sin((i / 23) * Math.PI);
    if (i === 0) ctx.moveTo(x, y - w);
    else ctx.lineTo(x, y - w);
  });
  for (let i = pts.length - 1; i >= 0; i--) {
    const w = 1 + 7 * Math.sin((i / 23) * Math.PI);
    ctx.lineTo(pts[i][0], pts[i][1] + w);
  }
  ctx.closePath();
  ctx.shadowColor = '#7ff4ff';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.shadowBlur = 0;
}

function Fruit() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const dpr = 2;
    canvas.width = 1280 * dpr;
    canvas.height = 720 * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    draw(ctx);
  }, []);
  return <canvas ref={ref} className="thumb-fruit" />;
}

function Thumbnail() {
  return (
    <div className="thumb">
      <Fruit />
      {TAGS.map(([kind, x, y]) => (
        <span key={kind} className="thumb-boost" style={{ left: x, top: y }}>
          ×{+boostOf(kind).toFixed(2)}
        </span>
      ))}
      <div className="thumb-title">
        <div className="thumb-juice">JUICE</div>
        <div className="thumb-rush">RUSH</div>
        <div className="thumb-tag">SLICE THE FRUIT · DODGE THE BOMB</div>
        <div className="thumb-sub">UP TO ×{MAX_MULTIPLIER} · PROVABLY FAIR</div>
      </div>
    </div>
  );
}

const css = `
  html, body { margin: 0; width: 1280px; height: 720px; overflow: hidden; background: #160c22; }
  .thumb { position: relative; width: 1280px; height: 720px; overflow: hidden;
    background:
      radial-gradient(ellipse 45% 55% at 72% 50%, rgba(255, 120, 60, 0.2), transparent 70%),
      radial-gradient(ellipse 40% 45% at 8% 10%, rgba(255, 46, 147, 0.22), transparent 70%),
      radial-gradient(ellipse 40% 40% at 95% 100%, rgba(166, 255, 77, 0.08), transparent 70%),
      linear-gradient(180deg, #22113a, #12081f); }
  .thumb::before { content: ''; position: absolute; inset: 0; opacity: 0.6;
    background: repeating-linear-gradient(115deg, rgba(255, 255, 255, 0.02) 0 2px, transparent 2px 22px); }
  .thumb-fruit { position: absolute; inset: 0; width: 1280px; height: 720px; }
  .thumb-boost { position: absolute; transform: translateX(-50%); padding: 3px 12px; border-radius: 999px;
    font-family: 'Fredoka', sans-serif; font-weight: 700; font-size: 22px; color: #a6ff4d;
    background: rgba(20, 10, 32, 0.78); border: 1px solid rgba(166, 255, 77, 0.45); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45); }
  .thumb-title { position: absolute; left: 64px; top: 50%; transform: translateY(-50%); font-family: 'Fredoka', sans-serif; }
  .thumb-juice { font-weight: 700; font-size: 40px; line-height: 1; letter-spacing: 0.55em;
    background: linear-gradient(180deg, #ffe066, #ff8a00); -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 0 14px rgba(255, 150, 30, 0.45)); }
  .thumb-rush { position: relative; display: inline-block; margin-top: 2px; font-weight: 700; font-size: 150px; line-height: 0.95; letter-spacing: 0.03em;
    background: linear-gradient(180deg, #ff9ad0, #ff2e93); -webkit-background-clip: text; background-clip: text; color: transparent;
    filter: drop-shadow(0 5px 0 rgba(90, 0, 50, 0.7)) drop-shadow(0 0 30px rgba(255, 46, 147, 0.5)); }
  .thumb-rush::after { content: ''; position: absolute; left: 4px; right: 10px; bottom: -14px; height: 7px; border-radius: 99px;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.95) 45%, #7ff4ff 80%, transparent);
    box-shadow: 0 0 16px rgba(127, 244, 255, 0.7); }
  .thumb-tag { margin-top: 46px; font-weight: 600; font-size: 24px; letter-spacing: 0.2em; color: #ffc46b; }
  .thumb-sub { margin-top: 14px; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 19px; letter-spacing: 0.14em; color: #e9dff5; }
`;
document.head.append(Object.assign(document.createElement('style'), { textContent: css }));
createRoot(document.getElementById('root')!).render(<Thumbnail />);
