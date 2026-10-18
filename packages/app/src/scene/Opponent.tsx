/**
 * Opponent.tsx — one opponent seat: placeholder low-poly body, active-turn ring
 * and the floating nameplate. Replaced by proper avatars later.
 */
import { Html } from '@react-three/drei';
import type { PlayerId } from '@uno/engine';
import { t } from '../i18n';

const NAMEPLATE_SEP = ' · ';

export interface OpponentProps {
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

export function Opponent({
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
