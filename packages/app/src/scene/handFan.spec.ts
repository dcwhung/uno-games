import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { applyCameraPose, cameraPoseFor } from './cameraPose';
import {
    CAMERA_FAR,
    CAMERA_NEAR,
    HAND_CARD_ANGLE_RAD,
    HAND_CARD_SCALE,
    HAND_CENTER,
    HAND_CENTER_RAISE_LANDSCAPE,
    HAND_FAN_RADIUS,
    HAND_MAX_SPREAD_LANDSCAPE_RAD,
    HAND_VIEW_MARGIN,
} from './constants';
import { DEFAULT_VIEWPORT, fanOuterExtent, handFanShape, viewHalfWidthAtHand } from './handFan';
import type { LayoutViewport } from './handFan';

const PORTRAIT: LayoutViewport = { aspect: 390 / 844 };
const NARROW_PORTRAIT: LayoutViewport = { aspect: 320 / 844 };
const LANDSCAPE: LayoutViewport = { aspect: 844 / 390 };
const SQUARE: LayoutViewport = { aspect: 1 };
/** NDC x of the right edge of the view. */
const VIEW_EDGE_NDC_X = 1;

describe('handFanShape', () => {
    it('should use the flat landscape fan for the default (landscape) viewport', () => {
        const shape = handFanShape(DEFAULT_VIEWPORT);

        expect(shape).toEqual({
            radius: HAND_FAN_RADIUS,
            perCardRad: HAND_CARD_ANGLE_RAD,
            maxSpreadRad: HAND_MAX_SPREAD_LANDSCAPE_RAD,
            cardScale: HAND_CARD_SCALE,
            centerY: HAND_CENTER[1] + HAND_CENTER_RAISE_LANDSCAPE,
        });
        expect(handFanShape(LANDSCAPE)).toEqual(shape);
        expect(handFanShape(SQUARE)).toEqual(shape);
    });

    it('should curl the portrait fan tighter: less arc per card on a smaller radius', () => {
        const portrait = handFanShape(PORTRAIT);
        const landscape = handFanShape(LANDSCAPE);

        // Overlap is set by the arc each card gets (radius × angle), not the angle alone:
        // the flat landscape fan uses a small angle on a large radius.
        expect(portrait.radius).toBeLessThan(landscape.radius);
        expect(portrait.radius * portrait.perCardRad).toBeLessThan(
            landscape.radius * landscape.perCardRad,
        );
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
    it.each([
        ['portrait', PORTRAIT],
        ['landscape', LANDSCAPE],
    ])('should match the %s scene camera: the half width lands on the view edge', (_, viewport) => {
        const pose = cameraPoseFor(viewport.aspect);
        const camera = new THREE.PerspectiveCamera(
            pose.fov,
            viewport.aspect,
            CAMERA_NEAR,
            CAMERA_FAR,
        );
        applyCameraPose(camera, pose);
        camera.updateMatrixWorld();
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
        const edge = new THREE.Vector3(...HAND_CENTER).addScaledVector(
            right,
            viewHalfWidthAtHand(viewport),
        );

        expect(edge.project(camera).x).toBeCloseTo(VIEW_EDGE_NDC_X);
    });

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
