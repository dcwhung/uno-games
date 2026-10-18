/**
 * Table.tsx — the lounge table (polish-v0.3 §2.2): a felt top with procedural
 * grain, a darker felt ring at the edge for depth, a thin gold inlay line and a
 * wooden rim, over a dark wood apron so the table reads as a solid object.
 */
import { TABLE_RADIUS, TABLE_Y } from './constants';
import {
    APRON_HEIGHT,
    APRON_RADIUS,
    APRON_ROUGHNESS,
    APRON_Y,
    FELT,
    FELT_BUMP_SCALE,
    FELT_EDGE,
    FELT_EDGE_OPACITY,
    FELT_EDGE_WIDTH,
    FELT_EDGE_Y,
    FELT_ROUGHNESS,
    FELT_SEGMENTS,
    FELT_THICKNESS,
    FLAT_RING_ROTATION_RAD,
    GOLD,
    INLAY_EMISSIVE_INTENSITY,
    INLAY_METALNESS,
    INLAY_OUTER_RADIUS,
    INLAY_ROUGHNESS,
    INLAY_SEGMENTS,
    INLAY_WIDTH,
    INLAY_Y,
    RIM_METALNESS,
    RIM_RADIAL_SEGMENTS,
    RIM_RADIUS,
    RIM_ROUGHNESS,
    RIM_TUBE_RADIUS,
    RIM_TUBULAR_SEGMENTS,
    WOOD,
    WOOD_HIGHLIGHT,
} from './environment';
import { feltTexture } from './feltTexture';

function FeltTop() {
    // Cached per session; calling it on every render is a map lookup, not a redraw.
    const grain = feltTexture();
    return (
        <mesh position={[0, TABLE_Y - FELT_THICKNESS / 2, 0]} receiveShadow>
            <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, FELT_THICKNESS, FELT_SEGMENTS]} />
            <meshStandardMaterial
                color={FELT}
                roughness={FELT_ROUGHNESS}
                map={grain}
                bumpMap={grain}
                bumpScale={FELT_BUMP_SCALE}
            />
        </mesh>
    );
}

function FeltEdge() {
    return (
        <mesh
            position={[0, FELT_EDGE_Y, 0]}
            rotation={[FLAT_RING_ROTATION_RAD, 0, 0]}
            receiveShadow
        >
            <ringGeometry args={[TABLE_RADIUS - FELT_EDGE_WIDTH, TABLE_RADIUS, FELT_SEGMENTS]} />
            <meshStandardMaterial
                color={FELT_EDGE}
                roughness={FELT_ROUGHNESS}
                transparent
                opacity={FELT_EDGE_OPACITY}
                depthWrite={false}
            />
        </mesh>
    );
}

function GoldInlay() {
    return (
        <mesh position={[0, INLAY_Y, 0]} rotation={[FLAT_RING_ROTATION_RAD, 0, 0]}>
            <ringGeometry
                args={[INLAY_OUTER_RADIUS - INLAY_WIDTH, INLAY_OUTER_RADIUS, INLAY_SEGMENTS]}
            />
            <meshStandardMaterial
                color={GOLD}
                emissive={GOLD}
                emissiveIntensity={INLAY_EMISSIVE_INTENSITY}
                metalness={INLAY_METALNESS}
                roughness={INLAY_ROUGHNESS}
            />
        </mesh>
    );
}

function WoodRim() {
    return (
        <mesh
            position={[0, TABLE_Y, 0]}
            rotation={[FLAT_RING_ROTATION_RAD, 0, 0]}
            castShadow
            receiveShadow
        >
            <torusGeometry
                args={[RIM_RADIUS, RIM_TUBE_RADIUS, RIM_RADIAL_SEGMENTS, RIM_TUBULAR_SEGMENTS]}
            />
            <meshStandardMaterial
                color={WOOD_HIGHLIGHT}
                roughness={RIM_ROUGHNESS}
                metalness={RIM_METALNESS}
            />
        </mesh>
    );
}

function Apron() {
    return (
        <mesh position={[0, APRON_Y, 0]}>
            <cylinderGeometry args={[APRON_RADIUS, APRON_RADIUS, APRON_HEIGHT, FELT_SEGMENTS]} />
            <meshStandardMaterial color={WOOD} roughness={APRON_ROUGHNESS} />
        </mesh>
    );
}

export function Table() {
    return (
        <group>
            <Apron />
            <FeltTop />
            <FeltEdge />
            <GoldInlay />
            <WoodRim />
        </group>
    );
}
