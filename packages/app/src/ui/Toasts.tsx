import { useEffect, useRef, useState } from 'react';
import type { GameEvent, GameState } from '@uno/engine';
import { t } from '../i18n';
import { playerName, useGameStore } from '../store/gameStore';
import { appendToasts, drainFreshToasts, expireToasts } from './toastQueue';
import type { Toast } from './toastQueue';

const TOAST_MS = 1800;

type TimerId = ReturnType<typeof setTimeout>;

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
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  // The cursor is a ref, not state: as state it re-ran the ingest effect,
  // whose cleanup cancelled the expiry timer before it ever fired (W-007).
  const lastSeqRef = useRef(0);
  const timersRef = useRef(new Map<number, TimerId>());

  useEffect(() => {
    if (!state) return;
    const drained = drainFreshToasts(events, lastSeqRef.current, (e) => describe(state, e));
    lastSeqRef.current = drained.lastSeq;
    if (drained.toasts.length > 0) setToasts((cur) => appendToasts(cur, drained.toasts));
  }, [events, state]);

  // One timer per toast, keyed by seq, so a later render never cancels an
  // earlier toast's expiry.
  useEffect(() => {
    const timers = timersRef.current;
    for (const toast of toasts) {
      if (timers.has(toast.seq)) continue;
      timers.set(toast.seq, setTimeout(() => {
        timers.delete(toast.seq);
        setToasts((cur) => expireToasts(cur, [toast.seq]));
      }, TOAST_MS));
    }
  }, [toasts]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, []);

  return (
    <div className="toasts">
      {toasts.map((x) => <div key={x.seq} className="toast">{x.text}</div>)}
    </div>
  );
}
