import { describe, expect, it } from 'vitest';

import { CAMERA_FAR, CAMERA_NEAR, SEAT_COLORS } from './constants';

// polish-v0.3 §2.2 seat palette: rose / mint / honey. The HUD avatar dots
// (ui/playerChips.ts) read the same constant, so a drift here shows twice.
const SPEC_SEAT_PALETTE = ['#f28ba8', '#5fd1b2', '#f3c76b'] as const;

describe('SEAT_COLORS', () => {
    it('should match the §2.2 seat palette in order', () => {
        expect(SEAT_COLORS).toEqual(SPEC_SEAT_PALETTE);
    });
});

describe('camera frustum', () => {
    it('should put the near plane in front of the camera and the far plane beyond it', () => {
        expect(CAMERA_NEAR).toBeGreaterThan(0);
        expect(CAMERA_FAR).toBeGreaterThan(CAMERA_NEAR);
    });
});
