import { useState } from 'react';
import type { HistoryEntry, Snapshot } from '../game/engine';
import { isBomb, rollFor, sha256Hex } from '../game/fair';
import { FRUITS, multiplierFor, payoutFor } from '../game/math';
import { formatMoney, formatMultiplier } from '../game/money';
import { FruitIcon } from './FruitIcon';
import { BombIcon, CheckIcon } from './Icons';
import { Modal } from './Modal';

type Tab = 'history' | 'fairness';
type Verdict = 'pending' | 'ok' | 'bad';

const RESULT_LABEL = { cashed: 'Cashed', maxed: 'Max win', exploded: 'Boom' } as const;

/** Recompute the seed hash, every roll, and the payout from the revealed seed. */
async function verify(e: HistoryEntry): Promise<boolean> {
  if ((await sha256Hex(e.serverSeed)) !== e.serverSeedHash) return false;
  for (let i = 0; i < e.slices.length; i++) {
    const s = e.slices[i];
    const roll = await rollFor(e.serverSeed, e.clientSeed, e.nonce, i, s.fruit);
    if (roll !== s.roll || isBomb(s.fruit, roll) !== s.bomb) return false;
    if (s.bomb && i !== e.slices.length - 1) return false;
  }
  if (e.status === 'exploded') return e.payout === 0 && e.slices[e.slices.length - 1]?.bomb === true;
  // The server closes a round left idle before its first slice by returning the stake: ×1.
  if (e.slices.length === 0) return e.status === 'cashed' && e.multiplier === 1 && e.payout === e.bet;
  const m = multiplierFor(e.slices.map((s) => s.fruit));
  return m === e.multiplier && payoutFor(e.bet, m) === e.payout;
}

export function HistoryModal({
  snap,
  initialTab,
  canChangeSeed,
  onSetClientSeed,
  onClose,
}: {
  snap: Snapshot;
  initialTab: Tab;
  canChangeSeed: boolean;
  onSetClientSeed: (seed: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [open, setOpen] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [seed, setSeed] = useState(snap.fairness.clientSeed);
  const cur = snap.currency;

  const runVerify = async (e: HistoryEntry) => {
    setVerdicts((v) => ({ ...v, [e.id]: 'pending' }));
    let ok = false;
    try {
      ok = await verify(e);
    } catch {
      ok = false;
    }
    setVerdicts((v) => ({ ...v, [e.id]: ok ? 'ok' : 'bad' }));
  };

  return (
    <Modal title={tab === 'history' ? 'BET HISTORY' : 'PROVABLY FAIR'} onClose={onClose}>
      <div className="tabs">
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          History
        </button>
        <button className={tab === 'fairness' ? 'on' : ''} onClick={() => setTab('fairness')}>
          Fairness
        </button>
      </div>

      {tab === 'history' ? (
        snap.history.length === 0 ? (
          <p className="muted">No rounds yet. Press PLAY to get started.</p>
        ) : (
          <ul className="history">
            {snap.history.map((e) => (
              <li key={e.id} className={`h-row h-${e.status}`}>
                <button className="h-main" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <span className="h-time">{new Date(e.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="h-chain">
                    {e.slices.slice(0, 12).map((s, i) =>
                      s.bomb ? <BombIcon key={i} width={18} height={18} /> : <FruitIcon key={i} kind={s.fruit} size={18} />,
                    )}
                    {e.slices.length > 12 && <em>+{e.slices.length - 12}</em>}
                  </span>
                  <span className="h-result">{e.status === 'exploded' ? RESULT_LABEL.exploded : formatMultiplier(e.multiplier)}</span>
                  <span className="h-pay">{e.payout > 0 ? `+${formatMoney(e.payout, cur)}` : `−${formatMoney(e.bet, cur)}`}</span>
                </button>
                {open === e.id && (
                  <div className="h-detail">
                    <dl>
                      <dt>Bet</dt>
                      <dd>{formatMoney(e.bet, cur)}</dd>
                      <dt>Result</dt>
                      <dd>
                        {RESULT_LABEL[e.status]}
                        {e.status !== 'exploded' && ` at ${formatMultiplier(e.multiplier)}`}
                      </dd>
                      <dt>Slices</dt>
                      <dd>
                        <ol className="h-slices">
                          {e.slices.map((s, i) => (
                            <li key={i} className={s.bomb ? 'bomb' : ''}>
                              #{i} {FRUITS[s.fruit].name}: roll {s.roll} of {FRUITS[s.fruit].outOf}, {s.bomb ? 'bomb' : 'safe'}
                            </li>
                          ))}
                        </ol>
                      </dd>
                      <dt>Server seed</dt>
                      <dd className="mono">{e.serverSeed}</dd>
                      <dt>Seed hash</dt>
                      <dd className="mono">{e.serverSeedHash}</dd>
                      <dt>Client seed</dt>
                      <dd className="mono">{e.clientSeed}</dd>
                      <dt>Nonce</dt>
                      <dd className="mono">{e.nonce}</dd>
                    </dl>
                    <button className={`verify ${verdicts[e.id] ?? ''}`} onClick={() => runVerify(e)} disabled={verdicts[e.id] === 'pending'}>
                      {verdicts[e.id] === 'ok' ? (
                        <>
                          <CheckIcon width={16} height={16} /> Verified
                        </>
                      ) : verdicts[e.id] === 'bad' ? (
                        'Verification failed'
                      ) : (
                        'Verify round'
                      )}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="fair">
          <p className="muted">
            Before every round you see a SHA-256 hash of the secret server seed. Slice number <i>i</i> rolls
            <code> HMAC_SHA256(serverSeed, clientSeed:nonce:i) → 0…n−1</code>, where <i>n</i> is the fruit's odds
            denominator. A roll below the fruit's bomb count is a bomb. When the round ends the server seed is revealed, so
            you can check it matches the hash and gives the same rolls.
          </p>
          <label>Next server seed (hashed)</label>
          <div className="mono field">{snap.fairness.serverSeedHash}</div>
          <label htmlFor="client-seed">Client seed</label>
          <div className="seed-row">
            <input id="client-seed" className="mono field" value={seed} onChange={(e) => setSeed(e.target.value)} disabled={!canChangeSeed} />
            <button
              className="btn"
              disabled={!canChangeSeed || seed.trim() === snap.fairness.clientSeed}
              onClick={() => onSetClientSeed(seed)}
            >
              Change
            </button>
          </div>
          <label>Nonce</label>
          <div className="mono field">{snap.fairness.nonce}</div>
        </div>
      )}
    </Modal>
  );
}
