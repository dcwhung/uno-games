/**
 * handFan.ts — how wide the first-person fan may spread for a given viewport
 * (polish-v0.3 §2.3). Landscape uses a small, flat fan (constants.ts) so it
 * stays under the piles in a short view; portrait derives the largest spread
 * whose outermost card still fits inside the view, so an 18-card hand on a
 * 390 px phone overlaps more instead of overflowing. The view width is measured
 * through the same camera pose Scene.tsx renders with (cameraPose.ts), so the
 * bound stays truthful for both orientations.
 */
import * as THREE from 'three';
import { cameraPoseFor, isPortrait } from './cameraPose';
import {
    CARD_H,
    CARD_W,
    HAND_CARD_ANGLE_PORTRAIT_RAD,
    HAND_CARD_ANGLE_RAD,
    HAND_CARD_SCALE,
    HAND_CARD_SCALE_PORTRAIT,
    HAND_CENTER,
    HAND_CENTER_RAISE_LANDSCAPE,
    HAND_FAN_RADIUS,
    HAND_FAN_RADIUS_PORTRAIT,
    HAND_MAX_SPREAD_LANDSCAPE_RAD,
    HAND_MAX_SPREAD_RAD,
    HAND_VIEW_MARGIN,
} from './constants';

export interface LayoutViewport {
    /** width / height of the canvas. */
    readonly aspect: number;
}

export interface FanShape {
    readonly radius: number;
    readonly perCardRad: number;
    readonly maxSpreadRad: number;
    readonly cardScale: number;
    /** World y of the fan centre; the landscape fan sits higher than HAND_CENTER. */
    readonly centerY: number;
}

const LANDSCAPE_ASPECT = 16 / 9;
export const DEFAULT_VIEWPORT: LayoutViewport = { aspect: LANDSCAPE_ASPECT };

const LANDSCAPE_FAN: FanShape = {
    radius: HAND_FAN_RADIUS,
    perCardRad: HAND_CARD_ANGLE_RAD,
    maxSpreadRad: HAND_MAX_SPREAD_LANDSCAPE_RAD,
    cardScale: HAND_CARD_SCALE,
    centerY: HAND_CENTER[1] + HAND_CENTER_RAISE_LANDSCAPE,
};

const DEG_TO_RAD = Math.PI / 180;

/** Depth of the fan centre along the view axis of this viewport's camera pose. */
function handDepth(aspect: number): number {
    const pose = cameraPoseFor(aspect);
    const camera = new THREE.Vector3(...pose.position);
    const viewDir = new THREE.Vector3(...pose.target).sub(camera).normalize();
    return new THREE.Vector3(...HAND_CENTER).sub(camera).dot(viewDir);
}

/** Half the visible width, in scene units, on the plane through the fan centre. */
export function viewHalfWidthAtHand(viewport: LayoutViewport): number {
    const { fov } = cameraPoseFor(viewport.aspect);
    return handDepth(viewport.aspect) * Math.tan((fov / 2) * DEG_TO_RAD) * viewport.aspect;
}

/**
 * Horizontal reach of the card at `halfSpreadRad` from the fan's centre line:
 * its centre on the arc plus the leaning card's own far corner.
 */
export function fanOuterExtent(shape: FanShape, halfSpreadRad: number): number {
    const halfW = (CARD_W / 2) * shape.cardScale;
    const halfH = (CARD_H / 2) * shape.cardScale;
    return (shape.radius + halfH) * Math.sin(halfSpreadRad) + halfW * Math.cos(halfSpreadRad);
}

/** Largest half spread whose outermost card reaches no further than `limit`. */
function halfSpreadWithin(shape: FanShape, limit: number): number {
    // fanOuterExtent is A·sin(a) + B·cos(a); solve it for `limit` in closed form.
    const a = shape.radius + (CARD_H / 2) * shape.cardScale;
    const b = (CARD_W / 2) * shape.cardScale;
    const reach = Math.hypot(a, b);
    if (limit >= reach) return shape.maxSpreadRad / 2;
    const solved = Math.asin(limit / reach) - Math.atan2(b, a);
    return Math.max(0, Math.min(shape.maxSpreadRad / 2, solved));
}

export function handFanShape(viewport: LayoutViewport): FanShape {
    if (!isPortrait(viewport.aspect)) return LANDSCAPE_FAN;
    const portrait: FanShape = {
        radius: HAND_FAN_RADIUS_PORTRAIT,
        perCardRad: HAND_CARD_ANGLE_PORTRAIT_RAD,
        maxSpreadRad: HAND_MAX_SPREAD_RAD,
        cardScale: HAND_CARD_SCALE_PORTRAIT,
        centerY: HAND_CENTER[1],
    };
    const limit = viewHalfWidthAtHand(viewport) * (1 - HAND_VIEW_MARGIN);
    return { ...portrait, maxSpreadRad: 2 * halfSpreadWithin(portrait, limit) };
}
