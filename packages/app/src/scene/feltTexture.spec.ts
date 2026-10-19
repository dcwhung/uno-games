import { describe, expect, it } from 'vitest';

import { FELT_NOISE_FLOOR, feltNoiseAt, feltNoisePixels } from './feltTexture';

/** Small tile so the full-pixel specs stay fast; the shape is size-independent. */
const SIZE = 32;
const SEED = 7;
const OTHER_SEED = 99;
const RGBA_CHANNELS = 4;
const BYTE_MAX = 255;
const ALPHA_OFFSET = 3;
/** A handful of interior samples; enough to tell two seeds apart. */
const SAMPLE_POINTS: readonly (readonly [number, number])[] = [
    [1, 1],
    [5, 17],
    [13, 3],
    [20, 28],
    [31, 9],
];

function channelsOf(pixels: Uint8ClampedArray, index: number): [number, number, number, number] {
    const base = index * RGBA_CHANNELS;
    return [
        pixels[base] ?? -1,
        pixels[base + 1] ?? -1,
        pixels[base + 2] ?? -1,
        pixels[base + ALPHA_OFFSET] ?? -1,
    ];
}

describe('feltNoiseAt', () => {
    it('should return a value within [0, 1] for every pixel of the tile', () => {
        for (let y = 0; y < SIZE; y++) {
            for (let x = 0; x < SIZE; x++) {
                const value = feltNoiseAt(x, y, SIZE, SEED);
                expect(value).toBeGreaterThanOrEqual(0);
                expect(value).toBeLessThanOrEqual(1);
            }
        }
    });

    it('should be deterministic when called twice with the same inputs', () => {
        for (const [x, y] of SAMPLE_POINTS) {
            expect(feltNoiseAt(x, y, SIZE, SEED)).toBe(feltNoiseAt(x, y, SIZE, SEED));
        }
    });

    it('should wrap horizontally so the tile is seamless when repeated', () => {
        for (let y = 0; y < SIZE; y++) {
            expect(feltNoiseAt(SIZE, y, SIZE, SEED)).toBe(feltNoiseAt(0, y, SIZE, SEED));
        }
    });

    it('should wrap vertically so the tile is seamless when repeated', () => {
        for (let x = 0; x < SIZE; x++) {
            expect(feltNoiseAt(x, SIZE, SIZE, SEED)).toBe(feltNoiseAt(x, 0, SIZE, SEED));
        }
    });

    it('should produce a different pattern when the seed changes', () => {
        const differs = SAMPLE_POINTS.some(
            ([x, y]) => feltNoiseAt(x, y, SIZE, SEED) !== feltNoiseAt(x, y, SIZE, OTHER_SEED),
        );

        expect(differs).toBe(true);
    });
});

describe('feltNoisePixels', () => {
    it('should return one RGBA quad per pixel when given a tile size', () => {
        const pixels = feltNoisePixels(SIZE, SEED);

        expect(pixels.length).toBe(SIZE * SIZE * RGBA_CHANNELS);
    });

    it('should make every pixel fully opaque', () => {
        const pixels = feltNoisePixels(SIZE, SEED);

        for (let i = 0; i < SIZE * SIZE; i++) {
            expect(channelsOf(pixels, i)[ALPHA_OFFSET]).toBe(BYTE_MAX);
        }
    });

    it('should keep every pixel grey and within the subtle brightness band', () => {
        const pixels = feltNoisePixels(SIZE, SEED);

        for (let i = 0; i < SIZE * SIZE; i++) {
            const [r, g, b] = channelsOf(pixels, i);
            expect(r).toBe(g);
            expect(g).toBe(b);
            expect(r).toBeGreaterThanOrEqual(FELT_NOISE_FLOOR);
            expect(r).toBeLessThanOrEqual(BYTE_MAX);
        }
    });

    it('should not be a flat fill when the tile is generated', () => {
        const pixels = feltNoisePixels(SIZE, SEED);
        const reds = Array.from({ length: SIZE * SIZE }, (_, i) => channelsOf(pixels, i)[0]);

        expect(Math.min(...reds)).toBeLessThan(Math.max(...reds));
    });
});
