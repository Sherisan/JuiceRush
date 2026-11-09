import type { RoundView } from '../game/engine';
import { formatBoost } from '../game/arena';
import { FRUITS, FRUIT_ORDER, RTP, bombOdds, multiplierFor, payoutFor } from '../game/math';
import { formatMoney, formatMultiplier } from '../game/money';
import { FruitIcon } from './FruitIcon';
import { BombIcon } from './Icons';

/**
 * The fruit menu: what each fruit risks and adds. While a round is live, each row also shows the cash-out value
 * you'd have if your next slice is that fruit and it's safe.
 */
export function Paytable({ round, previewBet, currency }: { round: RoundView | null; previewBet: number; currency: string }) {
  const live = round?.status === 'live';
  const safe = live ? round.slices.filter((s) => !s.bomb).map((s) => s.fruit) : [];
  const bet = live ? round.bet : previewBet;

  return (
    <aside className="paytable">
      <h3>FRUIT MENU</h3>
      <div className="pt-head">
        <span>Fruit · bomb · boost</span>
        <span>{live ? 'If safe' : 'Pays'}</span>
      </div>
      <ol>
        {FRUIT_ORDER.map((kind) => {
          const next = multiplierFor([...safe, kind]);
          return (
            <li
              key={kind}
              className={`pt-row pt-${kind}`}
              style={{ ['--juice' as string]: FRUITS[kind].juice, ['--ink' as string]: FRUITS[kind].ink }}
            >
              <FruitIcon kind={kind} size={40} className="pt-icon" />
              <span className="pt-info">
                <span className="pt-name">{FRUITS[kind].name}</span>
                <span className="pt-sub">
                  <span className="pt-odds" title={`${bombOdds(kind)} hide a bomb`}>
                    <BombIcon className="pt-bomb" width={12} height={12} />
                    {bombOdds(kind)}
                  </span>
                  <b>{formatBoost(kind)}</b>
                </span>
              </span>
              <span className="pt-next">
                {formatMultiplier(next)}
                <small>{formatMoney(payoutFor(bet, next), currency)}</small>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="pt-foot">Every boost matches its odds · RTP {(RTP * 100).toFixed(0)}%</p>
    </aside>
  );
}
