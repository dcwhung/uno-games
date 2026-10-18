import { describe, expect, it } from 'vitest';

import {
    HAND_CARD_ANGLE_RAD,
    HAND_CARD_SCALE,
    HAND_CENTER,
    HAND_CENTER_RAISE_LANDSCAPE,
    HAND_FAN_RADIUS,
    HAND_MAX_SPREAD_RAD,
    HAND_VIEW_MARGIN,
} from './constants';
import { DEFAULT_VIEWPORT, fanOuterExtent, handFanShape, viewHalfWidthAtHand } from './handFan';
import type { LayoutViewport } from './handFan';

const PORTRAIT: LayoutViewport = { aspect: 390 / 844 };
const NARROW_PORTRAIT: LayoutViewport = { aspect: 320 / 844 };
const LANDSCAPE: LayoutViewport = { aspect: 844 / 390 };
const SQUARE: LayoutViewport = { aspect: 1 };

describe('handFanShape', () => {
    it('should keep the v0.2 spread for the default (landscape) viewport', () => {
        const shape = handFanShape(DEFAULT_VIEWPORT);

        expect(shape).toEqual({
            radius: HAND_FAN_RADIUS,
            perCardRad: HAND_CARD_ANGLE_RAD,
            maxSpreadRad: HAND_MAX_SPREAD_RAD,
            cardScale: HAND_CARD_SCALE,
            centerY: HAND_CENTER[1] + HAND_CENTER_RAISE_LANDSCAPE,
        });
        expect(handFanShape(LANDSCAPE)).toEqual(shape);
        expect(handFanShape(SQUARE)).toEqual(shape);
    });

    it('should tighten the fan in portrait', () => {
        const portrait = handFanShape(PORTRAIT);
        const landscape = handFanShape(LANDSCAPE);

        expect(portrait.radius).toBeLessThan(landscape.radius);
        expect(portrait.perCardRad).toBeLessThan(landscape.perCardRad);
        expect(portrait.maxSpreadRad).toBeLessThan(landscape.maxSpreadRad);
        expect(portrait.cardScale).toBeLessThan(landscape.cardScale);
    });

    it('should keep the portrait fan centre at HAND_CENTER and raise the landscape one', () => {
        expect(handFanShape(PORTRAIT).centerY).toBe(HAND_CENTER[1]);
        expect(handFanShape(LANDSCAPE).centerY).toBeGreaterThan(HAND_CENTER[1]);
    });

    it('should keep the outermost portrait card inside the view with the margin', () => {
        const shape = handFanShape(PORTRAIT);
        const limit = viewHalfWidthAtHand(PORTRAIT) * (1 - HAND_VIEW_MARGIN);

        expect(fanOuterExtent(shape, shape.maxSpreadRad / 2)).toBeLessThanOrEqual(limit);
    });

    it('should narrow the spread further for a narrower portrait view', () => {
        expect(handFanShape(NARROW_PORTRAIT).maxSpreadRad).toBeLessThan(
            handFanShape(PORTRAIT).maxSpreadRad,
        );
    });
});

describe('viewHalfWidthAtHand', () => {
    it('should grow linearly with the aspect ratio within the portrait regime', () => {
        const half = viewHalfWidthAtHand(PORTRAIT);
        const narrow = viewHalfWidthAtHand(NARROW_PORTRAIT);

        expect(half).toBeGreaterThan(0);
        expect(narrow / half).toBeCloseTo(NARROW_PORTRAIT.aspect / PORTRAIT.aspect);
    });
});

describe('fanOuterExtent', () => {
    it('should grow with the half spread angle', () => {
        const shape = handFanShape(LANDSCAPE);

        expect(fanOuterExtent(shape, 0.3)).toBeGreaterThan(fanOuterExtent(shape, 0.1));
    });
});
