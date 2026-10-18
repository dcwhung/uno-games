/**
 * confetti.ts — deterministic piece layout for the CSS confetti burst.
 *
 * Index-based arithmetic rather than Math.random so the burst looks the same
 * on every win and the layout is unit-testable.
 */
import { CARD_COLORS } from '@uno/engine';
import type { CardColor } from '@uno/engine';

export interface ConfettiPiece {
    readonly id: number;
    readonly color: CardColor;
    /** Horizontal start, in percent of the container width. */
    readonly leftPercent: number;
    readonly delayMs: number;
    readonly durationMs: number;
}

export const CONFETTI_COUNT = 28;
const PERCENT = 100;
/** Coprime with 100 so 28 pieces land on 28 distinct columns. */
const LEFT_STRIDE = 37;
const DELAY_STRIDE_MS = 90;
const DELAY_SPAN_MS = 900;
const BASE_DURATION_MS = 1800;
const DURATION_STRIDE_MS = 70;
const DURATION_SPAN_MS = 700;

export function confettiPieces(count: number = CONFETTI_COUNT): readonly ConfettiPiece[] {
    return Array.from({ length: count }, (_, i): ConfettiPiece => {
        const color = CARD_COLORS[i % CARD_COLORS.length];
        return {
            id: i,
            color: color ?? CARD_COLORS[0],
            leftPercent: (i * LEFT_STRIDE) % PERCENT,
            delayMs: (i * DELAY_STRIDE_MS) % DELAY_SPAN_MS,
            durationMs: BASE_DURATION_MS + ((i * DURATION_STRIDE_MS) % DURATION_SPAN_MS),
        };
    });
}
