import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CardId, GameState } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import {
    BOT_IDS,
    dealtState as dealtWith,
    firstCardOf,
    handOf,
    playersFor,
    topOf,
} from '../test/fixtures';
import {
    CAMERA_POS,
    CAMERA_TARGET,
    CARD_H,
    CARD_W,
    DEAL_STAGGER_MS,
    FOV_LANDSCAPE,
    FOV_PORTRAIT,
    HAND_CARD_SCALE,
    HAND_SELECTED_SCALE,
    HAND_VIEW_CLEAR_FRACTION,
    OPPONENT_SEATS,
    PILE_VISIBLE_CARDS,
} from './constants';
import { DEFAULT_VIEWPORT } from './handFan';
import type { LayoutViewport } from './handFan';
import { computeLayout, seatPositions } from './layout';
import type { CardTarget } from './layout';

const NO_SELECTION: CardId | null = null;
const NO_LEGAL: ReadonlySet<CardId> = new Set();

const ONE_OPPONENT = 1;
const TWO_OPPONENTS = 2;
const THREE_OPPONENTS = 3;
/** Above the largest seat table; must fall back rather than crash. */
const UNSUPPORTED_OPPONENT_COUNT = 7;
/** Enough discards to overflow the visible window and prove it is capped. */
const OVERFLOW_DISCARD_COUNT = PILE_VISIBLE_CARDS + 4;
/** The worst hand the design must still fit on a 390 px phone (polish-v0.3 §2.3). */
const BIG_HAND_SIZE = 18;
const PORTRAIT: LayoutViewport = { aspect: 390 / 844 };
const LANDSCAPE: LayoutViewport = { aspect: 844 / 390 };
const NEAR = 0.1;
const FAR = 30;
/** NDC y of the top of the bottom strip reserved for the HUD action column. */
const LOWEST_ALLOWED_NDC_Y = -1 + 2 * HAND_VIEW_CLEAR_FRACTION;
const CARD_CORNERS: readonly THREE.Vector3[] = [
    new THREE.Vector3(-CARD_W / 2, -CARD_H / 2, 0),
    new THREE.Vector3(CARD_W / 2, -CARD_H / 2, 0),
    new THREE.Vector3(-CARD_W / 2, CARD_H / 2, 0),
    new THREE.Vector3(CARD_W / 2, CARD_H / 2, 0),
];
const LOCAL_NORMAL = new THREE.Vector3(0, 0, 1);

/** A dealt round 1 with the shared fixed seed, so every spec sees the same real hands. */
function dealtState(opponentCount: number): GameState {
    return dealtWith({ players: playersFor(opponentCount) });
}

function layoutOf(state: GameState, selected = NO_SELECTION, legal = NO_LEGAL): CardTarget[] {
    return computeLayout(state, HUMAN_ID, selected, legal);
}

/** The human holds BIG_HAND_SIZE cards, topped up from the draw pile; it is the human's turn. */
function bigHandState(): GameState {
    const dealt = dealtState(THREE_OPPONENTS);
    const hand = handOf(dealt, HUMAN_ID);
    const extra = dealt.drawPile.slice(0, BIG_HAND_SIZE - hand.length);
    return {
        ...dealt,
        phase: 'playing',
        currentPlayer: HUMAN_ID,
        drawPile: dealt.drawPile.slice(extra.length),
        players: dealt.players.map((p) =>
            p.id === HUMAN_ID ? { ...p, hand: [...hand, ...extra] } : p,
        ),
    };
}

/** The scene camera as Scene.tsx sets it up for this viewport. */
function sceneCamera(viewport: LayoutViewport): THREE.PerspectiveCamera {
    const fov = viewport.aspect < 1 ? FOV_PORTRAIT : FOV_LANDSCAPE;
    const camera = new THREE.PerspectiveCamera(fov, viewport.aspect, NEAR, FAR);
    camera.position.set(...CAMERA_POS);
    camera.lookAt(new THREE.Vector3(...CAMERA_TARGET));
    camera.updateMatrixWorld();
    return camera;
}

/** Every corner of the card, projected to normalised device coordinates. */
function projectedCorners(target: CardTarget, camera: THREE.Camera): THREE.Vector3[] {
    return CARD_CORNERS.map((corner) =>
        corner
            .clone()
            .multiplyScalar(target.scale)
            .applyQuaternion(target.quaternion)
            .add(target.position)
            .project(camera),
    );
}

