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
import { applyCameraPose, cameraPoseFor } from './cameraPose';
import {
    CARD_H,
    CARD_W,
    DEAL_STAGGER_MS,
    DISCARD_PILE_POS,
    DISCARD_PILE_POS_PORTRAIT,
    DRAW_PILE_POS,
    DRAW_PILE_POS_PORTRAIT,
    HAND_CARD_SCALE,
    HAND_SELECTED_SCALE,
    HAND_VIEW_CLEAR_FRACTION,
    OPPONENT_SEATS,
    OPPONENT_SEATS_PORTRAIT,
    PILE_VISIBLE_CARDS,
} from './constants';
import type { SeatPosition } from './constants';
import {
    HEAD_RADIUS,
    HEAD_Y,
    OPPONENT_HEAD_BOTTOM_Y,
    RIM_RADIUS,
    RIM_TUBE_RADIUS,
    TORSO_LENGTH,
    TORSO_RADIUS,
    TORSO_Y,
} from './environment';
import { DEFAULT_VIEWPORT } from './handFan';
import type { LayoutViewport } from './handFan';
import { computeLayout, pilePositionsFor, seatPositions } from './layout';
import type { CardTarget } from './layout';

const NO_SELECTION: CardId | null = null;
const NO_LEGAL: ReadonlySet<CardId> = new Set();

const ONE_OPPONENT = 1;
const TWO_OPPONENTS = 2;
const THREE_OPPONENTS = 3;
const OPPONENT_COUNTS = [ONE_OPPONENT, TWO_OPPONENTS, THREE_OPPONENTS];
/** Above the largest seat table; must fall back rather than crash. */
const UNSUPPORTED_OPPONENT_COUNT = 7;
/** Enough discards to overflow the visible window and prove it is capped. */
const OVERFLOW_DISCARD_COUNT = PILE_VISIBLE_CARDS + 4;
/** The worst hand the design must still fit on a 390 px phone (polish-v0.3 §2.3). */
const BIG_HAND_SIZE = 18;
const PORTRAIT: LayoutViewport = { aspect: 390 / 844 };
const LANDSCAPE: LayoutViewport = { aspect: 844 / 390 };
/** A 1440 × 900 desktop window: landscape camera, but much less wide than a phone. */
const DESKTOP: LayoutViewport = { aspect: 1440 / 900 };
const EVERY_VIEWPORT: readonly (readonly [string, LayoutViewport])[] = [
    ['portrait', PORTRAIT],
    ['landscape', LANDSCAPE],
    ['desktop', DESKTOP],
];
const WIDE_VIEWPORTS: readonly (readonly [string, LayoutViewport])[] = [
    ['landscape', LANDSCAPE],
    ['desktop', DESKTOP],
];
const NEAR = 0.1;
const FAR = 30;
/** A figure (or the far rim) must sit inside the view by at least this NDC margin. */
const FIT_MARGIN_NDC = 0.02;
/** The hand must project at least this far (NDC) below the discard pile's lowest corner. */
const PILE_CLEARANCE_NDC = 0.02;
/** The fan must stay this far (scene units) under the head so the eyes never hide. */
const HEAD_CLEARANCE = 0.02;
/** Lowest point of the torso capsule: centre minus half its length minus the end cap. */
const TORSO_BOTTOM_Y = TORSO_Y - TORSO_LENGTH / 2 - TORSO_RADIUS;
/** Fractions of the side-seat bearing sampled when checking the rim behind the seats. */
const FAR_RIM_SAMPLE_FRACTIONS = [-1, -0.5, 0, 0.5, 1];
/**
 * Portrait: the HUD action column owns the right 22 % of the view (round button
 * plus gutter), so no discard card may project right of NDC x = 1 - 2 * 0.22.
 */
const ACTION_COLUMN_WIDTH_FRACTION = 0.22;
const RIGHTMOST_ALLOWED_NDC_X = 1 - 2 * ACTION_COLUMN_WIDTH_FRACTION;
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

/**
 * A dealt round with more discards than the visible window, so every scatter
 * offset and rotation the window can show is exercised. Layout only reads ids,
 * so the position need not be a legal engine state.
 */
