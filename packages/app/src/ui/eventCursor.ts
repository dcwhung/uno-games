/**
 * eventCursor.ts — pure seq-cursor over the store's stamped event stream.
 *
 * Every consumer of game events (toasts, callouts, sound, stats) needs the same
 * bookkeeping: take only the events newer than the last one seen, map them, and
 * move the cursor past everything — silent events included — so nothing is
 * ever re-scanned (W-007). Kept free of React so it is testable in node.
 */
import type { GameEvent } from '@uno/engine';

import type { StampedEvent } from '../store/gameStore';

export interface DrainResult<T> {
    readonly items: readonly T[];
    readonly lastSeq: number;
}

/** Maps an event to an item; `undefined` means the event is ignored. */
export type EventMapper<T> = (event: GameEvent, seq: number) => T | undefined;

export function drainFreshEvents<T>(
    events: readonly StampedEvent[],
    lastSeq: number,
    map: EventMapper<T>,
): DrainResult<T> {
    const fresh = events.filter((e) => e.seq > lastSeq);
    const newest = fresh[fresh.length - 1];
    if (!newest) return { items: [], lastSeq };

    const items = fresh.flatMap((e) => {
        const item = map(e.event, e.seq);
        return item === undefined ? [] : [item];
    });
    return { items, lastSeq: newest.seq };
}
