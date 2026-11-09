# JUICE RUSH

Instant-win casino game: bet, and fruit starts flying. Swipe through a fruit to slice it. Any fruit might hide a bomb,
and riskier fruit adds a bigger boost to your multiplier. Cash out any time after your first safe slice. Slice a bomb
and the bet is lost.

```
npm install
npm run dev      # http://localhost:5184
npm run build
npm run rtp      # exact + simulated RTP check (fails if any strategy beats 97%)
```

The game plays against the game API (FeedingFranzeeAPI, `api/fruit`). In dev, Vite proxies `/api` to
http://localhost:5003 and the API's `/api/dev-token` signs in a demo player. Production builds call `VITE_API_BASE`
with the lobby's `?token=`. Open the game with `?demo` (or build with `VITE_DEMO=1`) to play offline against the
in-browser engine (`createLocalEngine()` in `src/game/engine.ts`, demo wallet R1,000).

## Math (RTP 97%)

| Fruit        | Bomb inside | Boost | 1 slice, cash out | Return | Tossed |
|--------------|------------:|------:|------------------:|-------:|-------:|
| Cherry       | 1 in 10     | ×1.11 | ×1.07             | 96.30% | 30%    |
| Lemon        | 1 in 5      | ×1.25 | ×1.21             | 96.80% | 24%    |
| Orange       | 1 in 3      | ×1.5  | ×1.45             | 96.67% | 20%    |
| Coconut      | 1 in 2      | ×2    | ×1.94             | 97.00% | 13%    |
| Watermelon   | 3 in 4      | ×4    | ×3.88             | 97.00% | 8%     |
| Dragon fruit | 9 in 10     | ×10   | ×9.70             | 97.00% | 5%     |

```
multiplier = floor(97 × Π outOf / Π safe) / 100      (safe = outOf − bombs, over every safe slice)
payout     = floor(bet × multiplier to the cent)
```

Each boost is exactly `1 / P(safe)`, and the 97% is applied **once per round**, not per slice. So the cash-out value of
any position is `0.97 / P(reaching it)`, and the round's value is a martingale: whatever the player slices, in any
order, and whenever they cash out, the expected return is 97% at most. Flooring only takes more off. Playing safe
does not help. Cashing out after a single cherry wins 90% of the time but pays ×1.07, a 96.3% return. Products are
exact (`BigInt`), so client, server and verifier never disagree on a rounding edge. See `src/game/math.ts`.

`npm run rtp` checks all 9,467 slice sequences up to length 5, long single-fruit runs up to the cap, and 1M simulated
rounds for several adaptive strategies. The best fixed strategy returns exactly 97.00%. No strategy returns more.

**Max win**: ×1000 (`MAX_MULTIPLIER`), paid automatically when reached. The cap only ever lowers the return. Slicing
past it is a bad bet, and the fruit menu's "If safe" column shows ×1000.00 when it is. The API refuses a config whose
`MaxWin` is below `MaxBet × 1000`, so with a R5,000 max win (as for DEFUSE, Vault Cracker and Deep Dive) the max bet
is R5.

Which fruit is tossed is cosmetic (`weight`). It changes what's on offer, never the odds or the return.

## Provably fair

See `src/game/fair.ts`. Slice `i` of a round (0-based) rolls

```
roll = (first 52 bits of HMAC_SHA256(key: serverSeed, message: "clientSeed:nonce:i") × outOf) >> 52
```

and the fruit hides a bomb when `roll < bombs`. A fresh server seed is used for each round, its SHA-256 hash is shown
before the bet, and the seed is revealed after the round. History → Verify recomputes the hash, every roll, the
multiplier and the payout. This is the same `pick` as DEFUSE (`DefuseFair.Pick`).

`crypto.subtle` (used by the engine and Verify) needs a secure context: localhost or https.

## Backend (FeedingFranzeeAPI)

Engine `Fruit`, GameId `juice-rush`, ProviderGameId 11, shaped like `api/defuse`:

- `Domain/Fruit/Fruit.cs`: `FruitRules` (menu, multiplier, payout) and `FruitFair` (rolls), a port of `math.ts` and
  `fair.ts` (`BigInteger` products)
- `Application/Fruit/FruitService.cs`: rounds, wallet debit and credit, history, idle timeout
- `Presentation/Controllers/FruitController.cs`: the endpoints below
- the `juice-rush` entry in `appsettings.json` `Games`, and `Infrastructure/Persistence/JuiceRushGameServer.sql` /
  `JuiceRushCatalogue.sql` for the deploy. With SQL configured, the API also copies the appsettings entry into
  `dbo.Games` on startup when the row is missing.

| Call                      | Body                     | Returns |
|---------------------------|--------------------------|---------|
| `GET  api/fruit/info`     |                          | `{ minBet, maxBet, currency }` |
| `GET  api/fruit/state`    |                          | board |
| `POST api/fruit/bet`      | `{ stake }`              | board |
| `POST api/fruit/slice`    | `{ fruit }` (FruitKind)  | board |
| `POST api/fruit/cashout`  |                          | board |
| `POST api/fruit/seed`     | `{ clientSeed }`         | board |

board = `{ round: { id, bet, slices: [{ fruit, bomb }], multiplier, payout, status, balance, winPending } | null,
fairness: { serverSeedHash, clientSeed, nonce }, history: [{ …, slices: [{ fruit, roll, bomb }], serverSeed, … }] }`,
status ∈ `live | cashed | exploded | maxed`.

Server rules: any fruit on the menu can be sliced (the toss is client-side and cosmetic, and every fruit has the same
return). Cash-out needs a safe slice first. The round settles `maxed` when the multiplier reaches ×1000. Calls are
serialized per seat. A round idle for 10 minutes is cashed out at its multiplier; before the first slice that returns
the stake (status `cashed`, ×1), as DEFUSE does at rung 0. After a failed call the frontend re-reads the state, so a
round the server closed doesn't leave it stuck.

## Controls

Swipe (mouse or touch) through a fruit, or tap it. Keys `1`–`6` slice a cherry … dragon fruit in the air.
`Space` plays or cashes out.

## Files

- `src/game/math.ts`: fruit table, multiplier and payout rules (no DOM, shared with `scripts/rtp-check.ts`)
- `src/game/fair.ts`: provably-fair rolls
- `src/game/engine.ts`: the `FruitApi` contract and the in-browser demo engine
- `src/game/httpEngine.ts`: client for `api/fruit`
- `src/game/useGame.ts`: React state; every server call runs through one queue, so slices resolve in cut order
- `src/game/arena.ts`: canvas tossing, blade, slicing, juice and explosion (animates outcomes, never decides them)
- `src/game/art.ts`: procedural fruit and bomb art, sprite cache
- `tools/thumbnail.html`: the 1280×720 lobby thumbnail, drawn from the game's fruit art; with `npm run dev` running, open
  `/tools/thumbnail.html` and screenshot it into `public/thumbnail.png`
