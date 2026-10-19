/**
 * cardMotionStep.ts — the per-frame state machine for one card (polish-v0.3
 * §2.3), pure given a THREE.Group and its two materials so it runs in node.
 * Holds the card at the spawn point for its deal stagger, flies long target
 * jumps along an arc with a landing settle, lerps everything else, and fades
 * the illegal dim and the selection glow. useCardMotion.ts drives it from
 * useFrame; cardMotion.ts holds the arc maths.
 */
import * as THREE from 'three';
import { easeInOut, flightProgress, isLongMove, landingScale, poseAlongArc } from './cardMotion';
import { GLOW_OPACITY, HAND_HOVER_DIM, LERP_SPEED } from './constants';
import type { CardTarget } from './layout';

export interface Flight {
    readonly from: THREE.Vector3;
    readonly fromQuaternion: THREE.Quaternion;
    elapsedMs: number;
}

export interface MotionState {
    /** Deal stagger still to wait before the card leaves the spawn point. */
    delayLeftMs: number;
    /** Target position seen on the previous frame; a long jump from it starts a flight. */
    lastTarget: THREE.Vector3 | null;
    flight: Flight | null;
}

/** Everything one frame of motion reads and writes. */
export interface MotionInput {
    readonly group: THREE.Group;
    readonly target: CardTarget;
    readonly front: THREE.MeshStandardMaterial;
    readonly glow: THREE.MeshBasicMaterial;
}

const MS_PER_SECOND = 1000;
const DIM = new THREE.Color(HAND_HOVER_DIM, HAND_HOVER_DIM, HAND_HOVER_DIM);
const BRIGHT = new THREE.Color(1, 1, 1);
/** Below this opacity the glow plane is skipped entirely. */
export const GLOW_VISIBLE_MIN = 0.01;
const SCALE_SCRATCH = new THREE.Vector3();

export function createMotionState(spawnDelayMs: number): MotionState {
    return { delayLeftMs: spawnDelayMs, lastTarget: null, flight: null };
}

/** Frame-rate independent lerp factor: the same fraction of the gap closes per second. */
function lerpFactor(dt: number): number {
    return 1 - Math.exp(-LERP_SPEED * dt);
}

/** Keeps the card hidden at the spawn point until its deal stagger has elapsed. */
function holdForDeal(state: MotionState, group: THREE.Group, dt: number): boolean {
    if (state.delayLeftMs <= 0) return false;
    state.delayLeftMs -= dt * MS_PER_SECOND;
    group.visible = false;
    return true;
}

/** Starts a flight when the target has jumped a long way since last frame. */
function maybeTakeOff(state: MotionState, group: THREE.Group, target: CardTarget): void {
    const origin = state.lastTarget ?? group.position;
    if (isLongMove(origin.distanceTo(target.position))) {
        state.flight = {
            from: group.position.clone(),
            fromQuaternion: group.quaternion.clone(),
            elapsedMs: 0,
        };
    }
    state.lastTarget = (state.lastTarget ?? new THREE.Vector3()).copy(target.position);
}

function stepFlight(state: MotionState, group: THREE.Group, target: CardTarget, dt: number): void {
    const flight = state.flight;
    if (!flight) return;
    flight.elapsedMs += dt * MS_PER_SECOND;
    const progress = flightProgress(flight.elapsedMs);
    poseAlongArc(flight.from, target.position, progress, group.position);
    group.quaternion.slerpQuaternions(
        flight.fromQuaternion,
        target.quaternion,
        easeInOut(progress),
    );
    group.scale.lerp(SCALE_SCRATCH.setScalar(landingScale(target.scale)), lerpFactor(dt));
    if (progress >= 1) {
        // Land small; the ordinary lerp then settles the scale to the target.
        group.scale.setScalar(landingScale(target.scale));
        state.flight = null;
    }
}

function stepLerp(group: THREE.Group, target: CardTarget, dt: number): void {
    const k = lerpFactor(dt);
    group.position.lerp(target.position, k);
    group.quaternion.slerp(target.quaternion, k);
    group.scale.lerp(SCALE_SCRATCH.setScalar(target.scale), k);
}

function stepLook(input: MotionInput, dt: number): void {
    const { front, glow, target } = input;
    const k = lerpFactor(dt);
    const wantDim = target.interactive && !target.legal;
    front.color.lerp(wantDim ? DIM : BRIGHT, k);
    const wantGlow = target.selected ? GLOW_OPACITY : 0;
    glow.opacity += (wantGlow - glow.opacity) * k;
    glow.visible = glow.opacity > GLOW_VISIBLE_MIN;
}

/** Advances one card by `dt` seconds: deal hold, take-off, arc or lerp, then the look fades. */
export function stepCardMotion(state: MotionState, input: MotionInput, dt: number): void {
    const { group, target } = input;
    if (holdForDeal(state, group, dt)) return;
    group.visible = true;
    maybeTakeOff(state, group, target);
    if (state.flight) stepFlight(state, group, target, dt);
    else stepLerp(group, target, dt);
    stepLook(input, dt);
}
