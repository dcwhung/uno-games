/**
 * statsTracker.ts — pure fold of game events into the persisted `Stats`.
 *
 * Kept free of storage and React so the counting rules can be unit-tested.
 * `useStatsTracker` wires it to the store's event stream and to `saveStats`.
 */
import type { GameEvent, PlayerId } from '@uno/engine';

import type { Stats } from './settings';

/**
 * Returns the stats after `event`. The same object comes back for events that
 * are not milestones, so callers can skip the write with a reference check.
 */
export function applyEvent(stats: Stats, event: GameEvent, humanId: PlayerId): Stats {
    switch (event.type) {
        case 'RoundEnded':
            return event.winner === humanId ? { ...stats, roundsWon: stats.roundsWon + 1 } : stats;
        case 'GameEnded':
            // A game counts as played once it is finished; quitting mid-game is not a loss.
            return {
                ...stats,
                gamesPlayed: stats.gamesPlayed + 1,
                gamesWon: event.winner === humanId ? stats.gamesWon + 1 : stats.gamesWon,
            };
        default:
            return stats;
    }
}
