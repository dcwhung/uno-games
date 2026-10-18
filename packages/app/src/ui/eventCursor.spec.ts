import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@uno/engine';

import type { StampedEvent } from '../store/gameStore';
import { drainFreshEvents } from './eventCursor';

const NO_CURSOR = 0;
const SILENT_SEQ = 2;

// `type` is all the mapper under test looks at; the rest of the event
// payload is irrelevant to cursor behaviour.
const REVERSED: GameEvent = { type: 'DirectionReversed' } as GameEvent;
const RESHUFFLED: GameEvent = { type: 'DrawPileReshuffled' } as GameEvent;

function stamped(seq: number, event: GameEvent = REVERSED): StampedEvent {
    return { seq, event };
}

/** Echo mapper: every event becomes an item except the silent seq. */
function mapBySeq(_event: GameEvent, seq: number): string | undefined {
    return seq === SILENT_SEQ ? undefined : `item-${seq}`;
}

describe('drainFreshEvents', () => {
    const EVENTS = [stamped(1), stamped(2, RESHUFFLED), stamped(3)];

    it('should skip events at or below the cursor', () => {
        const { items } = drainFreshEvents(EVENTS, 2, mapBySeq);

        expect(items).toEqual(['item-3']);
    });

    it('should advance the cursor to the newest event even when nothing is mapped', () => {
        const { lastSeq } = drainFreshEvents([stamped(SILENT_SEQ)], NO_CURSOR, mapBySeq);

        expect(lastSeq).toBe(SILENT_SEQ);
    });

    it('should keep the cursor unchanged when there are no fresh events', () => {
        const { items, lastSeq } = drainFreshEvents(EVENTS, 3, mapBySeq);

        expect(items).toEqual([]);
        expect(lastSeq).toBe(3);
    });

    it('should not produce duplicates when the same events are drained twice', () => {
        const first = drainFreshEvents(EVENTS, NO_CURSOR, mapBySeq);
        const second = drainFreshEvents(EVENTS, first.lastSeq, mapBySeq);

        expect(first.items).toEqual(['item-1', 'item-3']);
        expect(second.items).toEqual([]);
    });
});
