/**
 * useCardMotion.ts — drives cardMotionStep.ts from R3F's frame loop for one
 * card (polish-v0.3 §2.3). The hook only owns the per-card state and the
 * useFrame subscription; every decision lives in the pure step function so it
 * is testable in node.
 */
import type { RefObject } from 'react';
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { createMotionState, stepCardMotion } from './cardMotionStep';
import type { CardTarget } from './layout';

export function useCardMotion(
    group: RefObject<THREE.Group>,
    target: CardTarget,
    front: THREE.MeshStandardMaterial,
    glow: THREE.MeshBasicMaterial,
): void {
    // The stagger is honoured once, on mount: later target changes must not re-delay the card.
    const state = useRef(createMotionState(target.spawnDelayMs));

    useFrame((_, dt) => {
        const g = group.current;
        if (!g) return;
        stepCardMotion(state.current, { group: g, target, front, glow }, dt);
    });
}
