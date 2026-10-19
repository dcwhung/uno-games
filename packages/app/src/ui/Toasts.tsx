/**
 * Toasts.tsx — small pills for minor events only (drew N, reshuffled, can't
 * play that). Big moments are <Callouts />. Sits bottom-centre above the fan.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent, GameState } from '@uno/engine';

import { t } from '../i18n';
import { playerName } from '../store/gameStore';
import type { StampedEvent } from '../store/gameStore';
import { TOAST_MS, appendToasts, expireToasts } from './toastQueue';
import type { Toast } from './toastQueue';
import { useFreshEvents } from './useFreshEvents';

type TimerId = ReturnType<typeof setTimeout>;

function describe(state: GameState, e: GameEvent): string | undefined {
    switch (e.type) {
        case 'CardDrawn':
            return e.reason === 'turn'
                ? undefined
                : t('toast.drew', { name: playerName(state, e.player), n: e.cards.length });
        case 'DrawPileReshuffled':
            return t('toast.reshuffled');
        case 'ActionRejected':
            return e.reason === 'illegal_card' ? t('toast.rejected') : undefined;
        default:
            return undefined;
    }
}

function toastsFrom(batch: readonly StampedEvent[], state: GameState): readonly Toast[] {
    return batch.flatMap(({ event, seq }) => {
        const text = describe(state, event);
        return text === undefined ? [] : [{ seq, text }];
    });
}

export function Toasts() {
    const [toasts, setToasts] = useState<readonly Toast[]>([]);
    const timersRef = useRef(new Map<number, TimerId>());

    useFreshEvents(
        useCallback((batch: readonly StampedEvent[], state: GameState) => {
            const fresh = toastsFrom(batch, state);
            if (fresh.length > 0) setToasts((cur) => appendToasts(cur, fresh));
        }, []),
    );

    // One timer per toast, keyed by seq, so a later render never cancels an
    // earlier toast's expiry.
    useEffect(() => {
        const timers = timersRef.current;
        for (const toast of toasts) {
            if (timers.has(toast.seq)) continue;
            const timer = setTimeout(() => {
                timers.delete(toast.seq);
                setToasts((cur) => expireToasts(cur, [toast.seq]));
            }, TOAST_MS);
            timers.set(toast.seq, timer);
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
        <div className="toasts" role="status" aria-live="polite">
            {toasts.map((x) => (
                <div key={x.seq} className="toast">
                    {x.text}
                </div>
            ))}
        </div>
    );
}