/** Signed distance of `target` in front of `reference` along the reference card's normal. */
function liftAbove(target: CardTarget, reference: CardTarget): number {
    const normal = LOCAL_NORMAL.clone().applyQuaternion(reference.quaternion);
    return target.position.clone().sub(reference.position).dot(normal);
}

function targetsFor(targets: readonly CardTarget[], ids: readonly CardId[]): CardTarget[] {
    const wanted = new Set(ids);
    return targets.filter((t) => wanted.has(t.id));
}

function targetOf(targets: readonly CardTarget[], id: CardId): CardTarget {
    const target = targets.find((t) => t.id === id);
    if (!target) throw new Error(`no target for card ${id}`);
    return target;
}

/** Number of targets computeLayout is expected to emit for this state. */
function expectedTargetCount(state: GameState): number {
    const handCards = state.players.reduce((sum, p) => sum + p.hand.length, 0);
    const drawVisible = Math.min(state.drawPile.length, PILE_VISIBLE_CARDS);
    const discardVisible = Math.min(state.discardPile.length, PILE_VISIBLE_CARDS);
    return handCards + drawVisible + discardVisible;
}

describe('seatPositions', () => {
    it.each([ONE_OPPONENT, TWO_OPPONENTS, THREE_OPPONENTS])(
        'should return the seat table for %i opponents',
        (count) => {
            expect(seatPositions(count)).toBe(OPPONENT_SEATS[count]);
            expect(seatPositions(count)).toHaveLength(count);
        },
    );

    it('should fall back to the three-seat table for an unsupported count', () => {
        expect(seatPositions(UNSUPPORTED_OPPONENT_COUNT)).toBe(OPPONENT_SEATS[THREE_OPPONENTS]);
    });
});

