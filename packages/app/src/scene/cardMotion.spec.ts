import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { ARC_DURATION_MS, ARC_LIFT_MAX, LONG_MOVE_DISTANCE, SETTLE_SCALE_FROM } from './constants';
import {
    arcLift,
    easeInOut,
    flightProgress,
    isLongMove,
    landingScale,
    poseAlongArc,
} from './cardMotion';

const START = 0;
const MID = 0.5;
const END = 1;
const QUARTER = 0.25;
const THREE_QUARTERS = 0.75;
const JUST_UNDER_LONG = LONG_MOVE_DISTANCE - 0.01;
const JUST_OVER_LONG = LONG_MOVE_DISTANCE + 0.01;
const FROM = new THREE.Vector3(-1, 0, 2);
const TO = new THREE.Vector3(1, 0.5, -1);
const TARGET_SCALE = 0.62;

describe('easeInOut', () => {
    it('should pin the ends and pass through the midpoint', () => {
        expect(easeInOut(START)).toBe(0);
        expect(easeInOut(MID)).toBeCloseTo(0.5);
        expect(easeInOut(END)).toBe(1);
    });

    it('should be slow at the ends and symmetric about the midpoint', () => {
        expect(easeInOut(QUARTER)).toBeLessThan(QUARTER);
        expect(easeInOut(THREE_QUARTERS)).toBeGreaterThan(THREE_QUARTERS);
        expect(easeInOut(QUARTER) + easeInOut(THREE_QUARTERS)).toBeCloseTo(1);
    });

    it('should clamp progress outside 0..1', () => {
        expect(easeInOut(-1)).toBe(0);
        expect(easeInOut(2)).toBe(1);
    });
});

describe('arcLift', () => {
    it('should be zero at both ends and peak at ARC_LIFT_MAX in the middle', () => {
        expect(arcLift(START)).toBeCloseTo(0);
        expect(arcLift(MID)).toBeCloseTo(ARC_LIFT_MAX);
        expect(arcLift(END)).toBeCloseTo(0);
    });

    it('should never lift below the straight line', () => {
        for (let p = 0; p <= 1; p += 0.05) expect(arcLift(p)).toBeGreaterThanOrEqual(0);
    });
});

describe('flightProgress', () => {
    it('should reach 1 exactly at ARC_DURATION_MS and clamp after it', () => {
        expect(flightProgress(0)).toBe(0);
        expect(flightProgress(ARC_DURATION_MS / 2)).toBeCloseTo(0.5);
        expect(flightProgress(ARC_DURATION_MS)).toBe(1);
        expect(flightProgress(ARC_DURATION_MS * 3)).toBe(1);
    });
});

describe('isLongMove', () => {
    it('should flag only jumps longer than LONG_MOVE_DISTANCE', () => {
        expect(isLongMove(JUST_UNDER_LONG)).toBe(false);
        expect(isLongMove(JUST_OVER_LONG)).toBe(true);
    });
});

describe('landingScale', () => {
    it('should land at SETTLE_SCALE_FROM of the target so the lerp settles it to 1.0', () => {
        expect(landingScale(TARGET_SCALE)).toBeCloseTo(TARGET_SCALE * SETTLE_SCALE_FROM);
    });
});

describe('poseAlongArc', () => {
    it('should start at the origin and end exactly at the destination', () => {
        const out = new THREE.Vector3();

        expect(poseAlongArc(FROM, TO, START, out).equals(FROM)).toBe(true);
        expect(poseAlongArc(FROM, TO, END, out).distanceTo(TO)).toBeCloseTo(0);
    });

    it('should lift the midpoint above the straight-line midpoint by ARC_LIFT_MAX', () => {
        const straight = FROM.clone().lerp(TO, MID);

        const out = poseAlongArc(FROM, TO, MID, new THREE.Vector3());

        expect(out.x).toBeCloseTo(straight.x);
        expect(out.z).toBeCloseTo(straight.z);
        expect(out.y - straight.y).toBeCloseTo(ARC_LIFT_MAX);
    });
});
