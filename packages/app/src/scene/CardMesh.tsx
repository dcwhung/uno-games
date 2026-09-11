import { useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CardFace } from '@uno/engine';
import { backTexture, faceTexture } from './cardTextures';
import {
    CARD_H,
    CARD_THICKNESS,
    CARD_W,
    HAND_HOVER_DIM,
    LERP_SPEED,
    SWIPE_UP_PX,
} from './constants';
import { SPAWN_POSITION, SPAWN_QUATERNION, type CardTarget } from './layout';

interface Props {
    readonly face: CardFace;
    readonly target: CardTarget;
    readonly onTap?: () => void;
    readonly onSwipeUp?: () => void;
}

const GEOMETRY = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_THICKNESS);
const EDGE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.8 });
const DIM = new THREE.Color(HAND_HOVER_DIM, HAND_HOVER_DIM, HAND_HOVER_DIM);
const BRIGHT = new THREE.Color(1, 1, 1);
const TARGET_SCALE = new THREE.Vector3();

export function CardMesh({ face, target, onTap, onSwipeUp }: Props) {
    const ref = useRef<THREE.Mesh>(null);
    const pointerDownY = useRef<number | null>(null);

    const materials = useMemo(() => {
        const front = new THREE.MeshStandardMaterial({ map: faceTexture(face), roughness: 0.6 });
        const back = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.6 });
        // BoxGeometry material order: +x, -x, +y, -y, +z (front), -z (back)
        return [EDGE_MATERIAL, EDGE_MATERIAL, EDGE_MATERIAL, EDGE_MATERIAL, front, back];
    }, [face]);

    useFrame((_, dt) => {
        const m = ref.current;
        if (!m) return;
        const k = 1 - Math.exp(-LERP_SPEED * dt);
        m.position.lerp(target.position, k);
        m.quaternion.slerp(target.quaternion, k);
        m.scale.lerp(TARGET_SCALE.setScalar(target.scale), k);
        const front = materials[4] as THREE.MeshStandardMaterial;
        const wantDim = target.interactive && !target.legal;
        front.color.lerp(wantDim ? DIM : BRIGHT, k);
    });

    const handleDown = (e: ThreeEvent<PointerEvent>) => {
        if (!target.interactive) return;
        e.stopPropagation();
        pointerDownY.current = e.clientY;
    };
    const handleUp = (e: ThreeEvent<PointerEvent>) => {
        if (!target.interactive || pointerDownY.current === null) return;
        e.stopPropagation();
        const dy = pointerDownY.current - e.clientY;
        pointerDownY.current = null;
        if (dy > SWIPE_UP_PX) onSwipeUp?.();
        else onTap?.();
    };

    return (
        <mesh
            ref={ref}
            geometry={GEOMETRY}
            material={materials}
            position={SPAWN_POSITION}
            quaternion={SPAWN_QUATERNION}
            castShadow
            onPointerDown={handleDown}
            onPointerUp={handleUp}
        />
    );
}
