/**
 * cardMotion.ts — pure helpers for the card flight arc (polish-v0.3 §2.3).
 * A card whose target jumps a long way (play, draw, deal) flies along an arc
 * that lifts by up to ARC_LIFT_MAX at the midpoint, eases in and out, and lands
 * slightly small so the per-frame lerp settles it to its resting scale.
 */
import * as THREE from 'three';
import { ARC_DURATION_MS, ARC_LIFT_MAX, LONG_MOVE_DISTANCE, SETTLE_SCALE_FROM } from './constants';

const HALF = 0.5;
const UP = new THREE.Vector3(0, 1, 0);

function clamp01(t: number): number {
    return Math.min(1, Math.max(0, t));
}

/** Quadratic ease-in-out: slow at both ends, 0.5 at the midpoint, symmetric. */
export function easeInOut(t: number): number {
    const p = clamp01(t);
    return p < HALF ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
}

/** Height above the straight line at `progress`: a half sine peaking at ARC_LIFT_MAX. */
export function arcLift(progress: number): number {
    return ARC_LIFT_MAX * Math.sin(Math.PI * clamp01(progress));
}

/** Flight completion in 0..1 for the time elapsed since take-off. */
export function flightProgress(elapsedMs: number): number {
    return clamp01(elapsedMs / ARC_DURATION_MS);
}

export function isLongMove(distance: number): boolean {
    return distance > LONG_MOVE_DISTANCE;
}

/** Scale a card has the instant it lands; the lerp then settles it to `targetScale`. */
export function landingScale(targetScale: number): number {
    return targetScale * SETTLE_SCALE_FROM;
}

/** Position on the eased arc from `from` to `to` at `progress`, written into `out`. */
export function poseAlongArc(
    from: THREE.Vector3,
    to: THREE.Vector3,
    progress: number,
    out: THREE.Vector3,
): THREE.Vector3 {
    const p = clamp01(progress);
    return out.copy(from).lerp(to, easeInOut(p)).addScaledVector(UP, arcLift(p));
}
