import { useEffect, useRef, useState } from 'react';
import { ArenaView } from './components/ArenaView';
import { BetPanel } from './components/BetPanel';
import { FruitIcon } from './components/FruitIcon';
import { HistoryModal } from './components/HistoryModal';
import { Hud } from './components/Hud';
import { BombIcon } from './components/Icons';
import { Paytable } from './components/Paytable';
import { ResultOverlay } from './components/ResultOverlay';
import { RulesModal } from './components/RulesModal';
import type { ArenaMode } from './game/arena';
import { createLocalEngine } from './game/engine';
import { createHttpEngine } from './game/httpEngine';
import { FRUITS, payoutFor } from './game/math';
import { formatMoney, formatMultiplier } from './game/money';
import { sound } from './game/sound';
import { useGame, type Phase } from './game/useGame';

// The game API by default; ?demo (or VITE_DEMO=1) plays offline against the in-browser engine with a demo wallet.
const demo = import.meta.env.VITE_DEMO === '1' || new URLSearchParams(window.location.search).has('demo');
const engine = demo ? createLocalEngine() : createHttpEngine();

type ModalKind = 'rules' | 'history' | 'fairness' | null;

const MODE: Record<Phase, ArenaMode> = { loading: 'idle', idle: 'idle', live: 'live', ended: 'ended' };
const CHAIN_MAX = 10;

export default function App() {
  const game = useGame(engine);
  const { snap, round, phase, actions } = game;
  const [amount, setAmount] = useState(10);
  const [modal, setModal] = useState<ModalKind>(null);
  const [muted, setMuted] = useState(sound.isMuted());
  const [boomKey, setBoomKey] = useState(0);
  const [celebrateKey, setCelebrateKey] = useState(0);
  const lastStatus = useRef(round?.status);

  const live = phase === 'live';
  const currency = snap?.currency ?? 'ZAR';
  const multiplier = round?.multiplier ?? 0;
  const slices = round?.slices ?? [];

  // Confetti when a round is won (not when a finished round is restored on load).
  useEffect(() => {
    const status = round?.status;
    if (lastStatus.current === 'live' && (status === 'cashed' || status === 'maxed')) setCelebrateKey((k) => k + 1);
    lastStatus.current = status;
  }, [round?.status]);

  // Keep the stake inside the table limits once the server sends them.
  const minBet = snap?.limits.minBet;
  const maxBet = snap?.limits.maxBet;
  useEffect(() => {
    if (minBet !== undefined && maxBet !== undefined) setAmount((a) => Math.min(maxBet, Math.max(minBet, a)));
  }, [minBet, maxBet]);

  // Keyboard: Space plays or cashes out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (modal || (e.target as HTMLElement).tagName === 'INPUT' || e.code !== 'Space') return;
      e.preventDefault();
      if (e.repeat) return;
      if (live) {
        if (multiplier > 0 && game.pending === 0 && !game.closing) actions.cashOut();
      } else if (phase !== 'loading' && game.pending === 0) actions.bet(amount);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, live, phase, multiplier, amount, actions, game.pending, game.closing]);

  const toggleSound = () => {
    sound.setMuted(!muted);
    setMuted(!muted);
  };

  const juices = slices.filter((s) => !s.bomb).map((s) => FRUITS[s.fruit].juice);
  const chain = slices.slice(-CHAIN_MAX);

  return (
    <div className="game-root">
      <Hud
        balance={snap?.balance ?? 0}
        currency={currency}
        demo={demo}
        muted={muted}
        onToggleSound={toggleSound}
        onRules={() => setModal('rules')}
        onHistory={() => setModal('history')}
        onFairness={() => setModal('fairness')}
      />

      <main className="stage">
        <ArenaView
          mode={MODE[phase]}
          sliceEnabled={live && !game.closing}
          keyboard={modal === null}
          celebrateKey={celebrateKey}
          celebrateColors={[...new Set(juices), '#ffd23f', '#a6ff4d']}
          onSlice={actions.slice}
          onExplode={() => setBoomKey((k) => k + 1)}
        >
          <div className="stage-top">
            {live &&
              (multiplier > 0 ? (
                <div className="mult">
                  <b key={multiplier} className="mult-value">
                    {formatMultiplier(multiplier)}
                  </b>
                  <span>{formatMoney(payoutFor(round!.bet, multiplier), currency)}</span>
                </div>
              ) : (
                <div className="mult waiting">
                  <b className="mult-value">SLICE!</b>
                  <span>Any fruit might hide a bomb</span>
                </div>
              ))}
            {chain.length > 0 && (live || phase === 'ended') && (
              <div className="chain" aria-label="Sliced this round">
                {slices.length > CHAIN_MAX && <em>+{slices.length - CHAIN_MAX}</em>}
                {chain.map((s, i) =>
                  s.bomb ? (
                    <BombIcon key={slices.length - chain.length + i} className="chain-bomb" width={26} height={26} />
                  ) : (
                    <FruitIcon key={slices.length - chain.length + i} kind={s.fruit} size={26} />
                  ),
                )}
              </div>
            )}
          </div>

          {(phase === 'idle' || phase === 'ended') && game.resting && (
            <div className="idle-card">
              <h1>
                Slice fruit. <span>Dodge bombs.</span> Cash out.
              </h1>
              <p>Riskier fruit adds a bigger boost. Press PLAY to start.</p>
            </div>
          )}

          {live && slices.length === 0 && <div className="hint">Swipe through a fruit to slice it</div>}

          <ResultOverlay round={round} currency={currency} visible={game.showResult} onClose={actions.dismissResult} />
        </ArenaView>
      </main>

      <Paytable round={round} previewBet={amount} currency={currency} />

      <BetPanel
        phase={phase}
        round={round}
        amount={amount}
        setAmount={setAmount}
        balance={snap?.balance ?? 0}
        currency={currency}
        limits={snap?.limits ?? { minBet: 1, maxBet: 500 }}
        pending={game.pending}
        closing={game.closing}
        onBet={() => actions.bet(amount)}
        onCashOut={actions.cashOut}
        onRefill={demo ? actions.refill : undefined}
      />

      {boomKey > 0 && <div key={boomKey} className="boom-flash" aria-hidden />}

      {game.error && (
        <div className="toast" role="alert">
          {game.error}
        </div>
      )}

      {modal === 'rules' && <RulesModal onClose={() => setModal(null)} />}
      {(modal === 'history' || modal === 'fairness') && snap && (
        <HistoryModal
          snap={snap}
          initialTab={modal}
          canChangeSeed={!live}
          onSetClientSeed={actions.setClientSeed}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
