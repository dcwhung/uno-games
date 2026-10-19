import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, PlayerId } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import { BOT_IDS, dealtState } from '../test/fixtures';
import { buildRoundRows, lastRoundEnded } from './roundSummary';

const [BOT_A, BOT_B] = BOT_IDS;
const ROUND_POINTS = 42;
const BOT_A_SCORE = 10;
const HUMAN_SCORE = 52;

/** A dealt table where the human just emptied their hand and banked ROUND_POINTS. */
function roundOver(): GameState {
    const state = dealtState();
    return {
        ...state,
        phase: 'round_over',
        roundWinner: HUMAN_ID,
        players: state.players.map((p) => {
            if (p.id === HUMAN_ID) return { ...p, hand: [], score: HUMAN_SCORE };
            if (p.id === BOT_A) return { ...p, score: BOT_A_SCORE };
            return p;
        }),
    };
}

const nameOf = (id: PlayerId): string => `name:${id}`;
const colorOf = (id: PlayerId): string => `color:${id}`;

describe('buildRoundRows', () => {
    it('should produce one row per seat, ordered by total with ties in seat order', () => {
        const rows = buildRoundRows(roundOver(), ROUND_POINTS, nameOf, colorOf);

        expect(rows.map((r) => r.id)).toEqual([HUMAN_ID, BOT_A, BOT_B]);
    });

    it('should give the winner the round points and everyone else zero', () => {
        const rows = buildRoundRows(roundOver(), ROUND_POINTS, nameOf, colorOf);

        expect(rows.map((r) => r.roundPoints)).toEqual([ROUND_POINTS, 0, 0]);
        expect(rows.map((r) => r.winner)).toEqual([true, false, false]);
    });

    it('should carry cards left, total, name and seat colour', () => {
        const state = roundOver();
        const [winner, second] = buildRoundRows(state, ROUND_POINTS, nameOf, colorOf);

        expect(winner).toMatchObject({
            cardsLeft: 0,
            total: HUMAN_SCORE,
            name: nameOf(HUMAN_ID),
            color: colorOf(HUMAN_ID),
        });
        expect(second?.cardsLeft).toBe(state.players[1]?.hand.length);
        expect(second?.total).toBe(BOT_A_SCORE);
    });

    it('should mark the game winner rather than the round winner at game over', () => {
        const state: GameState = { ...roundOver(), phase: 'game_over', gameWinner: BOT_B };

        const rows = buildRoundRows(state, ROUND_POINTS, nameOf, colorOf);

        expect(rows.find((r) => r.winner)?.id).toBe(BOT_B);
    });
});

describe('lastRoundEnded', () => {
    const first: GameEvent = { type: 'RoundEnded', winner: BOT_A, points: 1, scores: {} };
    const second: GameEvent = { type: 'RoundEnded', winner: HUMAN_ID, points: 2, scores: {} };
    const other: GameEvent = { type: 'TurnChanged', player: BOT_A };

    it('should return the most recent RoundEnded event', () => {
        expect(lastRoundEnded([first, other, second, other])).toBe(second);
    });

    it('should return undefined when no round has ended', () => {
        expect(lastRoundEnded([other])).toBeUndefined();
    });
});