function overflowingDiscardState(): GameState {
    const dealt = dealtState(THREE_OPPONENTS);
    const moved = dealt.drawPile.slice(0, OVERFLOW_DISCARD_COUNT);
    return {
        ...dealt,
        drawPile: dealt.drawPile.slice(OVERFLOW_DISCARD_COUNT),
        discardPile: [...dealt.discardPile, ...moved],
    };
}

/** The scene camera as Scene.tsx sets it up for this viewport. */
function sceneCamera(viewport: LayoutViewport): THREE.PerspectiveCamera {
    const pose = cameraPoseFor(viewport.aspect);
    const camera = new THREE.PerspectiveCamera(pose.fov, viewport.aspect, NEAR, FAR);
    applyCameraPose(camera, pose);
    camera.updateMatrixWorld();
    return camera;
}

/** A world point in normalised device coordinates for this camera. */
function projectPoint(point: readonly [number, number, number], camera: THREE.Camera) {
    return new THREE.Vector3(...point).project(camera);
}

/** The human holds BIG_HAND_SIZE cards and sees the view from `viewport`. */
function bigHandTargets(viewport: LayoutViewport): {
    readonly state: GameState;
    readonly targets: CardTarget[];
} {
    const state = bigHandState();
    return { state, targets: computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, viewport) };
}

/**
 * Extreme points of the opponent figure at `seat` (polish-v0.3 §2.2): the head's
 * crown and both sides, the torso's two sides and its lowest point.
 */
function figureExtremes(seat: SeatPosition): readonly (readonly [number, number, number])[] {
    const [x, , z] = seat;
    return [
        [x, HEAD_Y + HEAD_RADIUS, z],
        [x - HEAD_RADIUS, HEAD_Y, z],
        [x + HEAD_RADIUS, HEAD_Y, z],
        [x - TORSO_RADIUS, TORSO_Y, z],
        [x + TORSO_RADIUS, TORSO_Y, z],
        [x, TORSO_BOTTOM_Y, z],
    ];
}

/**
 * Points on top of the rim arc behind the portrait seats: from the left side seat's
 * bearing round the far end to the right side seat's bearing. The side rim nearer
 * the camera leaves any phone view on both sides, as a round table must.
 */
