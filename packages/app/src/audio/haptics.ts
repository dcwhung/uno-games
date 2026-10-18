/**
 * haptics.ts — `navigator.vibrate` patterns for the human's own moments (design §2.6).
 *
 * `hapticFor` is the pure, tested half; `vibrate` is the guarded side effect.
 * Bots' actions never buzz the phone: a buzz means "you did / got this".
 */
import type { GameEvent, PlayerId } from '@uno/engine';

export type HapticPattern = readonly number[];

export const HAPTIC_CARD: HapticPattern = [10];
export const HAPTIC_UNO: HapticPattern = [30];
export const HAPTIC_CAUGHT: HapticPattern = [20, 20, 20];

export function hapticFor(event: GameEvent, humanId: PlayerId): HapticPattern | undefined {
    switch (event.type) {
        case 'CardPlayed':
            return event.player === humanId ? HAPTIC_CARD : undefined;
        case 'UnoCalled':
            return event.player === humanId ? HAPTIC_UNO : undefined;
        case 'UnoCaught':
            return event.player === humanId ? HAPTIC_CAUGHT : undefined;
        default:
            return undefined;
    }
}

/** No-op where the Vibration API is missing (desktop, iOS Safari) or blocked. */
export function vibrate(pattern: HapticPattern): void {
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
        navigator.vibrate([...pattern]);
    } catch {
        /* some browsers throw when vibration is disallowed without a gesture */
    }
}
