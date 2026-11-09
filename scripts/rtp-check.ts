/*
 * RTP check: npm run rtp
 *
 * 1. Exact: every fixed sequence of up to 5 slices, then cash out. Return = P(all safe) × multiplier.
 * 2. Exact: n of the same fruit in a row, up to the cap.
 * 3. Monte Carlo: adaptive strategies that pick fruit and decide when to stop on the fly.
 * Fails (exit 1) if any exact strategy returns more than the RTP.
 */
import { FRUITS, FRUIT_ORDER, MAX_MULTIPLIER, RTP, multiplierFor, safeChance, type FruitKind } from '../src/game/math.ts';

let worst = { rtp: 0, label: '' };
let checked = 0;
const note = (rtp: number, label: string) => {
  checked++;
  if (rtp > worst.rtp) worst = { rtp, label };
};

// 1. All sequences up to length 5 (6 + 36 + 216 + 1296 + 7776).
function walk(seq: FruitKind[], p: number) {
  if (seq.length) note(p * multiplierFor(seq), seq.join(','));
  if (seq.length === 5) return;
  for (const k of FRUIT_ORDER) walk([...seq, k], p * safeChance(k));
}
walk([], 1);

// 2. Long runs of one fruit, until the cap.
console.log('Same fruit n times, then cash out:');
for (const k of FRUIT_ORDER) {
  const row: string[] = [];
  let p = 1;
  const seq: FruitKind[] = [];
  for (let n = 1; n <= 80; n++) {
    seq.push(k);
    p *= safeChance(k);
    const m = multiplierFor(seq);
    note(p * m, `${n}×${k}`);
    if ([1, 2, 3, 5, 10, 20].includes(n)) row.push(`n=${n}: ×${m.toFixed(2)} → ${(p * m * 100).toFixed(2)}%`);
    if (m >= MAX_MULTIPLIER) {
      row.push(`cap at n=${n} → ${(p * m * 100).toFixed(4)}%`);
      break;
    }
  }
  console.log(`  ${FRUITS[k].name.padEnd(12)} ${row.join(' | ')}`);
}

console.log(`\nExact strategies checked: ${checked}`);
console.log(`Highest return: ${(worst.rtp * 100).toFixed(4)}% (${worst.label}); target ${(RTP * 100).toFixed(2)}%`);

// 3. Adaptive strategies, simulated.
type Strategy = { name: string; pick: (safe: FruitKind[]) => FruitKind | null };
const random = (): FruitKind => FRUIT_ORDER[Math.floor(Math.random() * FRUIT_ORDER.length)];
const strategies: Strategy[] = [
  { name: 'Always 1 cherry', pick: (s) => (s.length < 1 ? 'cherry' : null) },
  { name: 'Cherries until ×2', pick: (s) => (multiplierFor(s) < 2 ? 'cherry' : null) },
  { name: 'Random fruit, stop at ×3', pick: (s) => (multiplierFor(s) < 3 ? random() : null) },
  { name: 'Random fruit, 30% stop each step', pick: (s) => (s.length && Math.random() < 0.3 ? null : random()) },
  { name: 'Dragon fruit chaser, stop at ×50', pick: (s) => (multiplierFor(s) < 50 ? 'dragonfruit' : null) },
  { name: 'Chase ×1000 with watermelons', pick: (s) => (multiplierFor(s) < MAX_MULTIPLIER ? 'watermelon' : null) },
];
const ROUNDS = 1_000_000;
console.log(`\nSimulated, ${ROUNDS.toLocaleString()} rounds each:`);
for (const st of strategies) {
  let paid = 0;
  let sq = 0;
  for (let i = 0; i < ROUNDS; i++) {
    const safe: FruitKind[] = [];
    let win = 0;
    for (;;) {
      const k = st.pick(safe);
      if (k === null) {
        win = multiplierFor(safe);
        break;
      }
      if (Math.random() >= safeChance(k)) break; // bomb
      safe.push(k);
      if (multiplierFor(safe) >= MAX_MULTIPLIER) {
        win = MAX_MULTIPLIER;
        break;
      }
    }
    paid += win;
    sq += win * win;
  }
  const mean = paid / ROUNDS;
  const se = Math.sqrt((sq / ROUNDS - mean * mean) / ROUNDS);
  console.log(`  ${st.name.padEnd(36)} ${(mean * 100).toFixed(2)}% ± ${(se * 196).toFixed(2)}`);
}

if (worst.rtp > RTP + 1e-12) {
  console.error('\nFAIL: a strategy beats the RTP');
  process.exit(1);
}
console.log('\nOK: no fixed strategy returns more than the RTP.');
