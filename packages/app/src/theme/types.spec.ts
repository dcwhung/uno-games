import { describe, expect, it } from 'vitest';

import { ASSET_ROOT, CARD_ASPECT_RATIO, CARD_HEIGHT_UNITS, CARD_WIDTH_UNITS, assetUrl, cellToUv } from './types';
import type { AtlasGrid, TextureRef, UvRect } from './types';

const TEXTURE_WIDTH_PX = 1024;
const TEXTURE_HEIGHT_PX = 768;
const COLUMNS = 4;
const ROWS = 3;
const CELL_COUNT = COLUMNS * ROWS;
const FIRST_CELL = 0;
const LAST_CELL = CELL_COUNT - 1;
const NO_PADDING_PX = 0;
const PADDING_PX = 8;
const UV_MIN = 0;
const UV_MAX = 1;
const VARIANT = 'classic';

const TEXTURE: TextureRef = {
    file: 'faces.ktx2',
    format: 'ktx2',
    srgb: true,
    width: TEXTURE_WIDTH_PX,
    height: TEXTURE_HEIGHT_PX,
};

function grid(paddingPx: number): AtlasGrid {
    return { texture: TEXTURE, columns: COLUMNS, rows: ROWS, paddingPx };
}

function expectInsideUnitSquare(rect: UvRect): void {
    expect(rect.u).toBeGreaterThanOrEqual(UV_MIN);
    expect(rect.v).toBeGreaterThanOrEqual(UV_MIN);
    expect(rect.w).toBeGreaterThan(UV_MIN);
    expect(rect.h).toBeGreaterThan(UV_MIN);
    expect(rect.u + rect.w).toBeLessThanOrEqual(UV_MAX);
    expect(rect.v + rect.h).toBeLessThanOrEqual(UV_MAX);
}

describe('card geometry constants', () => {
    it('should derive the card height from the width and the physical aspect ratio', () => {
        expect(CARD_HEIGHT_UNITS).toBeCloseTo(CARD_WIDTH_UNITS / CARD_ASPECT_RATIO);
        expect(CARD_HEIGHT_UNITS).toBeGreaterThan(CARD_WIDTH_UNITS);
    });
});

describe('cellToUv', () => {
    it('should map cell 0 to the top-left cell in bottom-left UV space', () => {
        const rect = cellToUv(grid(NO_PADDING_PX), FIRST_CELL);

        expect(rect.u).toBeCloseTo(UV_MIN);
        expect(rect.v).toBeCloseTo(UV_MAX - 1 / ROWS);
        expect(rect.w).toBeCloseTo(1 / COLUMNS);
        expect(rect.h).toBeCloseTo(1 / ROWS);
    });

    it('should map the last cell to the bottom-right cell', () => {
        const rect = cellToUv(grid(NO_PADDING_PX), LAST_CELL);

        expect(rect.u).toBeCloseTo(UV_MAX - 1 / COLUMNS);
        expect(rect.v).toBeCloseTo(UV_MIN);
        expect(rect.u + rect.w).toBeCloseTo(UV_MAX);
        expect(rect.v + rect.h).toBeCloseTo(UV_MAX / ROWS);
    });

    it('should wrap to the next row after the last column', () => {
        const endOfRow = cellToUv(grid(NO_PADDING_PX), COLUMNS - 1);
        const startOfNextRow = cellToUv(grid(NO_PADDING_PX), COLUMNS);

        expect(startOfNextRow.u).toBeCloseTo(UV_MIN);
        expect(startOfNextRow.v).toBeCloseTo(endOfRow.v - 1 / ROWS);
    });

    it('should keep every cell inside the unit square', () => {
        for (let cell = FIRST_CELL; cell <= LAST_CELL; cell++) {
            expectInsideUnitSquare(cellToUv(grid(NO_PADDING_PX), cell));
            expectInsideUnitSquare(cellToUv(grid(PADDING_PX), cell));
        }
    });

    it('should tile the atlas exactly when there is no padding', () => {
        const rects = Array.from({ length: CELL_COUNT }, (_, cell) => cellToUv(grid(NO_PADDING_PX), cell));

        const totalArea = rects.reduce((sum, r) => sum + r.w * r.h, 0);

        expect(totalArea).toBeCloseTo(UV_MAX);
    });

    it('should inset each cell by the padding in texture space', () => {
        const padU = PADDING_PX / TEXTURE_WIDTH_PX;
        const padV = PADDING_PX / TEXTURE_HEIGHT_PX;
        const plain = cellToUv(grid(NO_PADDING_PX), FIRST_CELL);

        const padded = cellToUv(grid(PADDING_PX), FIRST_CELL);

        expect(padded.u).toBeCloseTo(plain.u + padU);
        expect(padded.v).toBeCloseTo(plain.v + padV);
        expect(padded.w).toBeCloseTo(plain.w - 2 * padU);
        expect(padded.h).toBeCloseTo(plain.h - 2 * padV);
    });

    it('should give every cell the same size', () => {
        const rects = Array.from({ length: CELL_COUNT }, (_, cell) => cellToUv(grid(PADDING_PX), cell));
        const [first, ...rest] = rects;

        for (const rect of rest) {
            expect(rect.w).toBeCloseTo(first!.w);
            expect(rect.h).toBeCloseTo(first!.h);
        }
    });
});

describe('assetUrl', () => {
    it('should build the path under ASSET_ROOT/<variant>/', () => {
        expect(assetUrl(VARIANT, TEXTURE)).toBe(`${ASSET_ROOT}/${VARIANT}/${TEXTURE.file}`);
    });

    it('should not depend on texture metadata other than the file name', () => {
        const differentMeta: TextureRef = { ...TEXTURE, format: 'png', srgb: false, width: 1, height: 1 };

        expect(assetUrl(VARIANT, differentMeta)).toBe(assetUrl(VARIANT, TEXTURE));
    });
});
