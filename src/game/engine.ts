import { isBomb, randomHex, rollFor, sha256Hex } from './fair';
import { isFruit, isMaxed, multiplierFor, payoutFor, roundMoney, type FruitKind } from './math';

export type RoundStatus = 'live' | 'cashed' | 'exploded' | 'maxed';

export interface Slice {
  fruit: FruitKind;
  bomb: boolean;
}

/** What the client is allowed to see of a round. */
export interface RoundView {
  id: string;
  bet: number;
  /** Every fruit sliced so far, in order. Only the last one of an exploded round is a bomb. */
  slices: Slice[];
  /** Cash-out multiplier right now (0 before the first safe slice). */
  multiplier: number;
  payout: number;
  status: RoundStatus;
}

export interface Fairness {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface HistoryEntry {
  id: string;
  time: number;
  bet: number;
  slices: (Slice & { roll: number })[];
  multiplier: number;
  payout: number;
  status: Exclude<RoundStatus, 'live'>;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
}

export interface Snapshot {
  balance: number;
  currency: string;
  limits: { minBet: number; maxBet: number };
  fairness: Fairness;
  /** Current round, or the last finished one (kept so the stage can show how it ended). */
  round: RoundView | null;
  history: HistoryEntry[];
}

/** The contract a real backend needs to satisfy. Every call returns the full new state. */
export interface FruitApi {
  init(): Promise<Snapshot>;
  bet(amount: number): Promise<Snapshot>;
  slice(fruit: FruitKind): Promise<Snapshot>;
  cashOut(): Promise<Snapshot>;
  setClientSeed(seed: string): Promise<Snapshot>;
  /** Demo only: top the wallet back up. */
  refill?(): Promise<Snapshot>;
}

interface InternalRound extends Omit<RoundView, 'slices' | 'multiplier'> {
  slices: (Slice & { roll: number })[];
}

interface Stored {
  balance: number;
  clientSeed: string;
  nonce: number;
  serverSeed: string;
  round: InternalRound | null;
  history: HistoryEntry[];
}

const STORAGE_KEY = 'juicerush.demo.v1';
const DEMO_BALANCE = 1000;
const LIMITS = { minBet: 1, maxBet: 500 };
const HISTORY_LIMIT = 50;

const safeFruits = (r: { slices: Slice[] }) => r.slices.filter((s) => !s.bomb).map((s) => s.fruit);

/**
 * In-browser stand-in for the game server so the frontend is fully playable without a backend.
 * It holds the secret seed and only exposes its hash until the round ends.
 */
export function createLocalEngine(): FruitApi {
  let s: Stored = load();
  let seedHash = '';

  function load(): Stored {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as Stored;
    } catch {
      /* corrupt or blocked storage: start fresh */
    }
    return { balance: DEMO_BALANCE, clientSeed: randomHex(8), nonce: 0, serverSeed: randomHex(), round: null, history: [] };
  }

  const save = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      /* private mode: the session still works, it just won't survive a reload */
    }
  };

  async function snapshot(): Promise<Snapshot> {
    seedHash ||= await sha256Hex(s.serverSeed);
    const r = s.round;
    return {
      balance: s.balance,
      currency: 'ZAR',
      limits: LIMITS,
      fairness: { serverSeedHash: seedHash, clientSeed: s.clientSeed, nonce: s.nonce },
      round: r && {
        id: r.id,
        bet: r.bet,
        slices: r.slices.map(({ fruit, bomb }) => ({ fruit, bomb })),
        multiplier: multiplierFor(safeFruits(r)),
        payout: r.payout,
        status: r.status,
      },
      history: s.history,
    };
  }

  function live(): InternalRound {
    if (s.round?.status !== 'live') throw new Error('No round in progress');
    return s.round;
  }

  /** Close the round, pay it, reveal the seed into history and rotate to a fresh one. */
  async function settle(r: InternalRound, status: HistoryEntry['status']) {
    const multiplier = status === 'exploded' ? 0 : multiplierFor(safeFruits(r));
    r.status = status;
    r.payout = status === 'exploded' ? 0 : payoutFor(r.bet, multiplier);
    s.balance = roundMoney(s.balance + r.payout);
    s.history = [
      {
        id: r.id,
        time: Date.now(),
        bet: r.bet,
        slices: r.slices.map((x) => ({ ...x })),
        multiplier,
        payout: r.payout,
        status,
        serverSeed: s.serverSeed,
        serverSeedHash: await sha256Hex(s.serverSeed),
        clientSeed: s.clientSeed,
        nonce: s.nonce,
      },
      ...s.history,
    ].slice(0, HISTORY_LIMIT);
    s.serverSeed = randomHex();
    s.nonce += 1;
    seedHash = '';
  }

  return {
    init: snapshot,

    async bet(amount) {
      if (s.round?.status === 'live') throw new Error('Finish the current round first');
      if (!(amount >= LIMITS.minBet && amount <= LIMITS.maxBet)) {
        throw new Error(`Bet must be between ${LIMITS.minBet} and ${LIMITS.maxBet}`);
      }
      amount = roundMoney(amount);
      if (amount > s.balance) throw new Error('Insufficient balance');
      s.balance = roundMoney(s.balance - amount);
      s.round = { id: randomHex(6), bet: amount, slices: [], payout: 0, status: 'live' };
      save();
      return snapshot();
    },

    async slice(fruit) {
      const r = live();
      if (!isFruit(fruit)) throw new Error('Unknown fruit');
      const roll = await rollFor(s.serverSeed, s.clientSeed, s.nonce, r.slices.length, fruit);
      const bomb = isBomb(fruit, roll);
      r.slices.push({ fruit, bomb, roll });
      if (bomb) await settle(r, 'exploded');
      else if (isMaxed(multiplierFor(safeFruits(r)))) await settle(r, 'maxed');
      save();
      return snapshot();
    },

    async cashOut() {
      const r = live();
      if (safeFruits(r).length === 0) throw new Error('Slice a fruit first');
      await settle(r, 'cashed');
      save();
      return snapshot();
    },

    async setClientSeed(seed) {
      if (s.round?.status === 'live') throw new Error('Change seeds between rounds');
      const clean = seed.trim().slice(0, 64);
      if (!clean) throw new Error('Client seed cannot be empty');
      s.clientSeed = clean;
      save();
      return snapshot();
    },

    async refill() {
      if (s.round?.status === 'live') throw new Error('Finish the current round first');
      s.balance = DEMO_BALANCE;
      save();
      return snapshot();
    },
  };
}
