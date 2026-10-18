/**
 * useStatsTracker.ts — persists the lifetime stats as rounds and games end.
 *
 * Reads the stored value on every milestone rather than caching it, so a
 * second tab or a cleared storage never makes this one overwrite with stale
 * counts. The lobby re-reads on mount, which is when the line can change.
 */
import { useCallback } from 'react';

import { HUMAN_ID } from '../store/gameStore';
import type { StampedEvent } from '../store/gameStore';
import { useFreshEvents } from '../ui/useFreshEvents';
import { loadStats, saveStats } from './settings';
import { applyEvent } from './statsTracker';

export function useStatsTracker(): void {
    useFreshEvents(
        useCallback((batch: readonly StampedEvent[]) => {
            const before = loadStats();
            const after = batch.reduce(
                (stats, { event }) => applyEvent(stats, event, HUMAN_ID),
                before,
            );
            if (after !== before) saveStats(after);
        }, []),
    );
}
