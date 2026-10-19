import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CardId } from '@uno/engine';

import { landingScale } from './cardMotion';
import { createMotionState, GLOW_VISIBLE_MIN, stepCardMotion } from './cardMotionStep';
import type { MotionInput, MotionState } from './cardMotionStep';
import {
    ARC_DURATION_MS,
    GLOW_OPACITY,
    HAND_HOVER_DIM,
    LONG_MOVE_DISTANCE,
    SETTLE_SCALE_FROM,
} from './constants';
import type { CardTarget } from './layout';

const CARD = 'card-1' as CardId;
const NO_DELAY = 0;
const DEAL_DELAY_MS = 90;
/** One 30 fps frame, in seconds. */
const FRAME_S = 1 / 30;
const FRAME_MS = FRAME_S * 1000;
const SPAWN = new THREE.Vector3(-0.45, 0.05, -0.4);
/** Further than LONG_MOVE_DISTANCE from SPAWN: a play / deal, so it flies. */
const FAR_AWAY = SPAWN.clone().add(new THREE.Vector3(LONG_MOVE_DISTANCE * 2, 0, 0));
/** Closer than LONG_MOVE_DISTANCE: a fan shuffle, so it lerps. */
const NEARBY = SPAWN.clone().add(new THREE.Vector3(LONG_MOVE_DISTANCE / 2, 0, 0));
const TARGET_SCALE = 0.64;
/** Enough lerp frames to settle well within 1 % of the target. */
const SETTLE_FRAMES = 60;
const FULL_BRIGHTNESS = 1;
const GLOW_OFF = 0;

function targetAt(position: THREE.Vector3, overrides: Partial<CardTarget> = {}): CardTarget {
    return {
        id: CARD,
        position,
        quaternion: new THREE.Quaternion(),
        faceUp: true,
        interactive: false,
        legal: false,
        selected: false,
        scale: TARGET_SCALE,
        spawnDelayMs: NO_DELAY,
        ...overrides,
    };
}

function inputFor(target: CardTarget): MotionInput {
    const group = new THREE.Group();
    group.position.copy(SPAWN);
    return {
        group,
        target,
        front: new THREE.MeshStandardMaterial(),
        glow: new THREE.MeshBasicMaterial({ opacity: GLOW_OFF, visible: false }),
    };
}

function stepFrames(state: MotionState, input: MotionInput, frames: number): void {
    for (let i = 0; i < frames; i++) stepCardMotion(state, input, FRAME_S);
}

describe('stepCardMotion deal hold', () => {
    it('should keep the card hidden at the spawn point until its stagger has elapsed', () => {
        const input = inputFor(targetAt(FAR_AWAY));
        const state = createMotionState(DEAL_DELAY_MS);

        stepCardMotion(state, input, FRAME_S);

        expect(input.group.visible).toBe(false);
        expect(input.group.position.equals(SPAWN)).toBe(true);
        expect(state.flight).toBeNull();
    });

    it('should release the card once the accumulated frames exceed the stagger', () => {
        const input = inputFor(targetAt(FAR_AWAY));
        const state = createMotionState(DEAL_DELAY_MS);
        const framesToRelease = Math.ceil(DEAL_DELAY_MS / FRAME_MS);

        stepFrames(state, input, framesToRelease + 1);

        expect(input.group.visible).toBe(true);
        expect(input.group.position.equals(SPAWN)).toBe(false);
    });
});

