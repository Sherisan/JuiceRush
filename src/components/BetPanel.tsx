import { useState } from 'react';
import type { RoundView } from '../game/engine';
import { payoutFor, roundMoney } from '../game/math';
import { currencySymbol, formatMoney, formatMultiplier } from '../game/money';
import type { Phase } from '../game/useGame';

export function BetPanel({
  phase,
  round,
  amount,
  setAmount,
  balance,
  currency,
  limits,
  pending,
  closing,
  onBet,
  onCashOut,
  onRefill,
}: {
  phase: Phase;
  round: RoundView | null;
  amount: number;
  setAmount: (n: number) => void;
  balance: number;
  currency: string;
  limits: { minBet: number; maxBet: number };
  pending: number;
  closing: boolean;
  onBet: () => void;
  onCashOut: () => void;
  onRefill?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const live = phase === 'live' && round !== null;
  const clamp = (n: number) => roundMoney(Math.min(limits.maxBet, Math.max(limits.minBet, n || limits.minBet)));

  const commitDraft = () => {
    if (draft !== null) setAmount(clamp(parseFloat(draft)));
    setDraft(null);
  };

  const multiplier = round?.multiplier ?? 0;
  const sliced = round?.slices.length ?? 0;
  const broke = !live && balance < limits.minBet;

  return (
    <section className="panel">
      <div className={`amount-box ${live ? 'locked' : ''}`}>
        <label htmlFor="bet-amount">BET AMOUNT</label>
        <div className="amount-row">
          <button disabled={live} onClick={() => setAmount(clamp(amount - 1))} aria-label="Decrease bet">
            −
          </button>
          <div className="amount-input">
            <span>{currencySymbol(currency)}</span>
            <input
              id="bet-amount"
              inputMode="decimal"
              disabled={live}
              value={draft ?? amount.toFixed(2)}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, ''))}
              onBlur={commitDraft}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </div>
          <button disabled={live} onClick={() => setAmount(clamp(amount + 1))} aria-label="Increase bet">
            +
          </button>
        </div>
        <div className="chips">
          <button disabled={live} onClick={() => setAmount(clamp(amount / 2))}>
            ½
          </button>
          <button disabled={live} onClick={() => setAmount(clamp(amount * 2))}>
            ×2
          </button>
          <button disabled={live} onClick={() => setAmount(limits.minBet)}>
            MIN
          </button>
          <button disabled={live} onClick={() => setAmount(clamp(Math.min(limits.maxBet, Math.floor(balance))))}>
            MAX
          </button>
        </div>
      </div>

      {live ? (
        <>
          <div className="round-stats">
            <div>
              <span>BET</span>
              <b>{formatMoney(round.bet, currency)}</b>
            </div>
            <div>
              <span>SLICED</span>
              <b>{sliced}</b>
            </div>
            <div>
              <span>MULTIPLIER</span>
              <b className="lime">{multiplier > 0 ? formatMultiplier(multiplier) : '—'}</b>
            </div>
          </div>
          <button className="cta cashout" disabled={multiplier === 0 || pending > 0 || closing} onClick={onCashOut}>
            <span className="cta-label">{multiplier === 0 ? 'SLICE A FRUIT' : 'CASH OUT'}</span>
            <span className="cta-sub">
              {multiplier === 0 ? 'then cash out any time' : formatMoney(payoutFor(round.bet, multiplier), currency)}
            </span>
          </button>
        </>
      ) : broke && onRefill ? (
        <button className="cta bet" onClick={onRefill}>
          <span className="cta-label">REFILL</span>
          <span className="cta-sub">Demo balance</span>
        </button>
      ) : (
        <button className="cta bet" disabled={pending > 0 || phase === 'loading' || amount > balance} onClick={onBet}>
          <span className="cta-label">PLAY</span>
          <span className="cta-sub">BET {formatMoney(amount, currency)}</span>
        </button>
      )}
    </section>
  );
}
