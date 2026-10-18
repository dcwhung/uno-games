/**
 * roundSummary.ts — rows for the round-over / game-over sheet (design §2.4).
 *
 * Pure: names and seat colours come in as lookups so the builder needs neither
 * i18n nor the scene palette, and the sheet stays a thin renderer.
 */
import type { GameEvent, GameState, PlayerId } from '@uno/engine';

export interface RoundRow {
    readonly id: PlayerId;
    readonly name: string;
    readonly color: string;
    readonly cardsLeft: number;
    readonly roundPoints: number;
    readonly total: number;
    readonly winner: boolean;
}

export type RoundEndedEvent = Extract<GameEvent, { type: 'RoundEnded' }>;

const NO_POINTS = 0;

/** Leaderboard order: highest total first, seat order on ties. */
function byTotalThenSeat(a: RoundRow, b: RoundRow, seatIndex: (id: PlayerId) => number): number {
    return b.total - a.total || seatIndex(a.id) - seatIndex(b.id);
}

export function buildRoundRows(
    state: GameState,
    roundPoints: number,
    nameOf: (id: PlayerId) => string,
    colorOf: (id: PlayerId) => string,
): readonly RoundRow[] {
    const winner = state.gameWinner ?? state.roundWinner;
    const seatIndex = (id: PlayerId) => state.players.findIndex((p) => p.id === id);
    const rows = state.players.map((p): RoundRow => ({
        id: p.id,
        name: nameOf(p.id),
        color: colorOf(p.id),
        cardsLeft: p.hand.length,
        roundPoints: p.id === winner ? roundPoints : NO_POINTS,
        total: p.score,
        winner: p.id === winner,
    }));
    return [...rows].sort((a, b) => byTotalThenSeat(a, b, seatIndex));
}

/** The most recent round result, which carries the points the winner banked. */
export function lastRoundEnded(events: readonly GameEvent[]): RoundEndedEvent | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        if (event?.type === 'RoundEnded') return event;
    }
    return undefined;
}
