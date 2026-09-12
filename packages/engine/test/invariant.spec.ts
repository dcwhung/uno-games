// W-009: the invariant helpers that replaced the engine's non-null assertions.
// A `!` erased at runtime; these must actually throw, and the message must name
// the broken guarantee — that is the whole point of the replacement.
import { describe, expect, it } from 'vitest';

import {
    cardFrom,
    elementAt,
    getCard,
    invariant,
    playerAt,
    takeFromDrawPile,
    topCard,
    topDiscardId,
} from '../src/core';
import type { Card, CardId } from '../src';
import { newGame, P } from './helpers';

const FIRST_SEAT = 0;
const OUT_OF_RANGE_SEAT = 99;
const UNKNOWN_CARD = 'no-such-card' as CardId;
const VALUE = 'kept';
const LABEL = 'the thing holds';
const EMPTY: readonly CardId[] = [];

describe('invariant', () => {
    it('should return the value when it is defined', () => {
        expect(invariant(VALUE, LABEL)).toBe(VALUE);
    });

    it('should return falsy values untouched rather than treating them as missing', () => {
        expect(invariant(0, LABEL)).toBe(0);
        expect(invariant('', LABEL)).toBe('');
        expect(invariant(null, LABEL)).toBeNull();
    });

    it('should throw naming the broken guarantee when the value is undefined', () => {
        expect(() => invariant(undefined, LABEL)).toThrow(`Engine invariant violated: ${LABEL}`);
    });
});

describe('elementAt', () => {
    it('should return the element at an in-range index', () => {
        expect(elementAt([VALUE], FIRST_SEAT, LABEL)).toBe(VALUE);
    });

    it('should report the index and the length when the index is out of range', () => {
        expect(() => elementAt([VALUE], OUT_OF_RANGE_SEAT, LABEL)).toThrow(
            `${LABEL} — no element at index ${OUT_OF_RANGE_SEAT} of 1`,
        );
    });
});

describe('engine lookups', () => {
    it('should resolve a seat by index and reject an index past the table', () => {
        const { state } = newGame();

        expect(playerAt(state, FIRST_SEAT).id).toBe(P(0));
        expect(() => playerAt(state, OUT_OF_RANGE_SEAT)).toThrow(/seat index/);
    });

    it('should resolve a card by id and reject an id that is not in the deck', () => {
        const { state } = newGame();
        const known = topCard(state);

        expect(getCard(state, known.id)).toBe(known);
        expect(() => getCard(state, UNKNOWN_CARD)).toThrow(`card ${UNKNOWN_CARD}`);
    });

    it('should resolve a card from a bare deck map', () => {
        const { state } = newGame();
        const known: Card = topCard(state);
        const deck: Record<CardId, Card> = { [known.id]: known };

        expect(cardFrom(deck, known.id)).toBe(known);
        expect(() => cardFrom(deck, UNKNOWN_CARD)).toThrow(`card ${UNKNOWN_CARD}`);
    });

    it('should read the top of a discard pile and reject an empty one', () => {
        const { state } = newGame();

        expect(topDiscardId(state.discardPile)).toBe(topCard(state).id);
        expect(() => topDiscardId(EMPTY)).toThrow(/discard pile is never empty/);
    });

    it('should pop the draw pile and reject an empty one', () => {
        const { state } = newGame();
        const pile: CardId[] = state.drawPile.slice();
        const expected = pile[pile.length - 1];

        expect(takeFromDrawPile(pile)).toBe(expected);
        expect(pile.length).toBe(state.drawPile.length - 1);
        expect(() => takeFromDrawPile([])).toThrow(/draw pile is restocked/);
    });
});