function farRimPoints(): readonly (readonly [number, number, number])[] {
    const [sideSeat] = seatPositions(THREE_OPPONENTS, PORTRAIT);
    if (!sideSeat) throw new Error('three portrait seats expected');
    const sideBearing = Math.atan2(Math.abs(sideSeat[0]), Math.abs(sideSeat[2]));
    return FAR_RIM_SAMPLE_FRACTIONS.map((fraction) => {
        const a = fraction * sideBearing;
        return [Math.sin(a) * RIM_RADIUS, RIM_TUBE_RADIUS, -Math.cos(a) * RIM_RADIUS];
    });
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

/** Every corner of the card in world space. */
function worldCorners(target: CardTarget): THREE.Vector3[] {
    return CARD_CORNERS.map((corner) =>
        corner
            .clone()
            .multiplyScalar(target.scale)
            .applyQuaternion(target.quaternion)
            .add(target.position),
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
    it.each(OPPONENT_COUNTS)('should return the landscape seat table for %i opponents', (count) => {
        expect(seatPositions(count)).toBe(OPPONENT_SEATS[count]);
        expect(seatPositions(count, LANDSCAPE)).toBe(OPPONENT_SEATS[count]);
        expect(seatPositions(count)).toHaveLength(count);
    });

    it.each(OPPONENT_COUNTS)('should return the portrait seat table for %i opponents', (count) => {
        expect(seatPositions(count, PORTRAIT)).toBe(OPPONENT_SEATS_PORTRAIT[count]);
        expect(seatPositions(count, PORTRAIT)).toHaveLength(count);
    });

    it('should fall back to the three-seat table for an unsupported count', () => {
        expect(seatPositions(UNSUPPORTED_OPPONENT_COUNT)).toBe(OPPONENT_SEATS[THREE_OPPONENTS]);
        expect(seatPositions(UNSUPPORTED_OPPONENT_COUNT, PORTRAIT)).toBe(
            OPPONENT_SEATS_PORTRAIT[THREE_OPPONENTS],
        );
    });

    it('should pull the portrait side seats inward so they fit a phone view', () => {
        const [left, , right] = seatPositions(THREE_OPPONENTS, PORTRAIT);
        const [wideLeft, , wideRight] = seatPositions(THREE_OPPONENTS, LANDSCAPE);
        if (!left || !right || !wideLeft || !wideRight) throw new Error('three seats expected');

        expect(Math.abs(left[0])).toBeLessThan(Math.abs(wideLeft[0]));
        expect(Math.abs(right[0])).toBeLessThan(Math.abs(wideRight[0]));
    });
});

describe('scene fit — opponent fans never cover the faces (polish-v0.3 §2.2)', () => {
    it.each(OPPONENT_COUNTS)(
        'should keep every opponent card below the head with %i opponents (world y)',
        (count) => {
            const state = dealtState(count);
            for (const [, viewport] of EVERY_VIEWPORT) {
                const targets = computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, viewport);
                for (const bot of BOT_IDS.slice(0, count)) {
                    for (const t of targetsFor(targets, handOf(state, bot))) {
                        for (const corner of worldCorners(t))
                            expect(corner.y).toBeLessThan(OPPONENT_HEAD_BOTTOM_Y - HEAD_CLEARANCE);
                    }
                }
            }
        },
    );

    it.each(EVERY_VIEWPORT)(
        'should project every opponent card below its own head in the %s view',
        (_, viewport) => {
            const state = dealtState(THREE_OPPONENTS);
            const camera = sceneCamera(viewport);
            const seats = seatPositions(THREE_OPPONENTS, viewport);
            const targets = computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, viewport);

            BOT_IDS.forEach((bot, i) => {
                const seat = seats[i];
                if (!seat) throw new Error(`no seat ${i}`);
                const headBottom = projectPoint([seat[0], OPPONENT_HEAD_BOTTOM_Y, seat[2]], camera);
                for (const t of targetsFor(targets, handOf(state, bot))) {
                    for (const corner of projectedCorners(t, camera))
                        expect(corner.y).toBeLessThan(headBottom.y);
                }
            });
        },
    );
});

describe('scene fit — portrait shows every seat and the far rim (polish-v0.3 §2.2)', () => {
    it.each(OPPONENT_COUNTS)(
        'should keep all %i opponent figures inside the portrait view',
        (count) => {
            const camera = sceneCamera(PORTRAIT);
            for (const seat of seatPositions(count, PORTRAIT)) {
                for (const point of figureExtremes(seat)) {
                    const ndc = projectPoint(point, camera);
                    expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1 - FIT_MARGIN_NDC);
                    expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1 - FIT_MARGIN_NDC);
                }
            }
        },
    );

    it('should keep the rim arc behind the seats inside the portrait view', () => {
        const camera = sceneCamera(PORTRAIT);
        for (const point of farRimPoints()) {
            const ndc = projectPoint(point, camera);
            expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1 - FIT_MARGIN_NDC);
            expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1 - FIT_MARGIN_NDC);
        }
    });

    it('should leave the landscape camera where v0.2 had it', () => {
        expect(cameraPoseFor(LANDSCAPE.aspect)).toEqual(cameraPoseFor(DEFAULT_VIEWPORT.aspect));
    });
});

describe('pilePositionsFor', () => {
    it.each(WIDE_VIEWPORTS)(
        'should keep the landscape pile constants in the %s view',
        (_, viewport) => {
            const piles = pilePositionsFor(viewport);

            expect(piles.draw).toBe(DRAW_PILE_POS);
            expect(piles.discard).toBe(DISCARD_PILE_POS);
            expect(pilePositionsFor(DEFAULT_VIEWPORT)).toEqual(piles);
        },
    );

    it('should shift both piles left in the portrait view, keeping their depth', () => {
        const piles = pilePositionsFor(PORTRAIT);

        expect(piles.draw).toBe(DRAW_PILE_POS_PORTRAIT);
        expect(piles.discard).toBe(DISCARD_PILE_POS_PORTRAIT);
        expect(piles.draw[0]).toBeLessThan(DRAW_PILE_POS[0]);
        expect(piles.discard[0]).toBeLessThan(DISCARD_PILE_POS[0]);
        expect(piles.draw[2]).toBe(DRAW_PILE_POS[2]);
        expect(piles.discard[2]).toBe(DISCARD_PILE_POS[2]);
    });
});

