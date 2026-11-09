import { formatMoney } from '../game/money';
import { ClockIcon, HelpIcon, ShieldIcon, SoundIcon } from './Icons';

export function Logo() {
  return (
    <div className="logo" aria-label="Juice Rush">
      <span className="logo-juice">JUICE</span>
      <span className="logo-rush">RUSH</span>
    </div>
  );
}

export function Hud({
  balance,
  currency,
  demo,
  muted,
  onToggleSound,
  onRules,
  onHistory,
  onFairness,
}: {
  balance: number;
  currency: string;
  demo: boolean;
  muted: boolean;
  onToggleSound: () => void;
  onRules: () => void;
  onHistory: () => void;
  onFairness: () => void;
}) {
  return (
    <header className="hud">
      <Logo />
      <div className="hud-right">
        <div className="balance">
          <span className="balance-label">{demo ? 'DEMO BALANCE' : 'BALANCE'}</span>
          <span className="balance-value">{formatMoney(balance, currency)}</span>
        </div>
        <button className="icon-btn fair-btn" onClick={onFairness} aria-label="Provably fair" title="Provably fair">
          <ShieldIcon />
        </button>
        <button className="icon-btn" onClick={onHistory} aria-label="Bet history" title="Bet history">
          <ClockIcon />
        </button>
        <button className="icon-btn" onClick={onRules} aria-label="How to play" title="How to play">
          <HelpIcon />
        </button>
        <button className="icon-btn" onClick={onToggleSound} aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
          <SoundIcon muted={muted} />
        </button>
      </div>
    </header>
  );
}
