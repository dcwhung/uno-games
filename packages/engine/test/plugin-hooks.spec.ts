/**
 * Reducer ↔ RulePlugin contract specs. Each describe wraps `classicRules`
 * in a test plugin that overrides one optional hook and proves the reducer
 * honours it — and that Classic (no hook) behaves exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { classicRules, core, createEngine, engine } from '../src';
import type { ApplyResult, GameState, PendingDraw, PlayerId, RulePlugin } from '../src';
import {
    CONFIG,
    faceOf,
    firstCard,
    hand,
    newGame,
    openingCard,
    P,
    players,
    rig,
    types,
} from './helpers';

const STACKED_DRAW_AMOUNT = 2;
const EXTRA_DRAW_AMOUNT = 1;
const TURN_START_EVENT = 'turn_start';
const SEED_SEARCH_LIMIT = 2000;
const THREE_PLAYERS = 3;

type RigOptions = Parameters<typeof rig>[1];

const TWO_CARD_HANDS: RigOptions = {
    top: { color: 'red', kind: 'number', value: 1 },
    hands: {
        [P(0)]: [
            { color: 'red', kind: 'number', value: 2 },
            { color: 'blue', kind: 'number', value: 3 },
        ],
        [P(1)]: [
            { color: 'red', kind: 'number', value: 4 },
            { color: 'green', kind: 'number', value: 4 },
        ],
        [P(2)]: [
            { color: 'red', kind: 'number', value: 5 },
            { color: 'green', kind: 'number', value: 6 },
        ],
    },
};

function engineWith(overrides: Partial<RulePlugin>) {
    return createEngine({ classic: { ...classicRules, ...overrides } });
}

function playFirst(
    eng: ReturnType<typeof createEngine>,
    s: GameState,
    player: PlayerId,
): ApplyResult {
    return eng.apply(s, { type: 'PLAY_CARD', player, card: firstCard(s, player) });
}

describe('RulePlugin.isRoundOver', () => {
    const base = newGame(3).state;

    it('ends the round with the winner the hook returns, even though nobody is out of cards', () => {
        // Teams-like rule: the round is over as soon as P0 is down to one card, and P1 is the winner.
        const eng = engineWith({
            isRoundOver: (state) => (hand(state, P(0)).length <= 1 ? P(1) : undefined),
        });
        const s = rig(base, TWO_CARD_HANDS);
        const r = playFirst(eng, s, P(0));
        expect(types(r)).toEqual(['CardPlayed', 'RoundEnded']);
        expect(r.state.phase).toBe('round_over');
        expect(r.state.roundWinner).toBe(P(1));
    });

    it('falls back to the empty-hand rule when the hook returns undefined', () => {
        const eng = engineWith({ isRoundOver: () => undefined });
        const s = rig(base, {
            ...TWO_CARD_HANDS,
            hands: { [P(0)]: [{ color: 'red', kind: 'number', value: 2 }] },
        });
        const r = playFirst(eng, s, P(0));
        expect(types(r)).toEqual(['CardPlayed', 'RoundEnded']);
        expect(r.state.roundWinner).toBe(P(0));
    });

    it('without the hook, Classic still ends the round only on an empty hand', () => {
        const s = rig(base, TWO_CARD_HANDS);
        const r = engine.apply(s, { type: 'PLAY_CARD', player: P(0), card: firstCard(s, P(0)) });
        expect(types(r)).toEqual(['CardPlayed', 'TurnChanged']);
        expect(r.state.phase).toBe('playing');
    });
});

describe('pendingDraw is owned by the plugin', () => {
    const base = newGame(3).state;

    it('is still visible inside onCardPlayed (stacking needs the amount in force)', () => {
        let seen: PendingDraw | undefined;
        const eng = engineWith({
            onCardPlayed: (state, player, card, color) => {
                seen = state.pendingDraw;
                return classicRules.onCardPlayed(state, player, card, color);
            },
        });
        const s = rig(base, TWO_CARD_HANDS);
        const pending: PendingDraw = { amount: STACKED_DRAW_AMOUNT, source: openingCard(s) };
        playFirst(eng, { ...s, pendingDraw: pending }, P(0));
        expect(seen).toEqual(pending);
    });

    it('Classic: accepting a Wild Draw Four still clears the pending draw', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [
                    { color: 'wild', kind: 'wild_draw4' },
                    { color: 'blue', kind: 'number', value: 2 },
                ],
                [P(1)]: [{ color: 'red', kind: 'number', value: 4 }],
            },
        });
        const played = engine.apply(s, {
            type: 'PLAY_CARD',
            player: P(0),
            card: firstCard(s, P(0)),
            chosenColor: 'green',
        });
        expect(played.state.pendingDraw).toBeDefined();
        const accepted = engine.apply(played.state, { type: 'ACCEPT_DRAW4', player: P(1) });
        expect(accepted.state.pendingDraw).toBeUndefined();
    });
});

describe('RulePlugin.onTurnStart', () => {
    const base = newGame(3).state;

    function recordingEngine() {
        const calls: PlayerId[] = [];
        const eng = engineWith({
            onTurnStart: (state, player) => {
                calls.push(player);
                return {
                    state,
                    events: [{ type: 'Variant', name: TURN_START_EVENT, payload: player }],
                };
            },
        });
        return { eng, calls };
    }

    it('is called for the incoming player after TurnChanged, and its events follow it', () => {
        const { eng, calls } = recordingEngine();
        const s = rig(base, TWO_CARD_HANDS);
        const r = playFirst(eng, s, P(0));
        expect(calls).toEqual([P(1)]);
        expect(types(r)).toEqual(['CardPlayed', 'TurnChanged', 'Variant']);
        expect(r.state.currentPlayer).toBe(P(1));
    });

    it('is called for the player who actually gets the turn after a Skip', () => {
        const { eng, calls } = recordingEngine();
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [
                    { color: 'red', kind: 'skip' },
                    { color: 'red', kind: 'number', value: 2 },
                ],
            },
        });
        playFirst(eng, s, P(0));
        expect(calls).toEqual([P(2)]);
    });

    it('is called when a draw or a pass ends the turn', () => {
        const { eng, calls } = recordingEngine();
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'blue', kind: 'number', value: 3 }] },
        });
        let r = eng.apply(s, { type: 'DRAW_CARD', player: P(0) });
        if (r.state.drawnCard !== undefined && r.state.currentPlayer === P(0)) {
            r = eng.apply(r.state, { type: 'PASS', player: P(0) });
        }
        expect(calls).toEqual([P(1)]);
        expect(r.state.currentPlayer).toBe(P(1));
    });

    /** The deck depends only on the seed, so the stock engine can find an opening for the hooked one. */
    function seedOpeningOn(kind: string): number {
        for (let seed = 0; seed < SEED_SEARCH_LIMIT; seed++) {
            const { state } = newGame(THREE_PLAYERS, seed);
            if (faceOf(state, openingCard(state)).kind === kind) return seed;
        }
        throw new Error(`no seed opens on ${kind}`);
    }

    function openRound(eng: ReturnType<typeof createEngine>, seed: number): ApplyResult {
        let s = eng.createInitialState(CONFIG, seed);
        s = eng.apply(s, { type: 'START_GAME', players: players(THREE_PLAYERS) }).state;
        return eng.apply(s, { type: 'START_ROUND' });
    }

    it('fires for the dealer when the opening card is a Reverse', () => {
        const { eng, calls } = recordingEngine();
        const r = openRound(eng, seedOpeningOn('reverse'));
        expect(calls).toEqual([P(0)]);
        expect(types(r).slice(-2)).toEqual(['TurnChanged', 'Variant']);
    });

    it('fires for the first player only once the opening-Wild colour is chosen', () => {
        const { eng, calls } = recordingEngine();
        const opened = openRound(eng, seedOpeningOn('wild'));
        expect(calls).toEqual([]);
        const r = eng.apply(opened.state, { type: 'CHOOSE_COLOR', player: P(1), color: 'green' });
        expect(calls).toEqual([P(1)]);
        expect(types(r)).toEqual(['ColorChosen', 'Variant']);
        expect(r.state.currentPlayer).toBe(P(1));
    });

    it('without the hook, Classic emits no extra events', () => {
        const s = rig(base, TWO_CARD_HANDS);
        const r = engine.apply(s, { type: 'PLAY_CARD', player: P(0), card: firstCard(s, P(0)) });
        expect(types(r)).toEqual(['CardPlayed', 'TurnChanged']);
    });
});

