/**
 * layout.ts — pure function: GameState → target transform for every visible card.
 * CardMesh lerps toward its target, so a state change animates for free.
 */
import * as THREE from 'three';
import { elementAt } from '@uno/engine';
import type { CardId, GameState, PlayerId } from '@uno/engine';
import {
    CARD_THICKNESS,
    DEAL_STAGGER_MS,
    DEFAULT_SEAT_TABLE,
    DISCARD_PILE_POS,
    DRAW_PILE_POS,
    HAND_CENTER,
    HAND_LEGAL_LIFT,
    HAND_RAISE_Y,
    HAND_SELECTED_SCALE,
    HAND_TILT_RAD,
    OPPONENT_CARD_SCALE,
    OPPONENT_FAN_ANGLE_RAD,
    OPPONENT_FAN_MAX_RAD,
    OPPONENT_HAND_HEIGHT,
    OPPONENT_SEATS,
    PILE_VISIBLE_CARDS,
} from './constants';
import type { SeatPosition, SeatTable } from './constants';
import { DEFAULT_VIEWPORT, handFanShape } from './handFan';
import type { FanShape, LayoutViewport } from './handFan';

export type { LayoutViewport } from './handFan';
export { DEFAULT_VIEWPORT } from './handFan';

export interface CardTarget {
    readonly id: CardId;
    readonly position: THREE.Vector3;
    readonly quaternion: THREE.Quaternion;
    readonly faceUp: boolean;
    /** Hand card owned by the human — receives pointer events. */
    readonly interactive: boolean;
    readonly legal: boolean;
    /** The human's currently selected card: raised, enlarged and rim-lit. */
    readonly selected: boolean;
    readonly scale: number;
    /**
     * Deal stagger: how long after mounting the card waits before it leaves
     * the spawn point. Static data derived from the hand index; CardMesh reads
     * it once on mount.
     */
    readonly spawnDelayMs: number;
}

interface HumanHandContext {
    readonly fan: FanShape;
    readonly angles: readonly number[];
    readonly tilt: THREE.Quaternion;
    readonly selected: CardId | null;
    readonly legal: ReadonlySet<CardId>;
    readonly interactive: boolean;
}

/** How much of the fan radius bends the hand downward at the edges. */
const HAND_DROOP = 0.35;
/** Selected cards also slide back toward the fan plane by this fraction of the raise. */
const HAND_RAISE_BACK = 0.35;
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

/** Offset in front of (+) or behind (-) the tilted fan plane for this card's state. */
function handLift(id: CardId, ctx: HumanHandContext): number {
    if (!ctx.interactive) return 0;
    return ctx.legal.has(id) ? HAND_LEGAL_LIFT : -HAND_LEGAL_LIFT;
}

function humanCardTarget(id: CardId, i: number, ctx: HumanHandContext): CardTarget {
    const a = elementAt(ctx.angles, i, FAN_ANGLE_PER_CARD);
    const selected = id === ctx.selected;
    const raised = selected ? HAND_RAISE_Y : 0;
    const x = HAND_CENTER[0] + Math.sin(a) * ctx.fan.radius;
    const y = ctx.fan.centerY + (Math.cos(a) - 1) * ctx.fan.radius * HAND_DROOP + raised;
    const z = HAND_CENTER[2] + i * CARD_THICKNESS * 0.5 - raised * HAND_RAISE_BACK;
    const lift = new THREE.Vector3(0, 0, handLift(id, ctx)).applyQuaternion(ctx.tilt);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -a)).premultiply(ctx.tilt);
    return {
        id,
        position: new THREE.Vector3(x, y, z).add(lift),
        quaternion: q,
        faceUp: true,
        interactive: ctx.interactive,
        legal: ctx.legal.has(id),
        selected,
        scale: ctx.fan.cardScale * (selected ? HAND_SELECTED_SCALE : 1),
        spawnDelayMs: i * DEAL_STAGGER_MS,
    };
}

