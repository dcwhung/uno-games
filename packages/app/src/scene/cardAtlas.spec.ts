import { describe, expect, it } from 'vitest';
import { buildClassicDeck } from '@uno/engine';
import type { CardFace } from '@uno/engine';

import { CLASSIC_ATLAS_COLUMNS, CLASSIC_ATLAS_ROWS } from '../theme/classic';
import {
    ATLAS_H,
    ATLAS_W,
    CELL_H,
    CELL_SCALE,
    CELL_W,
    FACE_DESIGN_H,
    FACE_DESIGN_W,
    MAX_TEXTURE_SIDE,
    cellOrigin,
    classicFaces,
    faceCell,
    faceKey,
    faceUvRect,
} from './cardAtlas';

/** 4 colours × (ten numerals + skip + reverse + draw2) + wild + wild_draw4. */
const CLASSIC_DISTINCT_FACES = 54;
const CELL_COUNT = CLASSIC_ATLAS_COLUMNS * CLASSIC_ATLAS_ROWS;
const FIRST_CELL = 0;
const SECOND_COLUMN_CELL = 1;
const SECOND_ROW_CELL = CLASSIC_ATLAS_COLUMNS;
const UV_MIN = 0;
const UV_MAX = 1;
const RED_FIVE: CardFace = { color: 'red', kind: 'number', value: 5 };
const RED_FIVE_AGAIN: CardFace = { color: 'red', kind: 'number', value: 5 };
const RED_SIX: CardFace = { color: 'red', kind: 'number', value: 6 };
/** A variant-only kind with no Classic cell. */
const NO_MERCY_DRAW6: CardFace = { color: 'red', kind: 'draw6' };

function definedCell(face: CardFace): number {
    const cell = faceCell(face);
    if (cell === undefined) throw new Error(`no cell for ${faceKey(face)}`);
    return cell;
}

describe('atlas dimensions', () => {
    it('should draw each cell at CELL_SCALE of the §2.3 design size', () => {
        expect(CELL_W).toBe(FACE_DESIGN_W * CELL_SCALE);
        expect(CELL_H).toBe(FACE_DESIGN_H * CELL_SCALE);
    });

    it('should tile the theme grid exactly and stay under the mobile GPU limit', () => {
        expect(ATLAS_W).toBe(CELL_W * CLASSIC_ATLAS_COLUMNS);
        expect(ATLAS_H).toBe(CELL_H * CLASSIC_ATLAS_ROWS);
        expect(ATLAS_W).toBeLessThanOrEqual(MAX_TEXTURE_SIDE);
        expect(ATLAS_H).toBeLessThanOrEqual(MAX_TEXTURE_SIDE);
    });
});

describe('classicFaces', () => {
    it('should list the 54 distinct Classic faces with no duplicates', () => {
        const faces = classicFaces();

        expect(faces).toHaveLength(CLASSIC_DISTINCT_FACES);
        expect(new Set(faces.map(faceKey)).size).toBe(CLASSIC_DISTINCT_FACES);
    });

    it('should be exactly the distinct fronts of the Classic deck', () => {
        const deckKeys = new Set(buildClassicDeck().map((card) => faceKey(card.front)));

        const listed = new Set(classicFaces().map(faceKey));

        expect(listed).toEqual(deckKeys);
    });
});

describe('faceCell', () => {
    it('should give every Classic face a cell inside the grid', () => {
        for (const face of classicFaces()) {
            const cell = definedCell(face);
            expect(cell).toBeGreaterThanOrEqual(FIRST_CELL);
            expect(cell).toBeLessThan(CELL_COUNT);
        }
    });

    it('should never put two different faces in the same cell', () => {
        const cells = classicFaces().map(definedCell);

        expect(new Set(cells).size).toBe(CLASSIC_DISTINCT_FACES);
    });

    it('should map identical faces to the same cell and different faces apart', () => {
        expect(faceCell(RED_FIVE)).toBe(faceCell(RED_FIVE_AGAIN));
        expect(faceCell(RED_FIVE)).not.toBe(faceCell(RED_SIX));
    });

    it('should return undefined for a kind the Classic atlas does not draw', () => {
        expect(faceCell(NO_MERCY_DRAW6)).toBeUndefined();
        expect(faceUvRect(NO_MERCY_DRAW6)).toBeUndefined();
    });
});

describe('faceUvRect', () => {
    it('should keep every face inside the unit square with a cell-sized rect', () => {
        for (const face of classicFaces()) {
            const rect = faceUvRect(face);
            if (!rect) throw new Error(`no uv for ${faceKey(face)}`);
            expect(rect.u).toBeGreaterThanOrEqual(UV_MIN);
            expect(rect.v).toBeGreaterThanOrEqual(UV_MIN);
            expect(rect.u + rect.w).toBeLessThanOrEqual(UV_MAX + Number.EPSILON);
            expect(rect.v + rect.h).toBeLessThanOrEqual(UV_MAX + Number.EPSILON);
            expect(rect.w).toBeCloseTo(1 / CLASSIC_ATLAS_COLUMNS);
            expect(rect.h).toBeCloseTo(1 / CLASSIC_ATLAS_ROWS);
        }
    });

    it('should give every face its own rect origin', () => {
        const origins = classicFaces().map((face) => {
            const rect = faceUvRect(face);
            return rect ? `${rect.u.toFixed(6)},${rect.v.toFixed(6)}` : 'none';
        });

        expect(new Set(origins).size).toBe(CLASSIC_DISTINCT_FACES);
    });
});

describe('cellOrigin', () => {
    it('should walk the grid left to right, then top down, in canvas pixels', () => {
        expect(cellOrigin(FIRST_CELL)).toEqual({ x: 0, y: 0 });
        expect(cellOrigin(SECOND_COLUMN_CELL)).toEqual({ x: CELL_W, y: 0 });
        expect(cellOrigin(SECOND_ROW_CELL)).toEqual({ x: 0, y: CELL_H });
    });

    it('should agree with the UV rect of the same cell (canvas y is top-down, UV v is bottom-up)', () => {
        for (const face of classicFaces()) {
            const cell = definedCell(face);
            const rect = faceUvRect(face);
            if (!rect) throw new Error(`no uv for ${faceKey(face)}`);

            const origin = cellOrigin(cell);

            expect(origin.x).toBeCloseTo(rect.u * ATLAS_W);
            expect(origin.y).toBeCloseTo((1 - rect.v - rect.h) * ATLAS_H);
        }
    });
});
