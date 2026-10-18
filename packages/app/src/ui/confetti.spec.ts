import { describe, expect, it } from 'vitest';
import { CARD_COLORS } from '@uno/engine';

import { CONFETTI_COUNT, confettiPieces } from './confetti';

const MAX_PERCENT = 100;

describe('confettiPieces', () => {
    it('should produce the requested number of pieces with unique ids', () => {
        const pieces = confettiPieces();

        expect(pieces).toHaveLength(CONFETTI_COUNT);
        expect(new Set(pieces.map((p) => p.id)).size).toBe(CONFETTI_COUNT);
    });

    it('should cycle through the four card colours', () => {
        const colors = confettiPieces(CARD_COLORS.length).map((p) => p.color);

        expect(colors).toEqual([...CARD_COLORS]);
    });

    it('should keep every start position inside the container', () => {
        for (const piece of confettiPieces()) {
            expect(piece.leftPercent).toBeGreaterThanOrEqual(0);
            expect(piece.leftPercent).toBeLessThan(MAX_PERCENT);
        }
    });

    it('should be deterministic', () => {
        expect(confettiPieces()).toEqual(confettiPieces());
    });
});
