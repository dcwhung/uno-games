/**
 * Opponent.tsx — one opponent seat as a stylised procedural figure (polish-v0.3
 * §2.2): capsule torso in the seat colour, smooth head, two eye dots facing the
 * table and a rounded cap. The active player gets a breathing gold floor ring;
 * a catchable player gets a pulsing blue ring and leans toward the table.
 *
 * No DOM nameplate: the name, card count and UNO / catch badges live in the HUD
 * player strip, so the figure only needs its seat, colour and the two states.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    ACTIVE_RING_INNER_RADIUS,
    ACTIVE_RING_OPACITY,
    ACTIVE_RING_OUTER_RADIUS,
    CAP_RADIUS,
    CAP_ROUGHNESS,
    CAP_SEGMENTS,
    CAP_THETA_LENGTH_RAD,
    CAP_Y,
    CATCH_LEAN_RAD,
    CATCH_RING,
    CATCH_RING_INNER_RADIUS,
    CATCH_RING_OPACITY_MIN,
    CATCH_RING_OUTER_RADIUS,
    EYE_RADIUS,
    EYE_ROUGHNESS,
    EYE_SEGMENTS,
    EYE_SPACING_X,
    EYE_Y,
    EYE_Z,
    FLAT_RING_ROTATION_RAD,
    FULL_TURN_RAD,
    GOLD,
    HEAD_RADIUS,
    HEAD_ROUGHNESS,
    HEAD_SEGMENTS,
    HEAD_Y,
    INK,
    LEAN_LERP_SPEED,
    RING_SEGMENTS,
    RING_Y,
    SKIN,
    TORSO_CAP_SEGMENTS,
    TORSO_LENGTH,
    TORSO_RADIAL_SEGMENTS,
    TORSO_RADIUS,
    TORSO_ROUGHNESS,
    TORSO_Y,
    breathScale,
    pulseOpacity,
} from './environment';
import { seatYaw } from './layout';

export interface OpponentProps {
    readonly seat: readonly [number, number, number];
    readonly color: string;
    readonly active: boolean;
    readonly catchable: boolean;
    readonly onCatch: () => void;
}

function Eye({ x }: { readonly x: number }) {
    return (
        <mesh position={[x, EYE_Y, EYE_Z]}>
            <sphereGeometry args={[EYE_RADIUS, EYE_SEGMENTS, EYE_SEGMENTS]} />
            <meshStandardMaterial color={INK} roughness={EYE_ROUGHNESS} />
        </mesh>
    );
}

function Figure({ color }: { readonly color: string }) {
    return (
        <>
            <mesh position={[0, TORSO_Y, 0]} castShadow>
                <capsuleGeometry
                    args={[TORSO_RADIUS, TORSO_LENGTH, TORSO_CAP_SEGMENTS, TORSO_RADIAL_SEGMENTS]}
                />
                <meshStandardMaterial color={color} roughness={TORSO_ROUGHNESS} />
            </mesh>
            <mesh position={[0, HEAD_Y, 0]} castShadow>
                <sphereGeometry args={[HEAD_RADIUS, HEAD_SEGMENTS, HEAD_SEGMENTS]} />
                <meshStandardMaterial color={SKIN} roughness={HEAD_ROUGHNESS} />
            </mesh>
            <Eye x={-EYE_SPACING_X} />
            <Eye x={EYE_SPACING_X} />
            <mesh position={[0, CAP_Y, 0]} castShadow>
                {/* Partial sphere: a skull-cap from the pole down to CAP_THETA_LENGTH_RAD. */}
                <sphereGeometry
                    args={[
                        CAP_RADIUS,
                        CAP_SEGMENTS,
                        CAP_SEGMENTS,
                        0,
                        FULL_TURN_RAD,
                        0,
                        CAP_THETA_LENGTH_RAD,
                    ]}
                />
                <meshStandardMaterial color={color} roughness={CAP_ROUGHNESS} />
            </mesh>
        </>
    );
}

/** The figure, easing its forward lean in and out as `catchable` toggles. */
function LeaningFigure({
    color,
    catchable,
}: {
    readonly color: string;
    readonly catchable: boolean;
}) {
    const ref = useRef<THREE.Group>(null);
    useFrame((_, dt) => {
        const group = ref.current;
        if (!group) return;
        const wanted = catchable ? CATCH_LEAN_RAD : 0;
        group.rotation.x += (wanted - group.rotation.x) * (1 - Math.exp(-LEAN_LERP_SPEED * dt));
    });
    return (
        <group ref={ref}>
            <Figure color={color} />
        </group>
    );
}

function ActiveRing() {
    const ref = useRef<THREE.Mesh>(null);
    useFrame(({ clock }) => {
        ref.current?.scale.setScalar(breathScale(clock.elapsedTime));
    });
    return (
        <mesh ref={ref} position={[0, RING_Y, 0]} rotation={[FLAT_RING_ROTATION_RAD, 0, 0]}>
            <ringGeometry
                args={[ACTIVE_RING_INNER_RADIUS, ACTIVE_RING_OUTER_RADIUS, RING_SEGMENTS]}
            />
            <meshBasicMaterial
                color={GOLD}
                transparent
                opacity={ACTIVE_RING_OPACITY}
                depthWrite={false}
            />
        </mesh>
    );
}

function CatchRing() {
    const ref = useRef<THREE.MeshBasicMaterial>(null);
    useFrame(({ clock }) => {
        if (ref.current) ref.current.opacity = pulseOpacity(clock.elapsedTime);
    });
    return (
        <mesh position={[0, RING_Y, 0]} rotation={[FLAT_RING_ROTATION_RAD, 0, 0]}>
            <ringGeometry
                args={[CATCH_RING_INNER_RADIUS, CATCH_RING_OUTER_RADIUS, RING_SEGMENTS]}
            />
            <meshBasicMaterial
                ref={ref}
                color={CATCH_RING}
                transparent
                opacity={CATCH_RING_OPACITY_MIN}
                depthWrite={false}
            />
        </mesh>
    );
}

export function Opponent({ seat, color, active, catchable, onCatch }: OpponentProps) {
    // Face the table centre; local +z then points at the table, so a positive
    // X rotation leans the figure forward.
    return (
        <group
            position={[seat[0], seat[1], seat[2]]}
            rotation={[0, seatYaw(seat), 0]}
            onClick={() => {
                if (catchable) onCatch();
            }}
        >
            <LeaningFigure color={color} catchable={catchable} />
            {active && <ActiveRing />}
            {catchable && <CatchRing />}
        </group>
    );
}