describe('scene fit — the piles stay clear of the action column (polish-v0.3 §2.4)', () => {
    it('should keep every discard card left of the right action column in the portrait view', () => {
        const state = overflowingDiscardState();
        const camera = sceneCamera(PORTRAIT);
        const targets = computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, PORTRAIT);
        const discard = targetsFor(targets, state.discardPile);

        expect(discard).toHaveLength(PILE_VISIBLE_CARDS);
        for (const t of discard) {
            for (const corner of projectedCorners(t, camera))
                expect(corner.x).toBeLessThan(RIGHTMOST_ALLOWED_NDC_X);
        }
    });

    it('should keep the draw pile inside the portrait view on the left', () => {
        const state = dealtState(THREE_OPPONENTS);
        const camera = sceneCamera(PORTRAIT);
        const targets = computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, PORTRAIT);

        for (const t of targetsFor(targets, state.drawPile)) {
            for (const corner of projectedCorners(t, camera))
                expect(corner.x).toBeGreaterThan(-1 + FIT_MARGIN_NDC);
        }
    });

    it.each(WIDE_VIEWPORTS)(
        'should leave the %s pile targets on the landscape constants',
        (_, viewport) => {
            const state = dealtState(THREE_OPPONENTS);
            const targets = computeLayout(state, HUMAN_ID, NO_SELECTION, NO_LEGAL, viewport);
            const drawTop = targetOf(targets, topOf(state.drawPile));

            expect(drawTop.position.x).toBe(DRAW_PILE_POS[0]);
            expect(drawTop.position.z).toBe(DRAW_PILE_POS[2]);
            for (const t of targetsFor(targets, state.discardPile)) {
                expect(Math.abs(t.position.x - DISCARD_PILE_POS[0])).toBeLessThan(CARD_W / 2);
                expect(Math.abs(t.position.z - DISCARD_PILE_POS[2])).toBeLessThan(CARD_H / 2);
            }
        },
    );
});

describe('scene fit — the hand never overlaps the piles (polish-v0.3 §2.3)', () => {
    it.each(WIDE_VIEWPORTS)(
        'should keep an 18-card hand below the discard pile in the %s view',
        (_, viewport) => {
            const { state, targets } = bigHandTargets(viewport);
            const camera = sceneCamera(viewport);
            const discardTop = targetOf(targets, topOf(state.discardPile));
            const pileBottom = Math.min(
                ...projectedCorners(discardTop, camera).map((corner) => corner.y),
            );

            for (const t of targetsFor(targets, handOf(state, HUMAN_ID))) {
                for (const corner of projectedCorners(t, camera))
                    expect(corner.y).toBeLessThan(pileBottom - PILE_CLEARANCE_NDC);
            }
        },
    );

    it.each(EVERY_VIEWPORT)(
        'should keep an 18-card hand clear of both piles in the %s view',
        (_, viewport) => {
            const { state, targets } = bigHandTargets(viewport);
            const camera = sceneCamera(viewport);
            const pileIds = [...state.drawPile, ...state.discardPile];
            const pileBottom = Math.min(
                ...targetsFor(targets, pileIds).flatMap((t) =>
                    projectedCorners(t, camera).map((corner) => corner.y),
                ),
            );

            for (const t of targetsFor(targets, handOf(state, HUMAN_ID))) {
                for (const corner of projectedCorners(t, camera))
                    expect(corner.y).toBeLessThan(pileBottom - PILE_CLEARANCE_NDC);
            }
        },
    );
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
        const state = overflowingDiscardState();

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

    it.each(EVERY_VIEWPORT)(
        'should keep an 18-card hand inside the %s view above the action strip',
        (_, viewport) => {
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
        },
    );

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
