/**
 * Callouts.tsx — the big centred word for Skip / Reverse / +2 / +4 / UNO! /
 * Caught! / Challenge won or lost (design §2.4). One word at a time; a newer
 * batch replaces the current word and restarts the pop via the `key`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState } from '@uno/engine';

import { t } from '../i18n';
import type { StampedEvent } from '../store/gameStore';
import { CALLOUT_TOTAL_MS, calloutFor, pickCallout } from './callouts';
import type { Callout } from './callouts';
import { useFreshEvents } from './useFreshEvents';

type TimerId = ReturnType<typeof setTimeout>;

interface ShownCallout {
    readonly callout: Callout;
    readonly seq: number;
}

export function Callouts() {
    const [shown, setShown] = useState<ShownCallout | undefined>(undefined);
    const timerRef = useRef<TimerId | undefined>(undefined);

    useFreshEvents(
        useCallback((batch: readonly StampedEvent[], state: GameState) => {
            const candidates = batch.flatMap((e) => calloutFor(e.event, state.activeColor) ?? []);
            const picked = pickCallout(candidates);
            const newest = batch[batch.length - 1];
            if (!picked || !newest) return;
            setShown({ callout: picked, seq: newest.seq });
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => setShown(undefined), CALLOUT_TOTAL_MS);
        }, []),
    );

    useEffect(() => () => clearTimeout(timerRef.current), []);

    return (
        <div className="callouts" aria-live="assertive" aria-atomic="true">
            {shown && (
                <div key={shown.seq} className={`callout ${shown.callout.color}`}>
                    {t(shown.callout.key)}
                </div>
            )}
        </div>
    );
}
