/**
 * useFreshEvents.ts — hand every new store event batch to a handler, once.
 *
 * The cursor is a ref, not state: as state it re-ran the ingest effect, whose
 * cleanup cancelled timers before they fired (W-007). The handler is read
 * through a ref too, so a new closure on every render never resets the cursor.
 * Batches are kept together because one action can emit several events (a
 * Draw Two is also a skip) and some consumers want to pick one of them.
 */
import { useEffect, useRef } from 'react';
import type { GameState } from '@uno/engine';

import { useGameStore } from '../store/gameStore';
import type { StampedEvent } from '../store/gameStore';
import { drainFreshEvents } from './eventCursor';

export type FreshEventsHandler = (batch: readonly StampedEvent[], state: GameState) => void;

const NO_EVENTS_SEEN = 0;

export function useFreshEvents(onEvents: FreshEventsHandler): void {
    const events = useGameStore((s) => s.events);
    const state = useGameStore((s) => s.state);
    const lastSeqRef = useRef(NO_EVENTS_SEEN);
    const handlerRef = useRef(onEvents);

    useEffect(() => {
        handlerRef.current = onEvents;
    }, [onEvents]);

    useEffect(() => {
        if (!state) return;
        const drained = drainFreshEvents(
            events,
            lastSeqRef.current,
            (event, seq): StampedEvent => ({ event, seq }),
        );
        lastSeqRef.current = drained.lastSeq;
        if (drained.items.length > 0) handlerRef.current(drained.items, state);
    }, [events, state]);
}
