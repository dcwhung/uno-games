/**
 * useSfx.ts — wires the store's event stream to the synth and the vibration API.
 *
 * `enabled` is the user's sound setting; haptics follow the same switch so one
 * toggle means "quiet". The audio context unlocks on any gesture and again
 * whenever the tab comes back into view (W-082).
 */
import { useCallback, useEffect } from 'react';

import { HUMAN_ID } from '../store/gameStore';
import type { StampedEvent } from '../store/gameStore';
import { useFreshEvents } from '../ui/useFreshEvents';
import { cueFor } from './cues';
import { hapticFor, vibrate } from './haptics';
import { play, setEnabled, unlock } from './sfx';

const UNLOCK_GESTURES = ['pointerdown', 'keydown'] as const;
const VISIBILITY_EVENT = 'visibilitychange';

/**
 * The listeners stay for the app's lifetime: `unlock()` is idempotent and
 * cheap, and iOS parks the context after every interruption, not just before
 * the first tap. Coming back to a visible tab re-arms it without a gesture.
 */
function useUnlockOnGestures(): void {
    useEffect(() => {
        const onVisible = () => {
            if (!document.hidden) unlock();
        };
        for (const type of UNLOCK_GESTURES)
            window.addEventListener(type, unlock, { passive: true });
        document.addEventListener(VISIBILITY_EVENT, onVisible);
        return () => {
            for (const type of UNLOCK_GESTURES) window.removeEventListener(type, unlock);
            document.removeEventListener(VISIBILITY_EVENT, onVisible);
        };
    }, []);
}

export function useSfx(enabled: boolean): void {
    useUnlockOnGestures();

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
