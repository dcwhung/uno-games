/**
 * useCardMotion.ts — per-frame motion for one card (polish-v0.3 §2.3).
 * Holds the card at the spawn point for its deal stagger, flies long target
 * jumps along an arc with a landing settle, lerps everything else, and fades
 * the illegal dim and the selection glow.
 */
import type { RefObject } from 'react';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { easeInOut, flightProgress, isLongMove, landingScale, poseAlongArc } from './cardMotion';
import { GLOW_OPACITY, HAND_HOVER_DIM, LERP_SPEED } from './constants';
import type { CardTarget } from './layout';

interface Flight {
    readonly from: THREE.Vector3;
    readonly fromQuaternion: THREE.Quaternion;
    elapsedMs: number;
}

interface MotionState {
    /** Deal stagger still to wait before the card leaves the spawn point. */
    delayLeftMs: number;
    /** Target position seen on the previous frame; a long jump from it starts a flight. */
    lastTarget: THREE.Vector3 | null;
    flight: Flight | null;
}

const MS_PER_SECOND = 1000;
const DIM = new THREE.Color(HAND_HOVER_DIM, HAND_HOVER_DIM, HAND_HOVER_DIM);
const BRIGHT = new THREE.Color(1, 1, 1);
/** Below this opacity the glow plane is skipped entirely. */
const GLOW_VISIBLE_MIN = 0.01;
const SCALE_SCRATCH = new THREE.Vector3();

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
    const k = 1 - Math.exp(-LERP_SPEED * dt);
    group.scale.lerp(SCALE_SCRATCH.setScalar(landingScale(target.scale)), k);
    if (progress >= 1) {
        // Land small; the ordinary lerp below then settles the scale to 1.0.
        group.scale.setScalar(landingScale(target.scale));
        state.flight = null;
    }
}

function stepLerp(group: THREE.Group, target: CardTarget, dt: number): void {
    const k = 1 - Math.exp(-LERP_SPEED * dt);
    group.position.lerp(target.position, k);
    group.quaternion.slerp(target.quaternion, k);
    group.scale.lerp(SCALE_SCRATCH.setScalar(target.scale), k);
}

function stepLook(
    front: THREE.MeshStandardMaterial,
    glow: THREE.MeshBasicMaterial,
    target: CardTarget,
    dt: number,
): void {
    const k = 1 - Math.exp(-LERP_SPEED * dt);
    const wantDim = target.interactive && !target.legal;
    front.color.lerp(wantDim ? DIM : BRIGHT, k);
    const wantGlow = target.selected ? GLOW_OPACITY : 0;
    glow.opacity += (wantGlow - glow.opacity) * k;
    glow.visible = glow.opacity > GLOW_VISIBLE_MIN;
}

export function useCardMotion(
    group: RefObject<THREE.Group>,
    target: CardTarget,
    front: THREE.MeshStandardMaterial,
    glow: THREE.MeshBasicMaterial,
): void {
    // The stagger is honoured once, on mount: later target changes must not re-delay the card.
    const state = useRef<MotionState>({
        delayLeftMs: target.spawnDelayMs,
        lastTarget: null,
        flight: null,
    });

    useFrame((_, dt) => {
        const g = group.current;
        if (!g) return;
        const s = state.current;
        if (holdForDeal(s, g, dt)) return;
        g.visible = true;
        maybeTakeOff(s, g, target);
        if (s.flight) stepFlight(s, g, target, dt);
        else stepLerp(g, target, dt);
        stepLook(front, glow, target, dt);
    });
}
