/*
 * JUICE RUSH math. The server must implement exactly the same rules.
 *
 * Every fruit the player slices hides a bomb with a fixed chance. A safe slice multiplies the round's
 * fair value by 1 / P(safe), the fruit's "boost". The RTP is applied ONCE to the whole round, not per slice:
 *
 *     multiplier = floor(97 × Π outOf / Π safe) / 100        (capped at MAX_MULTIPLIER)
 *
 * so the cash-out value of any position is RTP / P(reaching it). Whatever the player slices and whenever they
 * cash out, the expected return is RTP × bet, and flooring to the cent only ever takes a little more off.
 * Cashing out after a single cherry pays ×1.07 nine times in ten: 96.3%, below the 97% target.
 *
 * Products are exact (BigInt), so the client, the server and the verifier never disagree on a rounding edge.
 */

export const RTP = 0.97;
const RTP_PERCENT = 97n;
/** Top prize. Reaching it settles the round automatically. */
export const MAX_MULTIPLIER = 1000;
const MAX_CENTS = BigInt(MAX_MULTIPLIER * 100);

export type FruitKind = 'cherry' | 'lemon' | 'orange' | 'coconut' | 'watermelon' | 'dragonfruit';

export interface FruitSpec {
  kind: FruitKind;
  name: string;
  /** `bombs` out of `outOf` hide a bomb. */
  bombs: number;
  outOf: number;
  /** Relative chance of being tossed. Cosmetic only: it changes what's on offer, never the odds. */
  weight: number;
  /** Juice splash colour. */
  juice: string;
  /** Text colour for this fruit on the dark UI (the juice colour, lifted where it's too dark to read). */
  ink: string;
}

export const FRUITS: Record<FruitKind, FruitSpec> = {
  cherry: { kind: 'cherry', name: 'Cherry', bombs: 1, outOf: 10, weight: 30, juice: '#e0123f', ink: '#ff6f8a' },
  lemon: { kind: 'lemon', name: 'Lemon', bombs: 1, outOf: 5, weight: 24, juice: '#ffe14d', ink: '#ffe14d' },
  orange: { kind: 'orange', name: 'Orange', bombs: 1, outOf: 3, weight: 20, juice: '#ff9a1f', ink: '#ffae4f' },
  coconut: { kind: 'coconut', name: 'Coconut', bombs: 1, outOf: 2, weight: 13, juice: '#f2ede2', ink: '#efe6d6' },
  watermelon: { kind: 'watermelon', name: 'Watermelon', bombs: 3, outOf: 4, weight: 8, juice: '#ff3b55', ink: '#ff7a8e' },
  dragonfruit: { kind: 'dragonfruit', name: 'Dragon Fruit', bombs: 9, outOf: 10, weight: 5, juice: '#ff2e93', ink: '#ff7cc0' },
};

export const FRUIT_ORDER: FruitKind[] = ['cherry', 'lemon', 'orange', 'coconut', 'watermelon', 'dragonfruit'];

export const isFruit = (k: unknown): k is FruitKind => typeof k === 'string' && k in FRUITS;

export function safeChance(kind: FruitKind): number {
  const f = FRUITS[kind];
  return (f.outOf - f.bombs) / f.outOf;
}

/** What one safe slice multiplies the round by: 1.11, 1.25, 1.50, 2, 4, 10. */
export function boostOf(kind: FruitKind): number {
  return 1 / safeChance(kind);
}

/** "1 in 10", "3 in 4". */
export function bombOdds(kind: FruitKind): string {
  const f = FRUITS[kind];
  return `${f.bombs} in ${f.outOf}`;
}

/** Cash-out multiplier after these safe slices. 0 until the first safe slice: there's nothing to cash out yet. */
export function multiplierFor(safe: readonly FruitKind[]): number {
  if (safe.length === 0) return 0;
  let survive = 1n;
  let total = 1n;
  for (const k of safe) {
    const f = FRUITS[k];
    survive *= BigInt(f.outOf - f.bombs);
    total *= BigInt(f.outOf);
  }
  const cents = (RTP_PERCENT * total) / survive; // BigInt division floors
  return Number(cents > MAX_CENTS ? MAX_CENTS : cents) / 100;
}

export const isMaxed = (multiplier: number) => multiplier >= MAX_MULTIPLIER;

export function roundMoney(amount: number): number {
  return Math.round(amount * 100 + 1e-9) / 100;
}

/** bet × multiplier, floored to the cent (both have 2 dp, so this is exact integer math). */
export function payoutFor(bet: number, multiplier: number): number {
  const cents = Math.floor((Math.round(bet * 100) * Math.round(multiplier * 100)) / 100);
  return cents / 100;
}
