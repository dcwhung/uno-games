/**
 * useSfx.ts — wires the store's event stream to the synth and the vibration API.
 *
 * `enabled` is the user's sound setting; haptics follow the same switch so one
 * toggle means "quiet". The audio context unlocks on the first gesture anywhere.
 */
import { useCallback, useEffect } from 'react';

import { HUMAN_ID } from '../store/gameStore';
import type { StampedEvent } from '../store/gameStore';
import { useFreshEvents } from '../ui/useFreshEvents';
import { cueFor } from './cues';
import { hapticFor, vibrate } from './haptics';
import { play, setEnabled, unlock } from './sfx';

const UNLOCK_GESTURES = ['pointerdown', 'keydown'] as const;

function useUnlockOnFirstGesture(): void {
    useEffect(() => {
        const unlockOnce = () => {
            unlock();
            for (const type of UNLOCK_GESTURES) window.removeEventListener(type, unlockOnce);
        };
        for (const type of UNLOCK_GESTURES)
            window.addEventListener(type, unlockOnce, { passive: true });
        return () => {
            for (const type of UNLOCK_GESTURES) window.removeEventListener(type, unlockOnce);
        };
    }, []);
}

export function useSfx(enabled: boolean): void {
    useUnlockOnFirstGesture();

    useEffect(() => {
        setEnabled(enabled);
    }, [enabled]);

    useFreshEvents(
        useCallback(
            (batch: readonly StampedEvent[]) => {
                for (const { event } of batch) {
                    const cue = cueFor(event, HUMAN_ID);
                    if (cue) play(cue);
                    const pattern = hapticFor(event, HUMAN_ID);
                    if (pattern && enabled) vibrate(pattern);
                }
            },
            [enabled],
        ),
    );
}
