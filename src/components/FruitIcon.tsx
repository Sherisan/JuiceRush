import { useMemo } from 'react';
import { fruitIconUrl } from '../game/art';
import { FRUITS, type FruitKind } from '../game/math';

/** The canvas-drawn fruit as an <img>, so the DOM shows exactly the art the arena tosses. */
export function FruitIcon({ kind, size = 32, className }: { kind: FruitKind; size?: number; className?: string }) {
  const src = useMemo(() => fruitIconUrl(kind, size), [kind, size]);
  return <img className={className} src={src} width={size} height={size} alt={FRUITS[kind].name} draggable={false} />;
}