describe('UNO vulnerability is judged after card effects', () => {
    const base = newGame(3).state;
    const THREE_CARDS: RigOptions = {
        top: { color: 'red', kind: 'number', value: 1 },
        hands: {
            [P(0)]: [
                { color: 'red', kind: 'number', value: 2 },
                { color: 'blue', kind: 'number', value: 3 },
                { color: 'blue', kind: 'number', value: 5 },
            ],
        },
    };

    it('a plugin that discards an extra card (Discard All) leaves the player catchable at one card', () => {
        const eng = engineWith({
            onCardPlayed: (state, player, card, color) => {
                const extra = firstCard(state, player);
                const s = core.updatePlayer(state, player, { hand: hand(state, player).slice(1) });
                return classicRules.onCardPlayed(
                    { ...s, discardPile: [...s.discardPile, extra] },
                    player,
                    card,
                    color,
                );
            },
        });
        const s = rig(base, THREE_CARDS);
        const r = playFirst(eng, s, P(0));
        expect(hand(r.state, P(0))).toHaveLength(1);
        expect(r.state.unoVulnerable).toBe(P(0));
    });

    it('a plugin that hands the player a card back leaves them safe at two cards', () => {
        const eng = engineWith({
            onCardPlayed: (state, player, card, color) => {
                const drawn = core.drawCards(state, player, EXTRA_DRAW_AMOUNT, 'penalty');
                return core.merge(
                    drawn,
                    classicRules.onCardPlayed(drawn.state, player, card, color),
                );
            },
        });
        const s = rig(base, TWO_CARD_HANDS);
        const r = playFirst(eng, s, P(0));
        expect(hand(r.state, P(0))).toHaveLength(2);
        expect(r.state.unoVulnerable).toBeUndefined();
    });
});
