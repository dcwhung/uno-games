/**
 * theme/classic.ts — face → atlas cell mapping for the Classic deck.
 *
 * Atlas layout (13 columns × 5 rows, authored top-down):
 *   row 0  red     : 0 1 2 3 4 5 6 7 8 9 skip reverse draw2
 *   row 1  yellow  : same
 *   row 2  green   : same
 *   row 3  blue    : same
 *   row 4  wild    : wild wild_draw4 (remaining 11 cells unused)
 */
import type { CardColor, CardFace } from '@uno/engine';
import type { FaceToCell, ManifestVariant, CardTheme } from './types';

export const CLASSIC_ATLAS_COLUMNS = 13;
export const CLASSIC_ATLAS_ROWS = 5;

const COLOR_ROW: Readonly<Record<CardColor, number>> = {
    red: 0,
    yellow: 1,
    green: 2,
    blue: 3,
};
const WILD_ROW = 4;

const ACTION_COLUMN = {
    skip: 10,
    reverse: 11,
    draw2: 12,
} as const;

const WILD_COLUMN = {
    wild: 0,
    wild_draw4: 1,
} as const;

const MIN_NUMBER = 0;
const MAX_NUMBER = 9;

export const classicFaceToCell: FaceToCell = (face: CardFace) => {
    if (face.color === 'wild') {
        const col = WILD_COLUMN[face.kind as keyof typeof WILD_COLUMN];
        return col === undefined ? undefined : WILD_ROW * CLASSIC_ATLAS_COLUMNS + col;
    }

    const row = COLOR_ROW[face.color];

    if (face.kind === 'number') {
        if (face.value === undefined || face.value < MIN_NUMBER || face.value > MAX_NUMBER)
            return undefined;
        return row * CLASSIC_ATLAS_COLUMNS + face.value;
    }

    const col = ACTION_COLUMN[face.kind as keyof typeof ACTION_COLUMN];
    return col === undefined ? undefined : row * CLASSIC_ATLAS_COLUMNS + col;
};

/** Registry entry: manifest data is loaded at runtime; only the mapping fn is code. */
export function buildClassicTheme(manifest: ManifestVariant): CardTheme {
    const front = manifest.sides.front;
    return {
        variant: 'classic',
        displayNameKey: manifest.displayNameKey,
        tableTint: manifest.tableTint,
        sides: {
            front: {
                back: front.back,
                faces: front.faces,
                faceToCell: classicFaceToCell,
                palette: front.palette,
                wildAccent: front.wildAccent,
            },
            back: undefined,
        },
    };
}
