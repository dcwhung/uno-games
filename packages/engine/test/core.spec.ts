import { describe, expect, it } from 'vitest';
import { canCallUno, isUnoCallHandSize, isUnoCallPhase, UNO_CALL_MAX_HAND } from '../src';
import type { Phase } from '../src';

const EMPTY_HAND = 0;
const ONE_CARD = 1;
const ONE_OVER_MAX = UNO_CALL_MAX_HAND + 1;

const OPEN_PHASES: readonly Phase[] = ['dealing', 'playing', 'choosing_color', 'challenge_window'];
const CLOSED_PHASES: readonly Phase[] = ['lobby', 'round_over', 'game_over'];

describe('UNO_CALL_MAX_HAND', () => {
    it('should be two cards — you call UNO before playing your second-to-last card', () => {
        expect(UNO_CALL_MAX_HAND).toBe(2);
    });
});

describe('isUnoCallHandSize', () => {
    it('should reject an empty hand', () => {
        expect(isUnoCallHandSize(EMPTY_HAND)).toBe(false);
    });

    it('should accept one card and the maximum', () => {
        expect(isUnoCallHandSize(ONE_CARD)).toBe(true);
        expect(isUnoCallHandSize(UNO_CALL_MAX_HAND)).toBe(true);
    });

    it('should reject one card over the maximum', () => {
        expect(isUnoCallHandSize(ONE_OVER_MAX)).toBe(false);
    });
});

describe('isUnoCallPhase', () => {
    it('should be open during dealing, playing, and the wild follow-up phases', () => {
        for (const phase of OPEN_PHASES) expect(isUnoCallPhase(phase), phase).toBe(true);
    });

    it('should be closed in the lobby and once a round or game is over', () => {
        for (const phase of CLOSED_PHASES) expect(isUnoCallPhase(phase), phase).toBe(false);
    });
});

describe('canCallUno', () => {
    const uncalled = (handCount: number) => ({ handCount, calledUno: false });

    it('should allow a call with one or two cards while playing', () => {
        expect(canCallUno(uncalled(ONE_CARD), 'playing')).toBe(true);
        expect(canCallUno(uncalled(UNO_CALL_MAX_HAND), 'playing')).toBe(true);
    });

    it('should refuse with an empty hand or more than the maximum', () => {
        expect(canCallUno(uncalled(EMPTY_HAND), 'playing')).toBe(false);
        expect(canCallUno(uncalled(ONE_OVER_MAX), 'playing')).toBe(false);
    });

    it('should refuse when UNO was already called', () => {
        expect(canCallUno({ handCount: ONE_CARD, calledUno: true }, 'playing')).toBe(false);
    });

    it('should refuse in every closed phase even with a valid hand', () => {
        for (const phase of CLOSED_PHASES)
            expect(canCallUno(uncalled(ONE_CARD), phase), phase).toBe(false);
    });

    it('should accept a PublicPlayerView-shaped argument without adaptation', () => {
        // PublicPlayerView carries extra fields; the helper must only require the minimal shape.
        const view = { id: 'p1', handCount: UNO_CALL_MAX_HAND, calledUno: false, score: 0 };
        expect(canCallUno(view, 'playing')).toBe(true);
    });
});
