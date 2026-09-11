/**
 * Flip groundwork: the reducer must read the face on `state.activeSide`,
 * never `card.front` directly. Classic decks have no `back`, so we graft a
 * back face onto two cards and flip the table.
 */
import { describe, expect, it } from 'vitest';
import { engine } from '../src';
import type { Card, CardColor, CardFace, CardId, GameState } from '../src';
import { newGame, P, rig } from './helpers';

const BACK_TOP_COLOR: CardColor = 'blue';
const BACK_TOP: CardFace = { color: BACK_TOP_COLOR, kind: 'number', value: 5 };
const BACK_MATCHING_NUMBER: CardFace = { color: 'green', kind: 'number', value: 5 };

function withBack(state: GameState, id: CardId, back: CardFace): GameState {
    const card: Card = { ...state.cards[id]!, back };
    return { ...state, cards: { ...state.cards, [id]: card } };
}

/** Table flipped to the back side: top back = blue 5, P0 holds a Wild whose back is green 5. */
function flippedTable(): { state: GameState; wildCard: CardId } {
    const base = newGame(3).state;
    const rigged = rig(base, {
        top: { color: 'red', kind: 'number', value: 1 },
        hands: {
            [P(0)]: [
                { color: 'wild', kind: 'wild' },
                { color: 'red', kind: 'number', value: 2 },
            ],
            [P(1)]: [{ color: 'red', kind: 'number', value: 4 }],
        },
    });
    const top = rigged.discardPile[0]!;
    const wildCard = rigged.players[0]!.hand[0]!;
    let s = withBack(rigged, top, BACK_TOP);
    s = withBack(s, wildCard, BACK_MATCHING_NUMBER);
    return { state: { ...s, activeSide: 'back', activeColor: BACK_TOP_COLOR }, wildCard };
}

describe('reducer reads the active face', () => {
    it('getLegalMoves does not require a colour for a card whose active (back) face is not wild', () => {
        const { state, wildCard } = flippedTable();
        const move = engine.getLegalMoves(state, P(0)).find((m) => m.card === wildCard);
        expect(move?.requiresColor).toBe(false);
    });

    it('playing sets activeColor from the back face and does not wait for a colour choice', () => {
        const { state, wildCard } = flippedTable();
        const r = engine.apply(state, { type: 'PLAY_CARD', player: P(0), card: wildCard });
        expect(r.events.map((e) => e.type)).toEqual(['CardPlayed', 'TurnChanged']);
        expect(r.state.phase).toBe('playing');
        expect(r.state.activeColor).toBe(BACK_MATCHING_NUMBER.color);
    });
});