describe('computeLayout', () => {
    it('should emit exactly one target per visible card with no duplicate ids', () => {
        const state = dealtState(THREE_OPPONENTS);

        const targets = layoutOf(state);

        expect(targets).toHaveLength(expectedTargetCount(state));
        expect(new Set(targets.map((t) => t.id)).size).toBe(targets.length);
    });

    it('should cover every card in every hand', () => {
        const state = dealtState(THREE_OPPONENTS);
        const targetIds = new Set(layoutOf(state).map((t) => t.id));

        for (const player of state.players) {
            for (const id of player.hand) expect(targetIds.has(id)).toBe(true);
        }
    });

    it('should include the discard top and the top of the draw pile', () => {
        const state = dealtState(THREE_OPPONENTS);
        const targetIds = new Set(layoutOf(state).map((t) => t.id));

        expect(targetIds.has(topOf(state.discardPile))).toBe(true);
        expect(targetIds.has(topOf(state.drawPile))).toBe(true);
    });

    it('should show only the last PILE_VISIBLE_CARDS of an overflowing discard pile', () => {
        const dealt = dealtState(THREE_OPPONENTS);
        // Move draw-pile cards onto the discard pile: layout only reads ids, so
        // the resulting state need not be a legal engine position.
        const moved = dealt.drawPile.slice(0, OVERFLOW_DISCARD_COUNT);
        const state: GameState = {
            ...dealt,
            drawPile: dealt.drawPile.slice(OVERFLOW_DISCARD_COUNT),
            discardPile: [...dealt.discardPile, ...moved],
        };

        const discardTargets = targetsFor(layoutOf(state), state.discardPile);

        expect(discardTargets).toHaveLength(PILE_VISIBLE_CARDS);
        expect(discardTargets.map((t) => t.id)).toEqual(
            state.discardPile.slice(-PILE_VISIBLE_CARDS),
        );
    });

    it('should stack pile cards upward so the top card is highest', () => {
        const state = dealtState(THREE_OPPONENTS);
        const drawTargets = targetsFor(layoutOf(state), state.drawPile);

        const heights = drawTargets.map((t) => t.position.y);
        const sorted = [...heights].sort((a, b) => a - b);

        expect(heights).toEqual(sorted);
        expect(new Set(heights).size).toBe(heights.length);
    });

    it('should mark human hand and discard face-up, opponents and draw pile face-down', () => {
        const state = dealtState(THREE_OPPONENTS);
        const targets = layoutOf(state);

        for (const t of targetsFor(targets, handOf(state, HUMAN_ID))) expect(t.faceUp).toBe(true);
        for (const t of targetsFor(targets, state.discardPile)) expect(t.faceUp).toBe(true);
        for (const bot of BOT_IDS)
            for (const t of targetsFor(targets, handOf(state, bot))) expect(t.faceUp).toBe(false);
        for (const t of targetsFor(targets, state.drawPile)) expect(t.faceUp).toBe(false);
    });

    it('should make the human hand interactive only on the human turn in the playing phase', () => {
        const dealt = dealtState(THREE_OPPONENTS);
        const humanTurn: GameState = { ...dealt, phase: 'playing', currentPlayer: HUMAN_ID };
        const botTurn: GameState = { ...dealt, phase: 'playing', currentPlayer: BOT_IDS[0] };
        const humanChoosing: GameState = {
            ...dealt,
            phase: 'choosing_color',
            currentPlayer: HUMAN_ID,
        };
        const hand = handOf(dealt, HUMAN_ID);

        for (const t of targetsFor(layoutOf(humanTurn), hand)) expect(t.interactive).toBe(true);
        for (const t of targetsFor(layoutOf(botTurn), hand)) expect(t.interactive).toBe(false);
        for (const t of targetsFor(layoutOf(humanChoosing), hand))
            expect(t.interactive).toBe(false);
    });

    it('should never make opponent or pile cards interactive or legal', () => {
        const dealt = dealtState(THREE_OPPONENTS);
        const state: GameState = { ...dealt, phase: 'playing', currentPlayer: HUMAN_ID };
        const everyCard = new Set<CardId>(Object.keys(state.cards) as CardId[]);
        const humanHand = new Set(handOf(state, HUMAN_ID));

        const others = layoutOf(state, NO_SELECTION, everyCard).filter((t) => !humanHand.has(t.id));

        expect(others.length).toBeGreaterThan(0);
        for (const t of others) {
            expect(t.interactive).toBe(false);
            expect(t.legal).toBe(false);
        }
    });

    it('should flag exactly the legal human cards', () => {
        const state = dealtState(THREE_OPPONENTS);
        const hand = handOf(state, HUMAN_ID);
        const [legalA, legalB, ...rest] = hand;
        if (!legalA || !legalB) throw new Error('hand needs at least two cards');
        const legal = new Set<CardId>([legalA, legalB]);

        const targets = layoutOf(state, NO_SELECTION, legal);

        expect(targetOf(targets, legalA).legal).toBe(true);
        expect(targetOf(targets, legalB).legal).toBe(true);
        for (const id of rest) expect(targetOf(targets, id).legal).toBe(false);
    });

    it('should raise the selected human card above its unselected position', () => {
        const state = dealtState(THREE_OPPONENTS);
        const picked = firstCardOf(state, HUMAN_ID);

        const idle = targetOf(layoutOf(state), picked);
        const raised = targetOf(layoutOf(state, picked), picked);

        expect(raised.position.y).toBeGreaterThan(idle.position.y);
        expect(raised.position.x).toBeCloseTo(idle.position.x);
    });

    it('should fan the human hand left-to-right in hand order', () => {
        const state = dealtState(THREE_OPPONENTS);
        const hand = handOf(state, HUMAN_ID);
        const targets = layoutOf(state);

        const xs = hand.map((id) => targetOf(targets, id).position.x);
        const sorted = [...xs].sort((a, b) => a - b);

        expect(xs).toEqual(sorted);
        expect(new Set(xs).size).toBe(xs.length);
    });

    it('should place the three opponents at distinct seats with distinct facing', () => {
        const state = dealtState(THREE_OPPONENTS);
        const targets = layoutOf(state);
        const firstCards = BOT_IDS.map((bot) => targetOf(targets, firstCardOf(state, bot)));

        for (const [a, cardA] of firstCards.entries()) {
            for (const cardB of firstCards.slice(a + 1)) {
                expect(cardA.position.equals(cardB.position)).toBe(false);
                expect(cardA.quaternion.equals(cardB.quaternion)).toBe(false);
            }
        }
    });

    it('should keep opponent cards away from the human side of the table', () => {
        const state = dealtState(THREE_OPPONENTS);
        const targets = layoutOf(state);
        const humanZ = targetOf(targets, firstCardOf(state, HUMAN_ID)).position.z;

        for (const bot of BOT_IDS) {
            for (const t of targetsFor(targets, handOf(state, bot)))
                expect(t.position.z).toBeLessThan(humanZ);
        }
    });

    it('should be deterministic for the same state', () => {
        const state = dealtState(THREE_OPPONENTS);

        expect(layoutOf(state)).toEqual(layoutOf({ ...state }));
    });

    it.each([ONE_OPPONENT, TWO_OPPONENTS, THREE_OPPONENTS])(
        'should emit the right number of targets for a game with %i opponents',
        (opponentCount) => {
            const state = dealtState(opponentCount);

            expect(layoutOf(state)).toHaveLength(expectedTargetCount(state));
        },
    );

    it('should use the landscape fan when no viewport is given', () => {
        const state = bigHandState();

        expect(layoutOf(state)).toEqual(
            computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, DEFAULT_VIEWPORT),
        );
        expect(layoutOf(state)).toEqual(
            computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, LANDSCAPE),
        );
    });

    it.each([
        ['portrait', PORTRAIT],
        ['landscape', LANDSCAPE],
    ])('should keep an 18-card hand inside the %s view above the action strip', (_, viewport) => {
        const state = bigHandState();
        const camera = sceneCamera(viewport);
        const hand = handOf(state, HUMAN_ID);
        const targets = computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, viewport);

        expect(hand).toHaveLength(BIG_HAND_SIZE);
        for (const t of targetsFor(targets, hand)) {
            for (const corner of projectedCorners(t, camera)) {
                expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
                expect(corner.y).toBeGreaterThanOrEqual(LOWEST_ALLOWED_NDC_Y);
            }
        }
    });

    it('should spread the hand wider in landscape than in portrait', () => {
        const state = bigHandState();
        const hand = handOf(state, HUMAN_ID);
        const widthOf = (viewport: LayoutViewport) => {
            const xs = targetsFor(
                computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, viewport),
                hand,
            ).map((t) => t.position.x);
            return Math.max(...xs) - Math.min(...xs);
        };

        expect(widthOf(LANDSCAPE)).toBeGreaterThan(widthOf(PORTRAIT));
    });

    it('should stagger the deal by DEAL_STAGGER_MS per hand index and not for piles', () => {
        const state = dealtState(THREE_OPPONENTS);
        const targets = layoutOf(state);

        for (const player of state.players) {
            player.hand.forEach((id, i) =>
                expect(targetOf(targets, id).spawnDelayMs).toBe(i * DEAL_STAGGER_MS),
            );
        }
        for (const t of targetsFor(targets, [...state.drawPile, ...state.discardPile]))
            expect(t.spawnDelayMs).toBe(0);
    });

    it('should scale up and flag only the selected human card', () => {
        const state = dealtState(THREE_OPPONENTS);
        const [picked, ...rest] = handOf(state, HUMAN_ID);
        if (!picked) throw new Error('human hand empty');

        const targets = layoutOf(state, picked);

        expect(targetOf(targets, picked).selected).toBe(true);
        expect(targetOf(targets, picked).scale).toBeCloseTo(HAND_CARD_SCALE * HAND_SELECTED_SCALE);
        for (const id of rest) {
            expect(targetOf(targets, id).selected).toBe(false);
            expect(targetOf(targets, id).scale).toBeCloseTo(HAND_CARD_SCALE);
        }
    });

    it('should lift legal cards in front of the fan plane and sink illegal ones on the human turn', () => {
        const dealt = dealtState(THREE_OPPONENTS);
        const state: GameState = { ...dealt, phase: 'playing', currentPlayer: HUMAN_ID };
        const [legalId, illegalId] = handOf(state, HUMAN_ID);
        if (!legalId || !illegalId) throw new Error('hand needs at least two cards');
        const resting = layoutOf({ ...state, currentPlayer: BOT_IDS[0] });

        const targets = layoutOf(state, NO_SELECTION, new Set([legalId]));

        expect(liftAbove(targetOf(targets, legalId), targetOf(resting, legalId))).toBeGreaterThan(
            0,
        );
        expect(liftAbove(targetOf(targets, illegalId), targetOf(resting, illegalId))).toBeLessThan(
            0,
        );
    });

    it('should lay out a lone hand card without producing NaN transforms', () => {
        const dealt = dealtState(ONE_OPPONENT);
        const [kept, ...rest] = handOf(dealt, HUMAN_ID);
        if (!kept) throw new Error('human hand empty');
        const state: GameState = {
            ...dealt,
            players: dealt.players.map((p) => (p.id === HUMAN_ID ? { ...p, hand: [kept] } : p)),
            drawPile: [...rest, ...dealt.drawPile],
        };

        const target = targetOf(layoutOf(state), kept);

        expect(Number.isFinite(target.position.x)).toBe(true);
        expect(Number.isFinite(target.position.y)).toBe(true);
        expect(Number.isFinite(target.position.z)).toBe(true);
        expect(Number.isFinite(target.quaternion.w)).toBe(true);
    });
});
