import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { CARD_CORNER_RADIUS, CARD_H, CARD_W } from './constants';
import { cardFaceGeometry, remapUvsToUnit, roundedRectShape } from './cardShape';

const HALF_W = CARD_W / 2;
const HALF_H = CARD_H / 2;
/** A rounded outline never reaches the sharp corner; it stops short by this much. */
const CORNER_GAP = CARD_CORNER_RADIUS * (1 - Math.SQRT1_2);
const UV_SLACK = 1e-6;

function bounds(points: readonly THREE.Vector2[]): THREE.Box2 {
    return new THREE.Box2().setFromPoints(points as THREE.Vector2[]);
}

describe('roundedRectShape', () => {
    it('should be centred on the origin and span the full card width and height', () => {
        const box = bounds(roundedRectShape(CARD_W, CARD_H, CARD_CORNER_RADIUS).getPoints());

        expect(box.min.x).toBeCloseTo(-HALF_W);
        expect(box.max.x).toBeCloseTo(HALF_W);
        expect(box.min.y).toBeCloseTo(-HALF_H);
        expect(box.max.y).toBeCloseTo(HALF_H);
    });

    it('should round the corners instead of reaching them', () => {
        const corner = new THREE.Vector2(HALF_W, HALF_H);

        const nearest = roundedRectShape(CARD_W, CARD_H, CARD_CORNER_RADIUS)
            .getPoints()
            .reduce((best, p) => Math.min(best, p.distanceTo(corner)), Infinity);

        expect(nearest).toBeGreaterThan(CORNER_GAP * 0.9);
    });
});

describe('remapUvsToUnit', () => {
    it('should map the shape geometry UVs onto the 0..1 texture square', () => {
        const geometry = new THREE.ShapeGeometry(
            roundedRectShape(CARD_W, CARD_H, CARD_CORNER_RADIUS),
        );

        remapUvsToUnit(geometry, CARD_W, CARD_H);

        const uv = geometry.getAttribute('uv');
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < uv.count; i++) {
            min = Math.min(min, uv.getX(i), uv.getY(i));
            max = Math.max(max, uv.getX(i), uv.getY(i));
        }
        expect(min).toBeGreaterThanOrEqual(-UV_SLACK);
        expect(max).toBeLessThanOrEqual(1 + UV_SLACK);
        expect(min).toBeCloseTo(0);
        expect(max).toBeCloseTo(1);
    });
});

describe('cardFaceGeometry', () => {
    it('should build a flat geometry with remapped UVs and the card bounds', () => {
        const geometry = cardFaceGeometry();
        geometry.computeBoundingBox();
        const box = geometry.boundingBox;
        if (!box) throw new Error('bounding box missing');

        expect(box.min.x).toBeCloseTo(-HALF_W);
        expect(box.max.y).toBeCloseTo(HALF_H);
        expect(box.min.z).toBeCloseTo(0);
        expect(box.max.z).toBeCloseTo(0);
        expect(geometry.getAttribute('uv').count).toBeGreaterThan(0);
    });
});
