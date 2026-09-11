import { describe, expect, it } from 'vitest';
import { engine, OFFICIAL_HOUSE_RULES, TARGET_SCORE } from '@uno/engine';
import type { CardId, GameState, PlayerConfig, PlayerId, RuleConfig } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import { OPPONENT_SEATS, PILE_VISIBLE_CARDS } from './constants';
import { computeLayout, seatPositions } from './layout';
import type { CardTarget } from './layout';

const SEED = 42;
const UNO_WINDOW_MS = 2000;
const NO_SELECTION: CardId | null = null;
const NO_LEGAL: ReadonlySet<CardId> = new Set();

const ONE_OPPONENT = 1;
const TWO_OPPONENTS = 2;
const THREE_OPPONENTS = 3;
/** Above the largest seat table; must fall back rather than crash. */
const UNSUPPORTED_OPPONENT_COUNT = 7;
/** Enough discards to overflow the visible window and prove it is capped. */
const OVERFLOW_DISCARD_COUNT = PILE_VISIBLE_CARDS + 4;

const BOT_IDS: readonly PlayerId[] = ['bot0' as PlayerId, 'bot1' as PlayerId, 'bot2' as PlayerId];

const CONFIG: RuleConfig = {
    variant: 'classic',
    houseRules: OFFICIAL_HOUSE_RULES,
    targetScore: TARGET_SCORE,
    unoCallWindowMs: UNO_WINDOW_MS,
};

function players(opponentCount: number): PlayerConfig[] {
    const bots = BOT_IDS.slice(0, opponentCount).map(
        (id, i): PlayerConfig => ({ id, name: `Bot ${i}`, kind: 'bot', difficulty: 'medium' }),
    );
    return [{ id: HUMAN_ID, name: 'You', kind: 'human' }, ...bots];
}

/** A dealt round 1 with a fixed seed, so every spec sees the same real hands. */
function dealtState(opponentCount: number, seed = SEED): GameState {
    let s = engine.createInitialState(CONFIG, seed);
    s = engine.apply(s, { type: 'START_GAME', players: players(opponentCount) }).state;
    return engine.apply(s, { type: 'START_ROUND' }).state;
}

function layoutOf(state: GameState, selected = NO_SELECTION, legal = NO_LEGAL): CardTarget[] {
    return computeLayout(state, HUMAN_ID, selected, legal);
}

function handOf(state: GameState, id: PlayerId): readonly CardId[] {
    const player = state.players.find((p) => p.id === id);
    if (!player) throw new Error(`player ${id} not in state`);
    return player.hand;
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
    it.each([ONE_OPPONENT, TWO_OPPONENTS, THREE_OPPONENTS])('should return the seat table for %i opponents', (count) => {
        expect(seatPositions(count)).toBe(OPPONENT_SEATS[count]);
        expect(seatPositions(count)).toHaveLength(count);
    });

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

        expect(targetIds.has(state.discardPile.at(-1)!)).toBe(true);
        expect(targetIds.has(state.drawPile.at(-1)!)).toBe(true);
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
        expect(discardTargets.map((t) => t.id)).toEqual(state.discardPile.slice(-PILE_VISIBLE_CARDS));
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
        for (const bot of BOT_IDS) for (const t of targetsFor(targets, handOf(state, bot))) expect(t.faceUp).toBe(false);
        for (const t of targetsFor(targets, state.drawPile)) expect(t.faceUp).toBe(false);
    });

    it('should make the human hand interactive only on the human turn in the playing phase', () => {
        const dealt = dealtState(THREE_OPPONENTS);
        const humanTurn: GameState = { ...dealt, phase: 'playing', currentPlayer: HUMAN_ID };
        const botTurn: GameState = { ...dealt, phase: 'playing', currentPlayer: BOT_IDS[0]! };
        const humanChoosing: GameState = { ...dealt, phase: 'choosing_color', currentPlayer: HUMAN_ID };
        const hand = handOf(dealt, HUMAN_ID);

        for (const t of targetsFor(layoutOf(humanTurn), hand)) expect(t.interactive).toBe(true);
        for (const t of targetsFor(layoutOf(botTurn), hand)) expect(t.interactive).toBe(false);
        for (const t of targetsFor(layoutOf(humanChoosing), hand)) expect(t.interactive).toBe(false);
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
        const legal = new Set<CardId>([legalA!, legalB!]);

        const targets = layoutOf(state, NO_SELECTION, legal);

        expect(targetOf(targets, legalA!).legal).toBe(true);
        expect(targetOf(targets, legalB!).legal).toBe(true);
        for (const id of rest) expect(targetOf(targets, id).legal).toBe(false);
    });

    it('should raise the selected human card above its unselected position', () => {
        const state = dealtState(THREE_OPPONENTS);
        const picked = handOf(state, HUMAN_ID)[0]!;

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
        const firstCards = BOT_IDS.map((bot) => targetOf(targets, handOf(state, bot)[0]!));

        for (let a = 0; a < firstCards.length; a++) {
            for (let b = a + 1; b < firstCards.length; b++) {
                expect(firstCards[a]!.position.equals(firstCards[b]!.position)).toBe(false);
                expect(firstCards[a]!.quaternion.equals(firstCards[b]!.quaternion)).toBe(false);
            }
        }
    });

    it('should keep opponent cards away from the human side of the table', () => {
        const state = dealtState(THREE_OPPONENTS);
        const targets = layoutOf(state);
        const humanZ = targetOf(targets, handOf(state, HUMAN_ID)[0]!).position.z;

        for (const bot of BOT_IDS) {
            for (const t of targetsFor(targets, handOf(state, bot))) expect(t.position.z).toBeLessThan(humanZ);
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

    it('should lay out a lone hand card without producing NaN transforms', () => {
        const dealt = dealtState(ONE_OPPONENT);
        const [kept, ...rest] = handOf(dealt, HUMAN_ID);
        const state: GameState = {
            ...dealt,
            players: dealt.players.map((p) => (p.id === HUMAN_ID ? { ...p, hand: [kept!] } : p)),
            drawPile: [...rest, ...dealt.drawPile],
        };

        const target = targetOf(layoutOf(state), kept!);

        expect(Number.isFinite(target.position.x)).toBe(true);
        expect(Number.isFinite(target.position.y)).toBe(true);
        expect(Number.isFinite(target.position.z)).toBe(true);
        expect(Number.isFinite(target.quaternion.w)).toBe(true);
    });
});
