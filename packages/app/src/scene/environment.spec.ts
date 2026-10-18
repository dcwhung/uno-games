import { describe, expect, it } from 'vitest';

import {
    ACTIVE_RING_BREATH_AMPLITUDE,
    ACTIVE_RING_BREATH_PERIOD_S,
    CATCH_RING_OPACITY_MAX,
    CATCH_RING_OPACITY_MIN,
    CATCH_RING_PULSE_PERIOD_S,
    breathScale,
    pulseOpacity,
} from './environment';

const REST_SCALE = 1;
const HALF = 0.5;
const QUARTER = 0.25;
/** Float tolerance for the cosine wave at its exact extrema. */
const EPSILON = 1e-9;
/** Enough whole cycles to prove the wave repeats, not just that it returns once. */
const CYCLES = 3;

describe('breathScale', () => {
    it('should rest at scale 1 when the cycle starts', () => {
        expect(breathScale(0)).toBeCloseTo(REST_SCALE, 9);
    });

    it('should reach the full breath amplitude at half period', () => {
        const halfPeriod = ACTIVE_RING_BREATH_PERIOD_S * HALF;

        expect(breathScale(halfPeriod)).toBeCloseTo(REST_SCALE + ACTIVE_RING_BREATH_AMPLITUDE, 9);
    });

    it('should return to rest after a whole period', () => {
        expect(breathScale(ACTIVE_RING_BREATH_PERIOD_S)).toBeCloseTo(REST_SCALE, 9);
    });

    it('should repeat every period when sampled several cycles later', () => {
        const t = ACTIVE_RING_BREATH_PERIOD_S * QUARTER;
        const later = t + ACTIVE_RING_BREATH_PERIOD_S * CYCLES;

        expect(breathScale(later)).toBeCloseTo(breathScale(t), 9);
    });

    it('should stay within [1, 1 + amplitude] for every sample in a period', () => {
        const samples = 48;
        for (let i = 0; i <= samples; i++) {
            const value = breathScale((ACTIVE_RING_BREATH_PERIOD_S * i) / samples);
            expect(value).toBeGreaterThanOrEqual(REST_SCALE - EPSILON);
            expect(value).toBeLessThanOrEqual(REST_SCALE + ACTIVE_RING_BREATH_AMPLITUDE + EPSILON);
        }
    });
});

describe('pulseOpacity', () => {
    it('should start at the minimum opacity when the cycle starts', () => {
        expect(pulseOpacity(0)).toBeCloseTo(CATCH_RING_OPACITY_MIN, 9);
    });

    it('should reach the maximum opacity at half period', () => {
        const halfPeriod = CATCH_RING_PULSE_PERIOD_S * HALF;

        expect(pulseOpacity(halfPeriod)).toBeCloseTo(CATCH_RING_OPACITY_MAX, 9);
    });

    it('should return to the minimum after a whole period', () => {
        expect(pulseOpacity(CATCH_RING_PULSE_PERIOD_S)).toBeCloseTo(CATCH_RING_OPACITY_MIN, 9);
    });

    it('should stay within [min, max] for every sample in a period', () => {
        const samples = 48;
        for (let i = 0; i <= samples; i++) {
            const value = pulseOpacity((CATCH_RING_PULSE_PERIOD_S * i) / samples);
            expect(value).toBeGreaterThanOrEqual(CATCH_RING_OPACITY_MIN - EPSILON);
            expect(value).toBeLessThanOrEqual(CATCH_RING_OPACITY_MAX + EPSILON);
        }
    });
});
