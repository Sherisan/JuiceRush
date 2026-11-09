import type { Fairness, FruitApi, HistoryEntry, RoundView, Snapshot } from './engine';

/*
 * Client for the game API's api/fruit endpoints (FeedingFranzeeAPI: Engine `Fruit`, GameId `juice-rush`, see
 * FruitController). Same shape as api/defuse:
 *   GET  api/fruit/info      { minBet, maxBet, currency }
 *   GET  api/fruit/state     board
 *   POST api/fruit/bet       { stake }              → board
 *   POST api/fruit/slice     { fruit: FruitKind }   → board
 *   POST api/fruit/cashout                          → board
 *   POST api/fruit/seed      { clientSeed }         → board
 * board = { round: RoundView & { balance, winPending } | null, fairness, history }
 */

// Dev: relative URLs go through the Vite proxy. Production: VITE_API_BASE.
const API_BASE: string = import.meta.env.VITE_API_BASE ?? '';
/** Must match the "Games" entry in the game API config. */
const GAME_ID = 'juice-rush';

// Production: the lobby launches the game as /?token=<jwt>.
// Dev/staging: the API's GET /api/dev-token mints a random player for this game.
// One token per page: init() makes three calls at once, and each would otherwise mint its own dev player.
let token: Promise<string> | null = null;

function getToken(): Promise<string> {
  token ??= fetchToken().catch((e: unknown) => {
    token = null; // the next call tries again
    throw e;
  });
  return token;
}

async function fetchToken(): Promise<string> {
  const fromUrl = new URLSearchParams(window.location.search).get('token');
  if (fromUrl) return fromUrl;
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/dev-token?gameId=${GAME_ID}`);
  } catch {
    throw new Error('Connection lost.');
  }
  if (!res.ok) throw new Error('No session token. Launch the game from the lobby, or run the API in Development mode.');
  return ((await res.json()) as { token: string }).token;
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const auth = await getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Connection lost.');
  }
  if (res.status === 429) throw new Error('Too many requests. Slow down a little.');
  if (res.status === 401) throw new Error('Your session has expired. Reopen the game from the lobby.');
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error ?? `Request failed (${res.status})`);
  return json as T;
}

interface Info {
  minBet: number;
  maxBet: number;
  currency: string;
}

interface Board {
  round: (RoundView & { balance: number | null; winPending: boolean }) | null;
  fairness: Fairness;
  history: HistoryEntry[];
}

/** Talks to the game API; the server owns the seeds and the wallet. */
export function createHttpEngine(): FruitApi {
  let info: Info = { minBet: 1, maxBet: 500, currency: 'ZAR' };
  let balance = 0;

  const toSnapshot = (b: Board): Snapshot => {
    if (b.round?.balance != null) balance = b.round.balance;
    return {
      balance,
      currency: info.currency,
      limits: { minBet: info.minBet, maxBet: info.maxBet },
      fairness: b.fairness,
      round: b.round,
      history: b.history,
    };
  };

  const post = async (path: string, body: unknown = {}) => toSnapshot(await call<Board>(path, body));

  return {
    async init() {
      const [i, wallet, board] = await Promise.all([
        call<Info>('/api/fruit/info'),
        call<{ balance: number }>('/api/wallet/balance'),
        call<Board>('/api/fruit/state'),
      ]);
      info = i;
      balance = wallet.balance;
      // A finished round's balance is stale by now; the wallet is the source of truth on load.
      return toSnapshot({ ...board, round: board.round && { ...board.round, balance: null } });
    },
    bet: (stake) => post('/api/fruit/bet', { stake }),
    slice: (fruit) => post('/api/fruit/slice', { fruit }),
    cashOut: () => post('/api/fruit/cashout'),
    setClientSeed: (clientSeed) => post('/api/fruit/seed', { clientSeed }),
  };
}