function humanHandTargets(
    hand: readonly CardId[],
    selected: CardId | null,
    legal: ReadonlySet<CardId>,
    interactive: boolean,
    fan: FanShape,
): CardTarget[] {
    const ctx: HumanHandContext = {
        fan,
        angles: fanOffsets(hand.length, fan.perCardRad, fan.maxSpreadRad),
        tilt: new THREE.Quaternion().setFromEuler(new THREE.Euler(HAND_TILT_RAD, 0, 0)),
        selected,
        legal,
        interactive,
    };
    return hand.map((id, i) => humanCardTarget(id, i, ctx));
}

interface OpponentFrame {
    /** Rotates seat-local offsets so the hand faces the table centre. */
    readonly facing: THREE.Quaternion;
    /** Card orientation before the per-card fan angle is applied. */
    readonly orient: THREE.Quaternion;
}

function opponentFrame(seat: SeatPosition): OpponentFrame {
    // Face the table centre.
    const yaw = Math.atan2(seat[0], seat[2]) + Math.PI;
    const facing = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
    const lean = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.35, 0, 0));
    // Card front (+z) must point at the opponent, so the back faces the table.
    const backToTable = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI, 0));
    const orient = backToTable.clone().premultiply(lean).premultiply(facing);
    return { facing, orient };
}

function opponentHandTargets(hand: readonly CardId[], seat: SeatPosition): CardTarget[] {
    const angles = fanOffsets(hand.length, OPPONENT_FAN_ANGLE_RAD, OPPONENT_FAN_MAX_RAD);
    const { facing, orient } = opponentFrame(seat);
    return hand.map((id, i) => {
        const a = elementAt(angles, i, FAN_ANGLE_PER_CARD);
        const local = new THREE.Vector3(
            Math.sin(a) * 0.9,
            OPPONENT_HAND_HEIGHT + (Math.cos(a) - 1) * 0.3,
            0.45 + i * CARD_THICKNESS,
        );
        local.applyQuaternion(facing);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a)).premultiply(orient);
        return {
            id,
            position: new THREE.Vector3(seat[0], seat[1], seat[2]).add(local),
            quaternion: q,
            faceUp: false,
            interactive: false,
            legal: false,
            selected: false,
            scale: OPPONENT_CARD_SCALE,
            spawnDelayMs: i * DEAL_STAGGER_MS,
        };
    });
}

interface PileScatter {
    readonly dx: number;
    readonly dz: number;
    readonly rz: number;
}

const NO_SCATTER: PileScatter = { dx: 0, dz: 0, rz: 0 };

/** Deterministic pseudo-scatter keyed on card id so the discard pile looks hand-thrown. */
function pileScatter(id: CardId, scatter: boolean): PileScatter {
    if (!scatter) return NO_SCATTER;
    const h = hash(id);
    return {
        dx: ((h % 100) / 100 - 0.5) * 0.12,
        dz: (((h >> 7) % 100) / 100 - 0.5) * 0.12,
        rz: (((h >> 14) % 100) / 100 - 0.5) * DISCARD_SCATTER_RAD * 2,
    };
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
        const { dx, dz, rz } = pileScatter(id, scatter);
        const y = base[1] + CARD_THICKNESS * (startIndex + i + 1);
        const q = (faceUp ? FLAT_FACE_UP : FLAT_FACE_DOWN)
            .clone()
            .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rz)));
        return {
            id,
            position: new THREE.Vector3(base[0] + dx, y, base[2] + dz),
            quaternion: q,
            faceUp,
            interactive: false,
            legal: false,
            selected: false,
            scale: 1,
            spawnDelayMs: 0,
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
    viewport: LayoutViewport = DEFAULT_VIEWPORT,
): CardTarget[] {
    const out: CardTarget[] = [];
    const opponents = state.players.filter((p) => p.id !== humanId);
    const seats = seatPositions(opponents.length);
    const humanTurn = state.phase === 'playing' && state.currentPlayer === humanId;
    const fan = handFanShape(viewport);

    for (const p of state.players) {
        if (p.id === humanId)
            out.push(...humanHandTargets(p.hand, selected, legal, humanTurn, fan));
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
