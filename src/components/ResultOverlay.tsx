import type { RoundView } from '../game/engine';
import { FRUITS } from '../game/math';
import { formatMoney, formatMultiplier } from '../game/money';

export function ResultOverlay({
  round,
  currency,
  visible,
  onClose,
}: {
  round: RoundView | null;
  currency: string;
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible || !round || round.status === 'live') return null;
  const n = round.slices.length;
  const last = round.slices[n - 1];
  const safeCount = round.slices.filter((s) => !s.bomb).length;

  const view = {
    cashed: {
      title: 'JUICED!',
      amount: `+${formatMoney(round.payout, currency)}`,
      meta: `Cashed out at ${formatMultiplier(round.multiplier)} after ${safeCount} slice${safeCount === 1 ? '' : 's'}`,
    },
    maxed: { title: 'MAX WIN!', amount: `+${formatMoney(round.payout, currency)}`, meta: `${formatMultiplier(round.multiplier)} · the top prize` },
    exploded: {
      title: 'BOOM!',
      amount: `−${formatMoney(round.bet, currency)}`,
      meta: last
        ? `The ${FRUITS[last.fruit].name.toLowerCase()} hid a bomb${round.multiplier > 0 ? ` · you had ${formatMultiplier(round.multiplier)}` : ''}`
        : 'Bomb!',
    },
  }[round.status];

  return (
    <div className={`result result-${round.status}`} onClick={onClose} role="status">
      <div className="result-card">
        <div className="result-title">{view.title}</div>
        <div className="result-amount">{view.amount}</div>
        <div className="result-meta">{view.meta}</div>
        <small>Tap to continue</small>
      </div>
    </div>
  );
}
