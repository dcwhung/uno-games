import { describe, expect, it } from 'vitest';
import type { CardId, GameState, LegalMove } from '@uno/engine';

import { dealtState } from '../test/fixtures';
import { isDrawnCardPlayable } from './drawnCard';

const DRAWN = 'drawn-card' as CardId;
const OTHER = 'other-card' as CardId;

function move(card: CardId): LegalMove {
    return { card, requiresColor: false, traits: { attack: false } };
}

describe('isDrawnCardPlayable', () => {
    it('should be false when nothing has been drawn this turn', () => {
        expect(isDrawnCardPlayable(dealtState(), [move(OTHER)])).toBe(false);
    });

    it('should be true when the drawn card is among the legal moves', () => {
        const state: GameState = { ...dealtState(), drawnCard: DRAWN };

        expect(isDrawnCardPlayable(state, [move(OTHER), move(DRAWN)])).toBe(true);
    });

    it('should be false when the drawn card is not playable', () => {
        const state: GameState = { ...dealtState(), drawnCard: DRAWN };

        expect(isDrawnCardPlayable(state, [move(OTHER)])).toBe(false);
    });
});
