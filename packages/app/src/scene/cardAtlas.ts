/**
 * cardAtlas.ts — where each Classic face lives on the runtime face atlas
 * (polish-v0.3 §2.3, W-064). Pure: the grid is the theme's 13 × 5 layout
 * (theme/classic.ts) at CELL_W × CELL_H per cell, so one 3328 × 1990 canvas
 * holds all 54 faces under the 4096 px mobile texture limit. cardTextures.ts
 * paints it; CardMesh samples a face through a texture clone whose
 * offset / repeat is the cell's UV rect.
 */
import { CARD_COLORS } from '@uno/engine';
import type { CardFace } from '@uno/engine';
import { CLASSIC_ATLAS_COLUMNS, CLASSIC_ATLAS_ROWS, classicFaceToCell } from '../theme/classic';
import { cellToUv } from '../theme/types';
import type { TextureRef, UvRect } from '../theme/types';

/** Design-space size the face art is authored in (§2.3: 512 × 796). */
export const FACE_DESIGN_W = 512;
export const FACE_DESIGN_H = 796;
/** Each cell (and the back) is painted at half the design size: 256 × 398. */
export const CELL_SCALE = 0.5;
export const CELL_W = FACE_DESIGN_W * CELL_SCALE;
export const CELL_H = FACE_DESIGN_H * CELL_SCALE;
export const ATLAS_W = CELL_W * CLASSIC_ATLAS_COLUMNS;
export const ATLAS_H = CELL_H * CLASSIC_ATLAS_ROWS;
/** Largest texture side every WebGL target the game supports can allocate. */
export const MAX_TEXTURE_SIDE = 4096;
/** No gutter: neighbouring cells all end in the same paper frame, so mip bleed is paper on paper. */
const ATLAS_PADDING_PX = 0;

const NUMERALS = Array.from({ length: 10 }, (_, value) => value);
const COLOUR_ACTIONS = ['skip', 'reverse', 'draw2'] as const;
const WILD_KINDS = ['wild', 'wild_draw4'] as const;

/** The canvas is painted at runtime; the ref only carries the size cellToUv needs. */
const ATLAS_TEXTURE: TextureRef = {
    file: 'runtime-canvas',
    format: 'png',
    srgb: true,
    width: ATLAS_W,
    height: ATLAS_H,
};
const ATLAS_GRID = {
    texture: ATLAS_TEXTURE,
    columns: CLASSIC_ATLAS_COLUMNS,
    rows: CLASSIC_ATLAS_ROWS,
    paddingPx: ATLAS_PADDING_PX,
};

export interface CellOrigin {
    readonly x: number;
    readonly y: number;
}

/** Cache / identity key for a face; identical faces share one. */
export function faceKey(face: CardFace): string {
    return `${face.color}:${face.kind}:${face.value ?? ''}`;
}

/** Atlas cell for a face, or undefined for a kind the Classic atlas does not draw. */
export function faceCell(face: CardFace): number | undefined {
    return classicFaceToCell(face);
}

/** UV rect (bottom-left origin) of a face's cell, or undefined when it has no cell. */
export function faceUvRect(face: CardFace): UvRect | undefined {
    const cell = faceCell(face);
    return cell === undefined ? undefined : cellToUv(ATLAS_GRID, cell);
}

/** Top-left pixel of a cell on the atlas canvas (rows are authored top-down). */
export function cellOrigin(cell: number): CellOrigin {
    const col = cell % CLASSIC_ATLAS_COLUMNS;
    const row = Math.floor(cell / CLASSIC_ATLAS_COLUMNS);
    return { x: col * CELL_W, y: row * CELL_H };
}

/** The 54 distinct Classic faces, one per atlas cell that gets painted. */
export function classicFaces(): CardFace[] {
    const faces: CardFace[] = [];
    for (const color of CARD_COLORS) {
        for (const value of NUMERALS) faces.push({ color, kind: 'number', value });
        for (const kind of COLOUR_ACTIONS) faces.push({ color, kind });
    }
    for (const kind of WILD_KINDS) faces.push({ color: 'wild', kind });
    return faces;
}