describe('stepCardMotion take-off', () => {
    it('should start an arc flight when the first target is a long way from the spawn', () => {
        const input = inputFor(targetAt(FAR_AWAY));
        const state = createMotionState(NO_DELAY);

        stepCardMotion(state, input, FRAME_S);

        expect(state.flight).not.toBeNull();
        expect(state.flight?.from.equals(SPAWN)).toBe(true);
    });

    it('should lift the card above the straight line midway through the flight', () => {
        const input = inputFor(targetAt(FAR_AWAY));
        const state = createMotionState(NO_DELAY);
        const halfFlightFrames = Math.floor(ARC_DURATION_MS / 2 / FRAME_MS);

        stepFrames(state, input, halfFlightFrames);

        expect(input.group.position.y).toBeGreaterThan(SPAWN.y);
        expect(input.group.position.y).toBeGreaterThan(FAR_AWAY.y);
    });

    it('should lerp instead of flying when the first target is nearby', () => {
        const input = inputFor(targetAt(NEARBY));
        const state = createMotionState(NO_DELAY);

        stepCardMotion(state, input, FRAME_S);

        expect(state.flight).toBeNull();
        expect(input.group.position.x).toBeGreaterThan(SPAWN.x);
        expect(input.group.position.x).toBeLessThan(NEARBY.x);
    });

    it('should take off again when a settled target jumps a long way', () => {
        const input = inputFor(targetAt(NEARBY));
        const state = createMotionState(NO_DELAY);
        stepFrames(state, input, SETTLE_FRAMES);
        expect(state.flight).toBeNull();

        const moved: MotionInput = { ...input, target: targetAt(FAR_AWAY) };
        stepCardMotion(state, moved, FRAME_S);

        expect(state.flight).not.toBeNull();
    });
});

describe('stepCardMotion landing', () => {
    it('should land at the landing scale and hand over to the lerp when the arc completes', () => {
        const input = inputFor(targetAt(FAR_AWAY));
        const state = createMotionState(NO_DELAY);
        const flightFrames = Math.ceil(ARC_DURATION_MS / FRAME_MS);

        stepFrames(state, input, flightFrames);

        expect(state.flight).toBeNull();
        expect(input.group.scale.x).toBeCloseTo(landingScale(TARGET_SCALE));
        expect(input.group.scale.x).toBeCloseTo(TARGET_SCALE * SETTLE_SCALE_FROM);
        expect(input.group.position.distanceTo(FAR_AWAY)).toBeLessThan(LONG_MOVE_DISTANCE / 10);
    });

    it('should settle the scale from the landing scale up to the target scale', () => {
        const input = inputFor(targetAt(FAR_AWAY));
        const state = createMotionState(NO_DELAY);
        const flightFrames = Math.ceil(ARC_DURATION_MS / FRAME_MS);
        stepFrames(state, input, flightFrames);

        stepFrames(state, input, SETTLE_FRAMES);

        expect(input.group.scale.x).toBeCloseTo(TARGET_SCALE);
        expect(input.group.position.distanceTo(FAR_AWAY)).toBeCloseTo(0);
    });
});

describe('stepCardMotion look', () => {
    it('should dim an illegal interactive card and restore a legal one', () => {
        const dim = targetAt(NEARBY, { interactive: true, legal: false });
        const input = inputFor(dim);
        const state = createMotionState(NO_DELAY);

        stepFrames(state, input, SETTLE_FRAMES);
        expect(input.front.color.r).toBeCloseTo(HAND_HOVER_DIM);

        const legal: MotionInput = {
            ...input,
            target: targetAt(NEARBY, { interactive: true, legal: true }),
        };
        stepFrames(state, legal, SETTLE_FRAMES);
        expect(input.front.color.r).toBeCloseTo(FULL_BRIGHTNESS);
    });

    it('should fade the glow in for a selected card and show the plane once it is visible', () => {
        const input = inputFor(targetAt(NEARBY, { selected: true }));
        const state = createMotionState(NO_DELAY);

        stepCardMotion(state, input, FRAME_S);
        const afterOneFrame = input.glow.opacity;
        stepFrames(state, input, SETTLE_FRAMES);

        expect(afterOneFrame).toBeGreaterThan(GLOW_OFF);
        expect(afterOneFrame).toBeLessThan(GLOW_OPACITY);
        expect(input.glow.opacity).toBeCloseTo(GLOW_OPACITY);
        expect(input.glow.visible).toBe(true);
    });

    it('should fade the glow out on deselect and hide the plane below the visible floor', () => {
        const input = inputFor(targetAt(NEARBY, { selected: true }));
        const state = createMotionState(NO_DELAY);
        stepFrames(state, input, SETTLE_FRAMES);

        const deselected: MotionInput = { ...input, target: targetAt(NEARBY) };
        stepFrames(state, deselected, SETTLE_FRAMES);

        expect(input.glow.opacity).toBeLessThan(GLOW_VISIBLE_MIN);
        expect(input.glow.visible).toBe(false);
    });
});
