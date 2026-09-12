/**
 * fixtures.spec.ts — locks the seat-count-dependent facts of `SEED` (CUI-0301).
 *
 * The doc comment on `SEED` used to claim a number-card opening for both the
 * 3- and 4-player tables. It is a Draw Two at 4 players, so bot0 starts with 9
 * cards and is skipped. Nothing depended on the wrong claim, but a future spec
 * written from that comment ("everyone holds 7", "bot0 leads") would flake.
 * These assertions make the comment falsifiable instead of decorative.
 */
import { describe, expect, it } from 'vitest';
import type { CardFace, GameState } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import { BOT_IDS, SEED, dealtState, playersFor, topOf } from '../test/fixtures';

const [BOT_A, BOT_B] = BOT_IDS;
const DEALT_HAND_SIZE = 7;
const DRAW_TWO_PENALTY = 2;

/** Face of the card the round opened on; throws rather than returning undefined. */
function openingFace(state: GameState): CardFace {
    const card = state.cards[topOf(state.discardPile)];
    if (!card) throw new Error('opening card missing from state.cards');
    return card.front;
}

function openingFor(opponentCount: number): GameState {
    return dealtState({ players: playersFor(opponentCount), seed: SEED });
}

describe('SEED openings', () => {
    it('should open on a blue number card at a 2-player table', () => {
        const state = openingFor(1);

        expect(openingFace(state)).toMatchObject({ color: 'blue', kind: 'number' });
    });

    it('should deal seven cards each and leave bot0 to lead at a 2-player table', () => {
        const state = openingFor(1);

        expect(state.players.map((p) => p.hand.length)).toEqual([DEALT_HAND_SIZE, DEALT_HAND_SIZE]);
        expect(state.currentPlayer).toBe(BOT_A);
    });

    it('should open on a yellow number card at a 3-player table', () => {
        const state = openingFor(2);

        expect(openingFace(state)).toMatchObject({ color: 'yellow', kind: 'number' });
    });

    it('should deal seven cards each and leave bot0 to lead at a 3-player table', () => {
        const state = openingFor(2);

        expect(state.players.map((p) => p.hand.length)).toEqual([
            DEALT_HAND_SIZE,
            DEALT_HAND_SIZE,
            DEALT_HAND_SIZE,
        ]);
        expect(state.currentPlayer).toBe(BOT_A);
    });

    it('should open on a yellow Draw Two at a 4-player table', () => {
        const state = openingFor(3);

        expect(openingFace(state)).toMatchObject({ color: 'yellow', kind: 'draw2' });
    });

    it('should penalise and skip bot0 at a 4-player table', () => {
        const state = openingFor(3);

        expect(state.players.map((p) => p.hand.length)).toEqual([
            DEALT_HAND_SIZE,
            DEALT_HAND_SIZE + DRAW_TWO_PENALTY,
            DEALT_HAND_SIZE,
            DEALT_HAND_SIZE,
        ]);
        expect(state.currentPlayer).toBe(BOT_B);
    });

    it('should start round 1 in `playing` at every table size', () => {
        // The one guarantee the specs actually rely on, at every seat count.
        for (const opponents of [1, 2, 3]) {
            expect(openingFor(opponents).phase).toBe('playing');
        }
    });

    it('should seat the human first at every table size', () => {
        for (const opponents of [1, 2, 3]) {
            expect(openingFor(opponents).players[0]?.id).toBe(HUMAN_ID);
        }
    });
});
