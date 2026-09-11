import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@uno/engine';

import type { StampedEvent } from '../store/gameStore';
import { MAX_TOASTS, appendToasts, drainFreshToasts, expireToasts } from './toastQueue';
import type { Toast } from './toastQueue';

const NO_CURSOR = 0;
const SILENT_SEQ = 2;
const SILENT_TEXT = undefined;

// `type` is all the describer under test looks at; the rest of the event
// payload is irrelevant to queue behaviour.
const REVERSED: GameEvent = { type: 'DirectionReversed' } as GameEvent;
const RESHUFFLED: GameEvent = { type: 'DrawPileReshuffled' } as GameEvent;

function stamped(seq: number, event: GameEvent = REVERSED): StampedEvent {
    return { seq, event };
}

function toast(seq: number): Toast {
    return { seq, text: `toast-${seq}` };
}

/** Echo describer: every event becomes a toast except the silent seq. */
function describeBySeq(seq: number): string | undefined {
    return seq === SILENT_SEQ ? SILENT_TEXT : `toast-${seq}`;
}

describe('drainFreshToasts', () => {
    const EVENTS = [stamped(1), stamped(2, RESHUFFLED), stamped(3)];

    it('should skip events at or below the cursor', () => {
        const { toasts } = drainFreshToasts(EVENTS, 2, (_e, seq) => describeBySeq(seq));

        expect(toasts.map((x) => x.seq)).toEqual([3]);
    });

    it('should advance the cursor to the newest event even when nothing is described', () => {
        const { lastSeq } = drainFreshToasts([stamped(SILENT_SEQ)], NO_CURSOR, (_e, seq) =>
            describeBySeq(seq),
        );

        expect(lastSeq).toBe(SILENT_SEQ);
    });

    it('should keep the cursor unchanged when there are no fresh events', () => {
        const { toasts, lastSeq } = drainFreshToasts(EVENTS, 3, (_e, seq) => describeBySeq(seq));

        expect(toasts).toEqual([]);
        expect(lastSeq).toBe(3);
    });

    it('should not produce duplicates when the same events are drained twice', () => {
        const first = drainFreshToasts(EVENTS, NO_CURSOR, (_e, seq) => describeBySeq(seq));
        const second = drainFreshToasts(EVENTS, first.lastSeq, (_e, seq) => describeBySeq(seq));

        expect(first.toasts.map((x) => x.seq)).toEqual([1, 3]);
        expect(second.toasts).toEqual([]);
    });
});

describe('appendToasts', () => {
    it('should keep only the newest MAX_TOASTS entries', () => {
        const queue = [toast(1), toast(2), toast(3)];
        const incoming = [toast(4), toast(5)];

        const next = appendToasts(queue, incoming);

        expect(next).toHaveLength(MAX_TOASTS);
        expect(next.map((x) => x.seq)).toEqual([3, 4, 5]);
    });
});

describe('expireToasts', () => {
    it('should remove only the toasts with the given seqs', () => {
        const queue = [toast(1), toast(2), toast(3)];

        expect(expireToasts(queue, [1, 3]).map((x) => x.seq)).toEqual([2]);
    });

    it('should return the same queue when nothing matches', () => {
        const queue = [toast(1)];

        expect(expireToasts(queue, [9])).toEqual(queue);
    });
});
