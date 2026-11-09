import { useEffect, useRef, type ReactNode } from 'react';
import { Arena, type ArenaMode } from '../game/arena';
import { FRUIT_ORDER, type FruitKind } from '../game/math';
import type { SliceOutcome } from '../game/useGame';

export function ArenaView({
  mode,
  sliceEnabled,
  keyboard,
  celebrateKey,
  celebrateColors,
  onSlice,
  onExplode,
  children,
}: {
  mode: ArenaMode;
  sliceEnabled: boolean;
  /** Keys 1–6 slice a fruit of that kind (in fruit-menu order). Off while a modal is open. */
  keyboard: boolean;
  /** Bump to fire the cash-out confetti. */
  celebrateKey: number;
  celebrateColors: string[];
  onSlice: (kind: FruitKind) => Promise<SliceOutcome>;
  onExplode: () => void;
  children?: ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<Arena | null>(null);
  const hooks = useRef({ onSlice, onExplode });
  hooks.current = { onSlice, onExplode };

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const arena = new Arena(canvas, wrap, {
      onSlice: (k) => hooks.current.onSlice(k),
      onExplode: () => hooks.current.onExplode(),
    });
    arenaRef.current = arena;
    if (import.meta.env.DEV) (window as unknown as { __arena?: Arena }).__arena = arena; // QA hook, dev only
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      arena.resize(r.width, r.height, Math.min(2, window.devicePixelRatio || 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    arena.start();
    return () => {
      ro.disconnect();
      arena.stop();
      arenaRef.current = null;
    };
  }, []);

  useEffect(() => arenaRef.current?.setMode(mode), [mode]);
  useEffect(() => arenaRef.current?.setSliceEnabled(sliceEnabled), [sliceEnabled]);

  useEffect(() => {
    if (!keyboard || !sliceEnabled) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || e.repeat) return;
      const kind = FRUIT_ORDER[Number(e.key) - 1];
      if (kind) arenaRef.current?.sliceKind(kind);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard, sliceEnabled]);
  useEffect(() => {
    if (celebrateKey > 0) arenaRef.current?.celebrate(celebrateColors);
  }, [celebrateKey]); // colours are read at the moment of the burst only

  const at = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div className="arena" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="arena-canvas"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          arenaRef.current?.pointerDown(...at(e));
        }}
        onPointerMove={(e) => {
          const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
          for (const ev of events.length ? events : [e.nativeEvent]) arenaRef.current?.pointerMove(...at(ev));
        }}
        onPointerUp={() => arenaRef.current?.pointerUp()}
        onPointerCancel={() => arenaRef.current?.pointerUp()}
        onContextMenu={(e) => e.preventDefault()}
      />
      {children}
    </div>
  );
}
