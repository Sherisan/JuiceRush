import { useCallback, useEffect, useRef, useState } from 'react';
import type { FruitApi, Snapshot } from './engine';
import type { FruitKind } from './math';
import { sound } from './sound';

export type Phase = 'loading' | 'idle' | 'live' | 'ended';
/** What a slice turned out to be. `void`: it never counted (round already over, or the request failed). */
export type SliceOutcome = 'safe' | 'bomb' | 'void';

/** Minimum time a sliced fruit hangs in the air before it reveals juice or a bomb. */
const SLICE_SUSPENSE_MS = 240;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastOf = <T,>(a: T[]): T | undefined => a[a.length - 1];

export function useGame(api: FruitApi) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState(0);
  const [closing, setClosing] = useState(false);
  const [showResult, setShowResult] = useState(false);
  /** Between rounds with nothing left to show: no round yet, or the last result was dismissed. */
  const [resting, setResting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pendingRef = useRef(0);
  const resultTimer = useRef<number>();

  const commit = useCallback((next: Snapshot) => {
    snapRef.current = next;
    setSnap(next);
    if (next.round?.status === 'live') setResting(false);
  }, []);

  useEffect(() => {
    api.init().then(commit, (e: Error) => setError(e.message));
  }, [api, commit]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 3200);
    return () => clearTimeout(t);
  }, [error]);

  /**
   * Every server call goes through one queue, so slices made in quick succession (one swipe through three
   * fruits) resolve strictly in the order they were cut, and a cash-out can never overtake a slice.
   */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    pendingRef.current += 1;
    setPending(pendingRef.current);
    const p = queue.current.then(task).finally(() => {
      pendingRef.current -= 1;
      setPending(pendingRef.current);
    });
    queue.current = p.catch(() => undefined);
    return p;
  }, []);

  /** Sounds and the result card for a round that just ended. The explosion itself is drawn and voiced by the arena. */
  const finish = useCallback((next: Snapshot) => {
    const status = next.round?.status;
    if (!status || status === 'live') return;
    if (status === 'cashed') sound.cash();
    else if (status === 'maxed') sound.jackpot();
    clearTimeout(resultTimer.current);
    const delay = status === 'exploded' ? 1500 : status === 'maxed' ? 900 : 450;
    resultTimer.current = window.setTimeout(() => setShowResult(true), delay);
  }, []);

  /**
   * After a failed call, re-read the server's state: the round may have moved on without us (the server cashes out a
   * round left idle for 10 minutes). Called from inside the queue, so it can't race another call.
   */
  const resync = useCallback(async () => {
    try {
      const was = snapRef.current?.round;
      const next = await api.init();
      commit(next);
      if (was?.status === 'live' && next.round?.id === was.id) finish(next);
    } catch {
      /* still unreachable: keep what we have */
    }
  }, [api, commit, finish]);

  const bet = useCallback(
    (amount: number) =>
      enqueue(async () => {
        try {
          const next = await api.bet(amount);
          clearTimeout(resultTimer.current);
          setShowResult(false);
          commit(next);
          sound.start();
        } catch (e) {
          setError((e as Error).message);
          await resync();
        }
      }),
    [api, enqueue, commit, resync],
  );

  const slice = useCallback(
    (fruit: FruitKind): Promise<SliceOutcome> =>
      enqueue(async (): Promise<SliceOutcome> => {
        if (snapRef.current?.round?.status !== 'live') return 'void';
        try {
          const [next] = await Promise.all([api.slice(fruit), wait(SLICE_SUSPENSE_MS)]);
          commit(next);
          finish(next);
          return lastOf(next.round?.slices ?? [])?.bomb ? 'bomb' : 'safe';
        } catch (e) {
          setError((e as Error).message);
          await resync();
          return 'void';
        }
      }),
    [api, enqueue, commit, finish, resync],
  );

  const cashOut = useCallback(() => {
    setClosing(true);
    return enqueue(async () => {
      try {
        if (snapRef.current?.round?.status !== 'live') return;
        const next = await api.cashOut();
        commit(next);
        finish(next);
      } catch (e) {
        setError((e as Error).message);
        await resync();
      } finally {
        setClosing(false);
      }
    });
  }, [api, enqueue, commit, finish, resync]);

  const setClientSeed = useCallback(
    (seed: string) =>
      enqueue(async () => {
        try {
          commit(await api.setClientSeed(seed));
        } catch (e) {
          setError((e as Error).message);
        }
      }),
    [api, enqueue, commit],
  );

  const refill = useCallback(
    () =>
      enqueue(async () => {
        try {
          if (api.refill) commit(await api.refill());
        } catch (e) {
          setError((e as Error).message);
        }
      }),
    [api, enqueue, commit],
  );

  const dismissResult = useCallback(() => {
    setShowResult(false);
    setResting(true);
  }, []);

  const round = snap?.round ?? null;
  const phase: Phase = !snap ? 'loading' : !round ? 'idle' : round.status === 'live' ? 'live' : 'ended';

  return {
    snap,
    round,
    phase,
    /** Calls queued or in flight. */
    pending,
    /** A cash-out has been requested: stop accepting slices. */
    closing,
    showResult,
    resting,
    error,
    actions: { bet, slice, cashOut, setClientSeed, refill, dismissResult },
  };
}

export type Game = ReturnType<typeof useGame>;
