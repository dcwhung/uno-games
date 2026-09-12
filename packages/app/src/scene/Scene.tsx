import { useEffect, useMemo } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { core, elementAt } from '@uno/engine';
import type { CardId, GameState, PlayerId } from '@uno/engine';
import { t } from '../i18n';
import { HUMAN_ID, legalMovesForHuman, playerName, useGameStore } from '../store/gameStore';
import { CardMesh } from './CardMesh';
import {
    CAMERA_POS,
    CAMERA_TARGET,
    FOV_LANDSCAPE,
    FOV_PORTRAIT,
    SEAT_COLORS,
    TABLE_RADIUS,
    TABLE_Y,
} from './constants';
import { computeLayout, seatPositions } from './layout';

const NAMEPLATE_SEP = ' · ';
// Invariant labels (W-009): `computeLayout` emits one target per card already in
// `state.cards`, `seatPositions` one seat per opponent, and the colour index is a
// modulo of the palette's own length.
const OPPONENT_SEAT = 'seat per opponent';
const SEAT_COLOR = 'seat colour';

// ---------------------------------------------------------------------------
// Camera: portrait gets a wider FOV so the whole table fits.
// ---------------------------------------------------------------------------

function ResponsiveCamera() {
    const { camera, size } = useThree();
    useEffect(() => {
        const cam = camera as THREE.PerspectiveCamera;
        cam.position.set(...CAMERA_POS);
        cam.lookAt(new THREE.Vector3(...CAMERA_TARGET));
        cam.fov = size.height > size.width ? FOV_PORTRAIT : FOV_LANDSCAPE;
        cam.updateProjectionMatrix();
    }, [camera, size]);
    return null;
}

// ---------------------------------------------------------------------------
// Placeholder low-poly opponent: box body + sphere head. Replaced by glTF later.
// ---------------------------------------------------------------------------

interface OpponentProps {
    readonly id: PlayerId;
    readonly seat: readonly [number, number, number];
    readonly color: string;
    readonly active: boolean;
    readonly catchable: boolean;
    readonly name: string;
    readonly cards: number;
    readonly calledUno: boolean;
    readonly onCatch: () => void;
}

function Opponent({
    seat,
    color,
    active,
    catchable,
    name,
    cards,
    calledUno,
    onCatch,
}: OpponentProps) {
    const yaw = Math.atan2(seat[0], seat[2]) + Math.PI;
    return (
        <group
            position={[seat[0], seat[1], seat[2]]}
            rotation={[0, yaw, 0]}
            onClick={() => {
                if (catchable) onCatch();
            }}
        >
            <mesh position={[0, 0.45, 0]} castShadow>
                <boxGeometry args={[0.7, 0.9, 0.5]} />
                <meshStandardMaterial color={color} flatShading />
            </mesh>
            <mesh position={[0, 1.2, 0]} castShadow>
                <sphereGeometry args={[0.32, 8, 6]} />
                <meshStandardMaterial color="#ffe0c2" flatShading />
            </mesh>
            {active && (
                <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.55, 0.65, 32]} />
                    <meshBasicMaterial color="#ffd54a" />
                </mesh>
            )}
            <Html
                position={[0, 1.7, 0]}
                center
                distanceFactor={6}
                style={{ pointerEvents: 'none' }}
            >
                <div
                    className={`nameplate${active ? ' active' : ''}${catchable ? ' catchable' : ''}`}
                >
                    {name}
                    {NAMEPLATE_SEP}
                    {cards}
                    {calledUno ? `${NAMEPLATE_SEP}${t('scene.unoTag')}` : ''}
                    {catchable ? `${NAMEPLATE_SEP}${t('scene.tapToCatch')}` : ''}
                </div>
            </Html>
        </group>
    );
}

// ---------------------------------------------------------------------------
// Table contents driven by store state
// ---------------------------------------------------------------------------

function TableContents({ state }: { state: GameState }) {
    const selected = useGameStore((s) => s.selectedCard) as CardId | null;
    const select = useGameStore((s) => s.select);
    const dispatch = useGameStore((s) => s.dispatch);

    const legal = useMemo(() => new Set(legalMovesForHuman(state).map((m) => m.card)), [state]);
    const targets = useMemo(
        () => computeLayout(state, HUMAN_ID, selected, legal),
        [state, selected, legal],
    );

    const playCard = (id: CardId) => {
        if (!legal.has(id)) {
            select(null);
            return;
        }
        dispatch({ type: 'PLAY_CARD', player: HUMAN_ID, card: id });
    };

    const opponents = state.players.filter((p) => p.id !== HUMAN_ID);
    const seats = seatPositions(opponents.length);

    return (
        <>
            {targets.map((t) => (
                <CardMesh
                    key={t.id}
                    face={core.getCard(state, t.id).front}
                    target={t}
                    onTap={() => (selected === t.id ? playCard(t.id) : select(t.id))}
                    onSwipeUp={() => playCard(t.id)}
                />
            ))}
            {opponents.map((p, i) => (
                <Opponent
                    key={p.id}
                    id={p.id}
                    seat={elementAt(seats, i, OPPONENT_SEAT)}
                    color={elementAt(SEAT_COLORS, i % SEAT_COLORS.length, SEAT_COLOR)}
                    active={
                        state.currentPlayer === p.id &&
                        state.phase !== 'round_over' &&
                        state.phase !== 'game_over'
                    }
                    catchable={state.unoVulnerable === p.id}
                    name={playerName(state, p.id)}
                    cards={p.hand.length}
                    calledUno={p.calledUno}
                    onCatch={() => dispatch({ type: 'CATCH_UNO', player: HUMAN_ID, target: p.id })}
                />
            ))}
        </>
    );
}

export function Scene() {
    const state = useGameStore((s) => s.state);
    return (
        <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [...CAMERA_POS], fov: FOV_PORTRAIT, near: 0.1, far: 30 }}
            onPointerMissed={() => useGameStore.getState().select(null)}
        >
            <ResponsiveCamera />
            <color attach="background" args={['#1b1b1f']} />
            <hemisphereLight args={['#ffffff', '#3d3a44', 0.7]} />
            <directionalLight
                position={[2, 6, 3]}
                intensity={1.4}
                castShadow
                shadow-mapSize={[1024, 1024]}
            />
            <mesh position={[0, TABLE_Y - 0.05, 0]} receiveShadow>
                <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.1, 10]} />
                <meshStandardMaterial color="#2f6b46" flatShading />
            </mesh>
            {state && <TableContents state={state} />}
        </Canvas>
    );
}
