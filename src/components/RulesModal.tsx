import { formatBoost } from '../game/arena';
import { FRUITS, FRUIT_ORDER, MAX_MULTIPLIER, RTP, bombOdds, multiplierFor, safeChance, type FruitKind } from '../game/math';
import { formatMultiplier } from '../game/money';
import { FruitIcon } from './FruitIcon';
import { Modal } from './Modal';

/** A few ways to play, to show that none of them beats the RTP. */
const STRATEGIES: { label: string; slices: FruitKind[] }[] = [
  { label: '1 cherry, cash out', slices: ['cherry'] },
  { label: '5 cherries', slices: ['cherry', 'cherry', 'cherry', 'cherry', 'cherry'] },
  { label: '1 lemon', slices: ['lemon'] },
  { label: 'Cherry, lemon, orange', slices: ['cherry', 'lemon', 'orange'] },
  { label: '1 coconut', slices: ['coconut'] },
  { label: '1 watermelon', slices: ['watermelon'] },
  { label: '1 dragon fruit', slices: ['dragonfruit'] },
];

const pct = (x: number, dp = 1) => `${(x * 100).toFixed(dp)}%`;

export function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="HOW TO PLAY" onClose={onClose}>
      <ol className="rules-steps">
        <li>
          <b>Bet and press PLAY.</b> Fruit starts flying.
        </li>
        <li>
          <b>Swipe through a fruit to slice it.</b> Any fruit might have a bomb inside. Riskier fruit gives a bigger boost.
        </li>
        <li>
          <b>Safe slice:</b> your multiplier grows. Keep slicing, or <b>cash out</b> any time after your first safe slice.
        </li>
        <li>
          <b>Bomb:</b> the round ends and the bet is lost. Fruit you don't slice just falls away and doesn't count.
        </li>
      </ol>

      <h4>The fruit</h4>
      <table className="rules-table">
        <thead>
          <tr>
            <th>Fruit</th>
            <th>Bomb inside</th>
            <th>Boost</th>
          </tr>
        </thead>
        <tbody>
          {FRUIT_ORDER.map((k) => (
            <tr key={k}>
              <td className="rules-fruit">
                <FruitIcon kind={k} size={24} /> {FRUITS[k].name}
              </td>
              <td>
                {bombOdds(k)} ({pct(1 - safeChance(k), 0)})
              </td>
              <td>{formatBoost(k)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4>How the multiplier works</h4>
      <p>
        Each fruit's boost is exactly its odds, so no fruit is a better deal than another. Your cash-out multiplier is
        all your boosts multiplied together, times {RTP}, rounded down to the cent. The {pct(1 - RTP, 0)} house edge is
        taken once per round, not once per slice. The top prize is {formatMultiplier(MAX_MULTIPLIER)} and is paid
        automatically.
      </p>
      <table className="rules-table">
        <thead>
          <tr>
            <th>If you…</th>
            <th>Win chance</th>
            <th>Pays</th>
            <th>Return</th>
          </tr>
        </thead>
        <tbody>
          {STRATEGIES.map((s) => {
            const p = s.slices.reduce((x, k) => x * safeChance(k), 1);
            const m = multiplierFor(s.slices);
            return (
              <tr key={s.label}>
                <td>{s.label}</td>
                <td>{pct(p)}</td>
                <td>{formatMultiplier(m)}</td>
                <td>{pct(p * m, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        Whatever you slice and whenever you cash out, the long-run return is at most {pct(RTP, 0)}. Small, safe cash-outs
        lose slightly more because of the rounding.
      </p>
      <p className="muted">
        Keyboard: <kbd>Space</kbd> plays or cashes out, <kbd>1</kbd>–<kbd>6</kbd> slice a cherry, lemon, orange,
        coconut, watermelon or dragon fruit that's in the air.
      </p>
    </Modal>
  );
}
