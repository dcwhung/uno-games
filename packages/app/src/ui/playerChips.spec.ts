import { describe, expect, it } from 'vitest';
import type { GameState, PlayerId } from '@uno/engine';

import { SEAT_COLORS } from '../scene/constants';
import { HUMAN_ID } from '../store/gameStore';
import { BOT_IDS, dealtState, playersFor } from '../test/fixtures';
import { HUMAN_SEAT_COLOR, buildPlayerChips, seatColor } from './playerChips';

const [BOT_A, BOT_B, BOT_C] = BOT_IDS;
const THREE_OPPONENTS = 3;
const ONE_CARD = 1;

function withHand(state: GameState, id: PlayerId, size: number, calledUno: boolean): GameState {
    return {
        ...state,
        players: state.players.map((p) =>
            p.id === id ? { ...p, hand: p.hand.slice(0, size), calledUno } : p,
        ),
    };
}

describe('seatColor', () => {
    it('should give the human the gold token and each bot its seat colour in order', () => {
        const state = dealtState({ players: playersFor(THREE_OPPONENTS) });

        expect(seatColor(state, HUMAN_ID)).toBe(HUMAN_SEAT_COLOR);
        expect(seatColor(state, BOT_A)).toBe(SEAT_COLORS[0]);
        expect(seatColor(state, BOT_B)).toBe(SEAT_COLORS[1]);
        expect(seatColor(state, BOT_C)).toBe(SEAT_COLORS[2]);
    });
});

describe('buildPlayerChips', () => {
    it('should build one chip per seat with name, count and colour', () => {
        const state = dealtState();

        const chips = buildPlayerChips(state);

        expect(chips.map((c) => c.id)).toEqual([HUMAN_ID, BOT_A, BOT_B]);
        expect(chips.map((c) => c.cardCount)).toEqual(state.players.map((p) => p.hand.length));
        expect(chips[1]?.color).toBe(SEAT_COLORS[0]);
        expect(chips[1]?.name).toBe('Bot 0');
    });

    it('should mark only the current player as active', () => {
        const state = dealtState();

        const chips = buildPlayerChips(state);

        expect(chips.filter((c) => c.active).map((c) => c.id)).toEqual([state.currentPlayer]);
    });

    it('should show the UNO badge for a seat at one card that called it', () => {
        const state = withHand(dealtState(), BOT_A, ONE_CARD, true);

        expect(buildPlayerChips(state).find((c) => c.id === BOT_A)?.badge).toBe('uno');
    });

    it('should show the catchable badge for a bot the engine left vulnerable', () => {
        const state: GameState = {
            ...withHand(dealtState(), BOT_A, ONE_CARD, false),
            unoVulnerable: BOT_A,
        };

        expect(buildPlayerChips(state).find((c) => c.id === BOT_A)?.badge).toBe('catchable');
    });

    it('should not offer the human to catch themselves', () => {
        const state: GameState = {
            ...withHand(dealtState(), HUMAN_ID, ONE_CARD, false),
            unoVulnerable: HUMAN_ID,
        };

        expect(buildPlayerChips(state).find((c) => c.id === HUMAN_ID)?.badge).toBeUndefined();
    });

    it('should show no badge for a seat with more than one card', () => {
        expect(buildPlayerChips(dealtState()).every((c) => c.badge === undefined)).toBe(true);
    });
});
