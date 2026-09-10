import { useEffect, useState } from 'react';
import type { GameEvent, GameState } from '@uno/engine';
import { t } from '../i18n';
import { playerName, useGameStore } from '../store/gameStore';

const TOAST_MS = 1800;
const MAX_TOASTS = 3;

interface Toast { readonly seq: number; readonly text: string }

function describe(state: GameState, e: GameEvent): string | undefined {
  const name = (id: Parameters<typeof playerName>[1]) => playerName(state, id);
  switch (e.type) {
    case 'TurnSkipped': return t('toast.skipped', { name: name(e.player) });
    case 'DirectionReversed': return t('toast.reversed');
    case 'CardDrawn': return e.reason === 'turn' ? undefined : t('toast.drew', { name: name(e.player), n: e.cards.length });
    case 'UnoCalled': return t('toast.unoCalled', { name: name(e.player) });
    case 'UnoCaught': return t('toast.unoCaught', { catcher: name(e.by), name: name(e.player) });
    case 'Draw4Challenged': return e.succeeded ? t('toast.challengeWon', { name: name(e.by) }) : t('toast.challengeLost', { name: name(e.by) });
    case 'DrawPileReshuffled': return t('toast.reshuffled');
    case 'ActionRejected': return e.reason === 'illegal_card' ? t('toast.rejected') : undefined;
    default: return undefined;
  }
}

export function Toasts() {
  const events = useGameStore((s) => s.events);
  const state = useGameStore((s) => s.state);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastSeq, setLastSeq] = useState(0);

  useEffect(() => {
    if (!state) return;
    const fresh = events.filter((e) => e.seq > lastSeq);
    if (fresh.length === 0) return;
    const next = fresh.flatMap((e) => { const text = describe(state, e.event); return text ? [{ seq: e.seq, text }] : []; });
    setLastSeq(fresh[fresh.length - 1]!.seq);
    if (next.length === 0) return;
    setToasts((cur) => [...cur, ...next].slice(-MAX_TOASTS));
    const timer = setTimeout(() => setToasts((cur) => cur.filter((x) => !next.some((n) => n.seq === x.seq))), TOAST_MS);
    return () => clearTimeout(timer);
  }, [events, state, lastSeq]);

  return (
    <div className="toasts">
      {toasts.map((x) => <div key={x.seq} className="toast">{x.text}</div>)}
    </div>
  );
}
