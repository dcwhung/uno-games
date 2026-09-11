/**
 * toastQueue.ts — pure helpers behind <Toasts />.
 *
 * Kept free of React so the seq-cursor bookkeeping (the part that went wrong
 * in W-007) can be unit-tested in node without jsdom.
 */
import type { GameEvent } from '@uno/engine';

import type { StampedEvent } from '../store/gameStore';

export const MAX_TOASTS = 3;

export interface Toast {
    readonly seq: number;
    readonly text: string;
}

export interface DrainResult {
    readonly toasts: readonly Toast[];
    readonly lastSeq: number;
}

/** Maps an event to toast copy; `undefined` means the event stays silent. */
export type ToastDescriber = (event: GameEvent, seq: number) => string | undefined;

/**
 * Turns every event newer than `lastSeq` into toasts and returns the advanced
 * cursor. The cursor moves past silent events too, so they are never re-scanned.
 */
export function drainFreshToasts(
    events: readonly StampedEvent[],
    lastSeq: number,
    describe: ToastDescriber,
): DrainResult {
    const fresh = events.filter((e) => e.seq > lastSeq);
    const newest = fresh[fresh.length - 1];
    if (!newest) return { toasts: [], lastSeq };

    const toasts = fresh.flatMap((e) => {
        const text = describe(e.event, e.seq);
        return text === undefined ? [] : [{ seq: e.seq, text }];
    });
    return { toasts, lastSeq: newest.seq };
}

/** Appends and drops the oldest entries so at most MAX_TOASTS stay on screen. */
export function appendToasts(
    queue: readonly Toast[],
    incoming: readonly Toast[],
): readonly Toast[] {
    return [...queue, ...incoming].slice(-MAX_TOASTS);
}

export function expireToasts(queue: readonly Toast[], seqs: readonly number[]): readonly Toast[] {
    return queue.filter((x) => !seqs.includes(x.seq));
}
