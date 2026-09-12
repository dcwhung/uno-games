/**
 * layout.ts — pure function: GameState → target transform for every visible card.
 * CardMesh lerps toward its target, so a state change animates for free.
 */
import * as THREE from 'three';
import { elementAt } from '@uno/engine';
import type { CardId, GameState, PlayerId } from '@uno/engine';
import {
    CARD_THICKNESS,
    DEFAULT_SEAT_TABLE,
    DISCARD_PILE_POS,
    DRAW_PILE_POS,
    HAND_CARD_ANGLE_RAD,
    HAND_CARD_SCALE,
    HAND_CENTER,
    HAND_FAN_RADIUS,
    HAND_MAX_SPREAD_RAD,
    HAND_RAISE_Y,
    HAND_TILT_RAD,
    OPPONENT_CARD_SCALE,
    OPPONENT_FAN_ANGLE_RAD,
    OPPONENT_FAN_MAX_RAD,
    OPPONENT_HAND_HEIGHT,
    OPPONENT_SEATS,
    PILE_VISIBLE_CARDS,
} from './constants';
import type { SeatPosition, SeatTable } from './constants';

export interface CardTarget {
    readonly id: CardId;
    readonly position: THREE.Vector3;
    readonly quaternion: THREE.Quaternion;
    readonly faceUp: boolean;
    /** Hand card owned by the human — receives pointer events. */
    readonly interactive: boolean;
    readonly legal: boolean;
    readonly scale: number;
}

// Face-up: front (+z) points up, card top (+y) points away from the camera.
const FLAT_FACE_UP = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
// Face-down: back (-z) points up; extra half-turn about the normal keeps the back text upright.
const FLAT_FACE_DOWN = new THREE.Quaternion()
    .setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
    .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI)));
const DISCARD_SCATTER_RAD = 0.35;
// Invariant labels: `fanOffsets` returns one angle per card, and `seatPositions`
// returns one seat per opponent for every table size the engine can produce.
const FAN_ANGLE_PER_CARD = 'fan angle per hand card';
const OPPONENT_SEAT = 'seat per opponent';

export function seatPositions(opponentCount: number): SeatTable {
    return OPPONENT_SEATS[opponentCount] ?? DEFAULT_SEAT_TABLE;
}

function fanOffsets(count: number, perCard: number, maxSpread: number): number[] {
    const spread = Math.min(maxSpread, perCard * (count - 1));
    const step = count > 1 ? spread / (count - 1) : 0;
    return Array.from({ length: count }, (_, i) => -spread / 2 + i * step);
}

function humanHandTargets(
    hand: readonly CardId[],
    selected: CardId | null,
    legal: ReadonlySet<CardId>,
    interactive: boolean,
): CardTarget[] {
    const angles = fanOffsets(hand.length, HAND_CARD_ANGLE_RAD, HAND_MAX_SPREAD_RAD);
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(HAND_TILT_RAD, 0, 0));
    return hand.map((id, i) => {
        const a = elementAt(angles, i, FAN_ANGLE_PER_CARD);
        const raised = id === selected ? HAND_RAISE_Y : 0;
        const x = HAND_CENTER[0] + Math.sin(a) * HAND_FAN_RADIUS;
        const y = HAND_CENTER[1] + (Math.cos(a) - 1) * HAND_FAN_RADIUS * 0.35 + raised;
        const z = HAND_CENTER[2] + i * CARD_THICKNESS * 0.5 - raised * 0.35;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -a)).premultiply(tilt);
        return {
            id,
            position: new THREE.Vector3(x, y, z),
            quaternion: q,
            faceUp: true,
            interactive,
            legal: legal.has(id),
            scale: HAND_CARD_SCALE,
        };
    });
}

function opponentHandTargets(hand: readonly CardId[], seat: SeatPosition): CardTarget[] {
    const angles = fanOffsets(hand.length, OPPONENT_FAN_ANGLE_RAD, OPPONENT_FAN_MAX_RAD);
    // Face the table centre.
    const yaw = Math.atan2(seat[0], seat[2]) + Math.PI;
    const facing = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0));
    // Card front (+z) must point at the opponent, so the back faces the table.
    const backToTable = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
    return hand.map((id, i) => {
        const a = elementAt(angles, i, FAN_ANGLE_PER_CARD);
        const local = new THREE.Vector3(
            Math.sin(a) * 0.9,
            OPPONENT_HAND_HEIGHT + (Math.cos(a) - 1) * 0.3,
            0.45 + i * CARD_THICKNESS,
        );
        local.applyQuaternion(facing);
        const q = new THREE.Quaternion()
            .setFromEuler(new THREE.Euler(0, 0, a))
            .premultiply(backToTable)
            .premultiply(lean)
            .premultiply(facing);
        return {
            id,
            position: new THREE.Vector3(seat[0], seat[1], seat[2]).add(local),
            quaternion: q,
            faceUp: false,
            interactive: false,
            legal: false,
            scale: OPPONENT_CARD_SCALE,
        };
    });
}

function pileTargets(
    ids: readonly CardId[],
    base: readonly [number, number, number],
    faceUp: boolean,
    scatter: boolean,
): CardTarget[] {
    const visible = ids.slice(-PILE_VISIBLE_CARDS);
    const startIndex = ids.length - visible.length;
    return visible.map((id, i) => {
        const n = startIndex + i;
        // Deterministic pseudo-scatter keyed on card id so the discard pile looks hand-thrown.
        const h = scatter ? hash(id) : 0;
        const dx = scatter ? ((h % 100) / 100 - 0.5) * 0.12 : 0;
        const dz = scatter ? (((h >> 7) % 100) / 100 - 0.5) * 0.12 : 0;
        const rz = scatter ? (((h >> 14) % 100) / 100 - 0.5) * DISCARD_SCATTER_RAD * 2 : 0;
        const q = (faceUp ? FLAT_FACE_UP : FLAT_FACE_DOWN)
            .clone()
            .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)));
        return {
            id,
            position: new THREE.Vector3(
                base[0] + dx,
                base[1] + CARD_THICKNESS * (n + 1),
                base[2] + dz,
            ),
            quaternion: q,
            faceUp,
            interactive: false,
            legal: false,
            scale: 1,
        };
    });
}

function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}

export function computeLayout(
    state: GameState,
    humanId: PlayerId,
    selected: CardId | null,
    legal: ReadonlySet<CardId>,
): CardTarget[] {
    const out: CardTarget[] = [];
    const opponents = state.players.filter((p) => p.id !== humanId);
    const seats = seatPositions(opponents.length);
    const humanTurn = state.phase === 'playing' && state.currentPlayer === humanId;

    for (const p of state.players) {
        if (p.id === humanId) out.push(...humanHandTargets(p.hand, selected, legal, humanTurn));
    }
    opponents.forEach((p, i) =>
        out.push(...opponentHandTargets(p.hand, elementAt(seats, i, OPPONENT_SEAT))),
    );
    out.push(...pileTargets(state.drawPile, DRAW_PILE_POS, false, false));
    out.push(...pileTargets(state.discardPile, DISCARD_PILE_POS, true, true));
    return out;
}

export const SPAWN_POSITION = new THREE.Vector3(
    DRAW_PILE_POS[0],
    DRAW_PILE_POS[1] + 0.05,
    DRAW_PILE_POS[2],
);
export const SPAWN_QUATERNION = FLAT_FACE_DOWN;
