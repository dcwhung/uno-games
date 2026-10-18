/**
 * CardMesh.tsx — one card: a rounded front and back, a thin edge wall and a
 * gold rim-glow plane, grouped so the motion hook drives a single transform
 * (polish-v0.3 §2.3). Pointer events on the group arrive by R3F bubbling from
 * the child meshes.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CardFace } from '@uno/engine';
import { cardEdgeGeometry, cardFaceGeometry, cardGlowGeometry } from './cardShape';
import { backTexture, faceTexture } from './cardTextures';
import { CARD_GOLD, CARD_PAPER, CARD_THICKNESS, GLOW_SCALE, SWIPE_UP_PX } from './constants';
import { SPAWN_POSITION, SPAWN_QUATERNION, type CardTarget } from './layout';
import { useCardMotion } from './useCardMotion';

interface Props {
    readonly face: CardFace;
    readonly target: CardTarget;
    readonly onTap?: () => void;
    readonly onSwipeUp?: () => void;
}

interface CardMaterials {
    readonly front: THREE.MeshStandardMaterial;
    readonly back: THREE.MeshStandardMaterial;
    readonly glow: THREE.MeshBasicMaterial;
}

const FACE_GEOMETRY = cardFaceGeometry();
const EDGE_GEOMETRY = cardEdgeGeometry();
const GLOW_GEOMETRY = cardGlowGeometry(GLOW_SCALE);
// Extrude material groups: 0 = caps (never drawn; the faces cover them), 1 = side wall.
const EDGE_MATERIALS = [
    new THREE.MeshBasicMaterial({ visible: false }),
    new THREE.MeshStandardMaterial({ color: CARD_PAPER, roughness: 0.8 }),
];
const FACE_ROUGHNESS = 0.6;
/** Faces sit exactly on the edge wall's two ends. */
const FACE_Z = CARD_THICKNESS / 2;
/** The glow plane sits just behind the back face so only its rim shows around the card. */
const GLOW_Z = CARD_THICKNESS;
const BACK_ROTATION: [number, number, number] = [0, Math.PI, 0];
const NO_RAYCAST = (): void => undefined;

/** Textures are cached and shared; only the per-card materials are ours to free. */
function disposeMaterials(materials: CardMaterials): void {
    materials.front.dispose();
    materials.back.dispose();
    materials.glow.dispose();
}

function useCardMaterials(face: CardFace): CardMaterials {
    const materials = useMemo<CardMaterials>(
        () => ({
            front: new THREE.MeshStandardMaterial({
                map: faceTexture(face),
                roughness: FACE_ROUGHNESS,
            }),
            back: new THREE.MeshStandardMaterial({
                map: backTexture(),
                roughness: FACE_ROUGHNESS,
            }),
            glow: new THREE.MeshBasicMaterial({
                color: CARD_GOLD,
                transparent: true,
                opacity: 0,
                visible: false,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            }),
        }),
        [face],
    );
    useEffect(() => () => disposeMaterials(materials), [materials]);
    return materials;
}

function useCardPointer(target: CardTarget, onTap?: () => void, onSwipeUp?: () => void) {
    const pointerDownY = useRef<number | null>(null);
    const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
        if (!target.interactive) return;
        e.stopPropagation();
        pointerDownY.current = e.clientY;
    };
    const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
        if (!target.interactive || pointerDownY.current === null) return;
        e.stopPropagation();
        const dy = pointerDownY.current - e.clientY;
        pointerDownY.current = null;
        if (dy > SWIPE_UP_PX) onSwipeUp?.();
        else onTap?.();
    };
    return { onPointerDown, onPointerUp };
}

export function CardMesh({ face, target, onTap, onSwipeUp }: Props) {
    const group = useRef<THREE.Group>(null);
    const { front, back, glow } = useCardMaterials(face);
    useCardMotion(group, target, front, glow);
    const pointer = useCardPointer(target, onTap, onSwipeUp);

    return (
        <group
            ref={group}
            position={SPAWN_POSITION}
            quaternion={SPAWN_QUATERNION}
            onPointerDown={pointer.onPointerDown}
            onPointerUp={pointer.onPointerUp}
        >
            <mesh geometry={FACE_GEOMETRY} material={front} position={[0, 0, FACE_Z]} castShadow />
            <mesh
                geometry={FACE_GEOMETRY}
                material={back}
                position={[0, 0, -FACE_Z]}
                rotation={BACK_ROTATION}
                castShadow
            />
            <mesh geometry={EDGE_GEOMETRY} material={EDGE_MATERIALS} castShadow />
            <mesh
                geometry={GLOW_GEOMETRY}
                material={glow}
                position={[0, 0, -GLOW_Z]}
                raycast={NO_RAYCAST}
            />
        </group>
    );
}
