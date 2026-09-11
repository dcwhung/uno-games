import { describe, expect, it } from 'vitest';
import { buildClassicDeck, CLASSIC_DECK_SIZE, engine, INITIAL_HAND_SIZE, PENALTY } from '../src';
import type { Action, CardId, GameState } from '../src';
import { CONFIG, faceOf, firstCard, hand, newGame, P, play, players, rig, types } from './helpers';

// ---------------------------------------------------------------------------
// Deck
// ---------------------------------------------------------------------------

describe('classic deck', () => {
    it('has 108 cards with the official composition', () => {
        const deck = buildClassicDeck();
        expect(deck).toHaveLength(CLASSIC_DECK_SIZE);
        const count = (pred: (f: (typeof deck)[number]['front']) => boolean) =>
            deck.filter((c) => pred(c.front)).length;
        expect(count((f) => f.kind === 'number' && f.value === 0)).toBe(4);
        expect(count((f) => f.kind === 'number' && f.value === 5)).toBe(8);
        expect(count((f) => f.kind === 'skip')).toBe(8);
        expect(count((f) => f.kind === 'reverse')).toBe(8);
        expect(count((f) => f.kind === 'draw2')).toBe(8);
        expect(count((f) => f.kind === 'wild')).toBe(4);
        expect(count((f) => f.kind === 'wild_draw4')).toBe(4);
        expect(new Set(deck.map((c) => c.id)).size).toBe(CLASSIC_DECK_SIZE);
    });
});

// ---------------------------------------------------------------------------
// Dealing
// ---------------------------------------------------------------------------

describe('start of round', () => {
    it('deals 7 cards to each player and flips one card', () => {
        const { state, events } = newGame(4);
        // An opening Draw Two legitimately gives the first player 9 cards.
        const openingIsDraw2 = faceOf(state, state.discardPile[0]!).kind === 'draw2';
        const bonus = openingIsDraw2 ? 2 : 0;
        const total = state.players.reduce((n, p) => n + p.hand.length, 0);
        expect(total).toBe(4 * INITIAL_HAND_SIZE + bonus);
        expect(state.discardPile).toHaveLength(1);
        expect(state.drawPile.length + state.discardPile.length + total).toBe(CLASSIC_DECK_SIZE);
        expect(types({ state, events })).toContain('DiscardStarted');
        expect(state.phase === 'playing' || state.phase === 'choosing_color').toBe(true);
    });

    it('never opens on a Wild Draw Four', () => {
        for (let seed = 0; seed < 200; seed++) {
            const { state } = newGame(3, seed);
            expect(faceOf(state, state.discardPile[0]!).kind).not.toBe('wild_draw4');
        }
    });

    it('rejects 1 or 5 players', () => {
        const s = engine.createInitialState(CONFIG, 1);
        expect(types(engine.apply(s, { type: 'START_GAME', players: players(1) }))).toEqual([
            'ActionRejected',
        ]);
        expect(types(engine.apply(s, { type: 'START_GAME', players: players(5) }))).toEqual([
            'ActionRejected',
        ]);
    });

    it('is deterministic for the same seed', () => {
        const a = newGame(4, 7).state;
        const b = newGame(4, 7).state;
        expect(a.players.map((p) => p.hand)).toEqual(b.players.map((p) => p.hand));
        expect(a.drawPile).toEqual(b.drawPile);
    });
});

// ---------------------------------------------------------------------------
// Legality
// ---------------------------------------------------------------------------

describe('legal moves', () => {
    const base = newGame(3).state;

    it('matches by colour, by number, by action kind, and any wild', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 5 },
            hands: {
                [P(0)]: [
                    { color: 'red', kind: 'number', value: 9 }, // colour
                    { color: 'blue', kind: 'number', value: 5 }, // number
                    { color: 'green', kind: 'number', value: 2 }, // neither
                    { color: 'wild', kind: 'wild' },
                    { color: 'wild', kind: 'wild_draw4' },
                    { color: 'blue', kind: 'skip' }, // kind mismatch with number
                ],
            },
        });
        const legal = engine.getLegalMoves(s, P(0)).map((m) => faceOf(s, m.card));
        expect(legal.map((f) => `${f.color}-${f.kind}-${f.value ?? ''}`)).toEqual([
            'red-number-9',
            'blue-number-5',
            'wild-wild-',
            'wild-wild_draw4-',
        ]);
    });

    it('matches action kind across colours', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'skip' },
            hands: {
                [P(0)]: [
                    { color: 'blue', kind: 'skip' },
                    { color: 'blue', kind: 'reverse' },
                ],
            },
        });
        expect(engine.getLegalMoves(s, P(0)).map((m) => faceOf(s, m.card).kind)).toEqual(['skip']);
    });

    it('uses activeColor, not the wild top card colour', () => {
        const s = rig(base, {
            top: { color: 'wild', kind: 'wild' },
            activeColor: 'green',
            hands: {
                [P(0)]: [
                    { color: 'green', kind: 'number', value: 1 },
                    { color: 'red', kind: 'number', value: 1 },
                ],
            },
        });
        expect(engine.getLegalMoves(s, P(0)).map((m) => faceOf(s, m.card).color)).toEqual([
            'green',
        ]);
    });

    it('returns nothing when it is not your turn', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(1)]: [{ color: 'red', kind: 'number', value: 2 }] },
        });
        expect(engine.getLegalMoves(s, P(1))).toEqual([]);
    });

    it('rejects an illegal play and a card not in hand', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'blue', kind: 'number', value: 2 }],
                [P(1)]: [{ color: 'red', kind: 'number', value: 3 }],
            },
        });
        expect(play(s, P(0), firstCard(s, P(0))).events[0]).toMatchObject({
            type: 'ActionRejected',
            reason: 'illegal_card',
        });
        expect(play(s, P(0), firstCard(s, P(1))).events[0]).toMatchObject({
            type: 'ActionRejected',
            reason: 'card_not_in_hand',
        });
        expect(play(s, P(1), firstCard(s, P(1))).events[0]).toMatchObject({
            type: 'ActionRejected',
            reason: 'not_your_turn',
        });
    });
});

// ---------------------------------------------------------------------------
// Action cards
// ---------------------------------------------------------------------------

describe('action cards', () => {
    const base = newGame(4).state;
    const filler = (color: 'red' | 'blue' = 'blue') => [
        { color, kind: 'number' as const, value: 3 },
        { color, kind: 'number' as const, value: 4 },
    ];

    it('number card advances to the next player', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'red', kind: 'number', value: 2 }, ...filler()] },
        });
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(types(r)).toEqual(['CardPlayed', 'TurnChanged']);
        expect(r.state.currentPlayer).toBe(P(1));
        expect(r.state.activeColor).toBe('red');
    });

    it('skip jumps over the next player', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'red', kind: 'skip' }, ...filler()] },
        });
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(types(r)).toEqual(['CardPlayed', 'TurnSkipped', 'TurnChanged']);
        expect(r.state.currentPlayer).toBe(P(2));
    });

    it('reverse flips direction with 3+ players', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'red', kind: 'reverse' }, ...filler()] },
        });
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(r.state.direction).toBe(-1);
        expect(r.state.currentPlayer).toBe(P(3));
    });

    it('reverse acts as skip with 2 players', () => {
        const two = newGame(2).state;
        const s = rig(two, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'red', kind: 'reverse' }, ...filler()] },
        });
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(types(r)).toContain('TurnSkipped');
        expect(r.state.currentPlayer).toBe(P(0));
    });

    it('draw two makes the next player draw 2 and lose their turn', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'red', kind: 'draw2' }, ...filler()], [P(1)]: filler() },
        });
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(hand(r.state, P(1))).toHaveLength(4);
        expect(r.events).toContainEqual(
            expect.objectContaining({ type: 'CardDrawn', player: P(1), reason: 'draw2' }),
        );
        expect(r.state.currentPlayer).toBe(P(2));
        expect(r.state.pendingDraw).toBeUndefined(); // official: no stacking
    });

    it('wild without a colour waits for CHOOSE_COLOR, then advances', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'wild', kind: 'wild' }, ...filler()] },
        });
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(r.state.phase).toBe('choosing_color');
        expect(engine.getLegalMoves(r.state, P(0))).toEqual([]);
        const bad = engine.apply(r.state, { type: 'CHOOSE_COLOR', player: P(1), color: 'blue' });
        expect(bad.events[0]).toMatchObject({ type: 'ActionRejected', reason: 'not_your_turn' });
        const ok = engine.apply(r.state, { type: 'CHOOSE_COLOR', player: P(0), color: 'blue' });
        expect(types(ok)).toEqual(['ColorChosen', 'TurnChanged']);
        expect(ok.state.activeColor).toBe('blue');
        expect(ok.state.currentPlayer).toBe(P(1));
    });

    it('wild with a colour supplied resolves in one action', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'wild', kind: 'wild' }, ...filler()] },
        });
        const r = play(s, P(0), firstCard(s, P(0)), 'green');
        expect(types(r)).toEqual(['CardPlayed', 'ColorChosen', 'TurnChanged']);
        expect(r.state.activeColor).toBe('green');
    });
});

// ---------------------------------------------------------------------------
// Wild Draw Four challenge
// ---------------------------------------------------------------------------

describe('wild draw four', () => {
    const base = newGame(3).state;
    const setup = (bluff: boolean): GameState =>
        rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [
                    { color: 'wild', kind: 'wild_draw4' },
                    { color: bluff ? 'red' : 'blue', kind: 'number', value: 7 },
                ],
                [P(1)]: [{ color: 'green', kind: 'number', value: 2 }],
            },
        });

    it('opens a challenge window for the next player', () => {
        const r = play(setup(false), P(0), firstCard(setup(false), P(0)), 'blue');
        expect(r.state.phase).toBe('challenge_window');
        expect(r.state.draw4Challenge).toMatchObject({
            player: P(0),
            target: P(1),
            priorColor: 'red',
            wasBluff: false,
        });
        expect(
            engine.apply(r.state, { type: 'ACCEPT_DRAW4', player: P(2) }).events[0],
        ).toMatchObject({ type: 'ActionRejected' });
    });

    it('without a colour, CHOOSE_COLOR leads into the challenge window', () => {
        const s = setup(false);
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(r.state.phase).toBe('choosing_color');
        const c = engine.apply(r.state, { type: 'CHOOSE_COLOR', player: P(0), color: 'blue' });
        expect(c.state.phase).toBe('challenge_window');
        expect(c.state.draw4Challenge?.target).toBe(P(1));
    });

    it('accept: target draws 4 and is skipped', () => {
        const s = setup(false);
        const r = play(s, P(0), firstCard(s, P(0)), 'blue');
        const a = engine.apply(r.state, { type: 'ACCEPT_DRAW4', player: P(1) });
        expect(hand(a.state, P(1))).toHaveLength(1 + PENALTY.SUCCESSFUL_CHALLENGE);
        expect(types(a)).toEqual(['CardDrawn', 'TurnSkipped', 'TurnChanged']);
        expect(a.state.currentPlayer).toBe(P(2));
        expect(a.state.activeColor).toBe('blue');
    });

    it('successful challenge: bluffer draws 4, challenger plays next', () => {
        const s = setup(true);
        const r = play(s, P(0), firstCard(s, P(0)), 'blue');
        expect(r.state.draw4Challenge?.wasBluff).toBe(true);
        const c = engine.apply(r.state, { type: 'CHALLENGE_DRAW4', player: P(1) });
        expect(c.events).toContainEqual({
            type: 'Draw4Challenged',
            by: P(1),
            against: P(0),
            succeeded: true,
        });
        expect(hand(c.state, P(0))).toHaveLength(1 + PENALTY.SUCCESSFUL_CHALLENGE);
        expect(hand(c.state, P(1))).toHaveLength(1);
        expect(c.state.currentPlayer).toBe(P(1));
    });

    it('failed challenge: challenger draws 6 and is skipped', () => {
        const s = setup(false);
        const r = play(s, P(0), firstCard(s, P(0)), 'blue');
        const c = engine.apply(r.state, { type: 'CHALLENGE_DRAW4', player: P(1) });
        expect(c.events).toContainEqual({
            type: 'Draw4Challenged',
            by: P(1),
            against: P(0),
            succeeded: false,
        });
        expect(hand(c.state, P(1))).toHaveLength(1 + PENALTY.FAILED_CHALLENGE);
        expect(c.state.currentPlayer).toBe(P(2));
    });

    it('wild draw four as the last card still ends the round after the penalty', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'wild', kind: 'wild_draw4' }],
                [P(1)]: [{ color: 'green', kind: 'number', value: 2 }],
                [P(2)]: [{ color: 'blue', kind: 'skip' }],
            },
        });
        const r = play(s, P(0), firstCard(s, P(0)), 'blue');
        const a = engine.apply(r.state, { type: 'ACCEPT_DRAW4', player: P(1) });
        expect(a.state.phase).toBe('round_over');
        expect(a.state.roundWinner).toBe(P(0));
    });
});

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

describe('drawing', () => {
    const base = newGame(3).state;

    it('unplayable drawn card ends the turn immediately', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'blue', kind: 'number', value: 9 }] },
        });
        // Force the top of the draw pile to be unplayable.
        const unplayable = s.drawPile.find(
            (id) =>
                faceOf(s, id).color === 'green' &&
                faceOf(s, id).kind === 'number' &&
                faceOf(s, id).value !== 1,
        )!;
        const rigged: GameState = {
            ...s,
            drawPile: [...s.drawPile.filter((id) => id !== unplayable), unplayable],
        };
        const r = engine.apply(rigged, { type: 'DRAW_CARD', player: P(0) });
        expect(types(r)).toEqual(['CardDrawn', 'TurnChanged']);
        expect(r.state.currentPlayer).toBe(P(1));
        expect(hand(r.state, P(0))).toHaveLength(2);
    });

    it('playable drawn card may be played or passed, but no other card', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'red', kind: 'number', value: 9 }] },
        });
        const playable = s.drawPile.find(
            (id) =>
                faceOf(s, id).color === 'red' &&
                faceOf(s, id).kind === 'number' &&
                faceOf(s, id).value === 5,
        )!;
        const rigged: GameState = {
            ...s,
            drawPile: [...s.drawPile.filter((id) => id !== playable), playable],
        };
        const r = engine.apply(rigged, { type: 'DRAW_CARD', player: P(0) });
        expect(r.state.drawnCard).toBe(playable);
        expect(r.state.currentPlayer).toBe(P(0));
        expect(engine.getLegalMoves(r.state, P(0)).map((m) => m.card)).toEqual([playable]);
        const other = play(r.state, P(0), hand(r.state, P(0))[0]!);
        expect(other.events[0]).toMatchObject({ type: 'ActionRejected', reason: 'illegal_card' });
        expect(engine.apply(r.state, { type: 'DRAW_CARD', player: P(0) }).events[0]).toMatchObject({
            type: 'ActionRejected',
        });
        const passed = engine.apply(r.state, { type: 'PASS', player: P(0) });
        expect(passed.state.currentPlayer).toBe(P(1));
        const played = play(r.state, P(0), playable);
        expect(types(played)).toEqual(['CardPlayed', 'TurnChanged']);
    });

    it('reshuffles the discard pile (minus top) when the draw pile is empty', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'blue', kind: 'number', value: 9 }] },
            drawPileSize: 0,
        });
        const discards = s.drawPile; // empty
        expect(discards).toHaveLength(0);
        const spare = (Object.keys(s.cards) as CardId[])
            .filter((id) => !hand(s, P(0)).includes(id) && id !== s.discardPile[0])
            .slice(0, 10);
        const withDiscards: GameState = { ...s, discardPile: [...spare, s.discardPile[0]!] };
        const r = engine.apply(withDiscards, { type: 'DRAW_CARD', player: P(0) });
        expect(types(r)[0]).toBe('DrawPileReshuffled');
        expect(r.state.discardPile).toEqual([s.discardPile[0]]);
        expect(r.state.drawPile).toHaveLength(9);
    });
});

// ---------------------------------------------------------------------------
// UNO call
// ---------------------------------------------------------------------------

describe('UNO', () => {
    const base = newGame(3).state;
    const twoCards = () =>
        rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [
                    { color: 'red', kind: 'number', value: 2 },
                    { color: 'blue', kind: 'number', value: 3 },
                ],
                [P(1)]: [
                    { color: 'red', kind: 'number', value: 4 },
                    { color: 'green', kind: 'number', value: 4 },
                    { color: 'green', kind: 'number', value: 6 },
                ],
            },
        });

    it('playing to one card without calling makes you catchable', () => {
        const s = twoCards();
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(r.state.unoVulnerable).toBe(P(0));
        const c = engine.apply(r.state, { type: 'CATCH_UNO', player: P(1), target: P(0) });
        expect(types(c)).toEqual(['UnoCaught', 'CardDrawn']);
        expect(hand(c.state, P(0))).toHaveLength(1 + PENALTY.MISSED_UNO_CALL);
        expect(c.state.unoVulnerable).toBeUndefined();
    });

    it('calling UNO before playing protects you', () => {
        const s = twoCards();
        const u = engine.apply(s, { type: 'CALL_UNO', player: P(0) });
        expect(types(u)).toEqual(['UnoCalled']);
        const r = play(u.state, P(0), firstCard(u.state, P(0)));
        expect(r.state.unoVulnerable).toBeUndefined();
        expect(
            engine.apply(r.state, { type: 'CATCH_UNO', player: P(1), target: P(0) }).events[0],
        ).toMatchObject({ type: 'ActionRejected' });
    });

    it('calling UNO just after playing also works, and cannot be called twice', () => {
        const s = twoCards();
        const r = play(s, P(0), firstCard(s, P(0)));
        const u = engine.apply(r.state, { type: 'CALL_UNO', player: P(0) });
        expect(u.state.unoVulnerable).toBeUndefined();
        expect(engine.apply(u.state, { type: 'CALL_UNO', player: P(0) }).events[0]).toMatchObject({
            reason: 'already_called',
        });
    });

    it('cannot call UNO with 3+ cards, and you cannot catch yourself', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [
                    { color: 'red', kind: 'number', value: 2 },
                    { color: 'blue', kind: 'number', value: 3 },
                    { color: 'blue', kind: 'number', value: 5 },
                ],
            },
        });
        expect(engine.apply(s, { type: 'CALL_UNO', player: P(0) }).events[0]).toMatchObject({
            type: 'ActionRejected',
        });
        const two = twoCards();
        const r = play(two, P(0), firstCard(two, P(0)));
        expect(
            engine.apply(r.state, { type: 'CATCH_UNO', player: P(0), target: P(0) }).events[0],
        ).toMatchObject({ reason: 'no_uno_to_catch' });
    });

    it('the window closes once the next player acts', () => {
        const s = twoCards();
        const r = play(s, P(0), firstCard(s, P(0)));
        const n = play(r.state, P(1), firstCard(r.state, P(1)));
        expect(n.state.unoVulnerable).toBeUndefined();
        expect(
            engine.apply(n.state, { type: 'CATCH_UNO', player: P(2), target: P(0) }).events[0],
        ).toMatchObject({ type: 'ActionRejected' });
    });

    it('TIMEOUT clears vulnerability without penalty', () => {
        const s = twoCards();
        const r = play(s, P(0), firstCard(s, P(0)));
        const t = engine.apply(r.state, { type: 'TIMEOUT', player: P(0) });
        expect(t.state.unoVulnerable).toBeUndefined();
        expect(hand(t.state, P(0))).toHaveLength(1);
    });

    it('drawing resets the UNO call', () => {
        const s = twoCards();
        const u = engine.apply(s, { type: 'CALL_UNO', player: P(0) });
        const d = engine.apply(u.state, { type: 'DRAW_CARD', player: P(0) });
        expect(d.state.players[0]!.calledUno).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

describe('scoring', () => {
    const base = newGame(3).state;

    it('winner collects face value, 20 per action card, 50 per wild', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'red', kind: 'number', value: 2 }],
                [P(1)]: [
                    { color: 'blue', kind: 'number', value: 7 },
                    { color: 'green', kind: 'skip' },
                ],
                [P(2)]: [
                    { color: 'wild', kind: 'wild' },
                    { color: 'wild', kind: 'wild_draw4' },
                    { color: 'red', kind: 'number', value: 0 },
                ],
            },
        });
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(r.state.phase).toBe('round_over');
        expect(r.events).toContainEqual(
            expect.objectContaining({
                type: 'RoundEnded',
                winner: P(0),
                points: 7 + 20 + 50 + 50 + 0,
            }),
        );
        expect(r.state.players[0]!.score).toBe(127);
    });

    it('ends the game at the target score and rejects further rounds', () => {
        const low = { ...base, config: { ...base.config, targetScore: 100 } };
        const s = rig(low, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'red', kind: 'number', value: 2 }],
                [P(1)]: [
                    { color: 'wild', kind: 'wild' },
                    { color: 'wild', kind: 'wild' },
                ],
            },
        });
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(r.state.phase).toBe('game_over');
        expect(r.state.gameWinner).toBe(P(0));
        expect(types(r)).toContain('GameEnded');
        expect(engine.apply(r.state, { type: 'START_ROUND' }).events[0]).toMatchObject({
            type: 'ActionRejected',
        });
    });

    it('next round rotates the dealer and keeps scores', () => {
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'red', kind: 'number', value: 2 }],
                [P(1)]: [{ color: 'blue', kind: 'number', value: 9 }],
            },
        });
        const r = play(s, P(0), firstCard(s, P(0)));
        const next = engine.apply(r.state, { type: 'START_ROUND' });
        expect(next.state.round).toBe(2);
        expect(next.events[0]).toMatchObject({ type: 'RoundStarted', round: 2, dealer: P(1) });
        expect(next.state.players[0]!.score).toBe(9);
        for (const p of next.state.players) expect(p.hand).toHaveLength(INITIAL_HAND_SIZE);
    });
});

// ---------------------------------------------------------------------------
// Replay
// ---------------------------------------------------------------------------

describe('replay', () => {
    it('rebuilds identical state from seed + actions', () => {
        const actions: Action[] = [
            { type: 'START_GAME', players: players(3) },
            { type: 'START_ROUND' },
        ];
        let s = engine.createInitialState(CONFIG, 99);
        for (const a of actions) s = engine.apply(s, a).state;
        // Play a few legal moves / draws.
        for (let i = 0; i < 6 && s.phase === 'playing'; i++) {
            const legal = engine.getLegalMoves(s, s.currentPlayer);
            const a: Action = legal[0]
                ? {
                      type: 'PLAY_CARD',
                      player: s.currentPlayer,
                      card: legal[0].card,
                      chosenColor: 'blue',
                  }
                : { type: 'DRAW_CARD', player: s.currentPlayer };
            actions.push(a);
            s = engine.apply(s, a).state;
        }
        expect(engine.replay(CONFIG, 99, actions)).toEqual(s);
    });
});

// ---------------------------------------------------------------------------
// Opening card effects
// ---------------------------------------------------------------------------

describe('opening card', () => {
    const findSeed = (kind: string, n = 3): { state: GameState; seed: number } => {
        for (let seed = 0; seed < 2000; seed++) {
            const { state } = newGame(n, seed);
            if (faceOf(state, state.discardPile[0]!).kind === kind) return { state, seed };
        }
        throw new Error(`no seed opens on ${kind}`);
    };

    it('wild: first player chooses the colour and then plays', () => {
        const { state } = findSeed('wild');
        expect(state.phase).toBe('choosing_color');
        expect(state.currentPlayer).toBe(P(1));
        const r = engine.apply(state, { type: 'CHOOSE_COLOR', player: P(1), color: 'green' });
        expect(types(r)).toEqual(['ColorChosen']);
        expect(r.state.phase).toBe('playing');
        expect(r.state.currentPlayer).toBe(P(1));
        expect(r.state.activeColor).toBe('green');
    });

    it('reverse: dealer plays first and direction is reversed', () => {
        const { state } = findSeed('reverse');
        expect(state.direction).toBe(-1);
        expect(state.currentPlayer).toBe(P(0));
    });

    it('reverse with 2 players: acts as a skip, so the dealer plays first via one normal hand-over', () => {
        const { state, seed } = findSeed('reverse', 2);
        expect(state.direction).toBe(-1);
        expect(state.currentPlayer).toBe(P(0));
        const events = newGame(2, seed).events;
        expect(types({ state, events })).toContain('TurnSkipped');
        expect(events.filter((e) => e.type === 'TurnChanged')).toEqual([
            { type: 'TurnChanged', player: P(0) },
        ]);
    });

    it('skip: first player is skipped', () => {
        const { state } = findSeed('skip');
        expect(state.currentPlayer).toBe(P(2));
    });

    it('draw two: first player draws 2 and is skipped', () => {
        const { state } = findSeed('draw2');
        expect(hand(state, P(1))).toHaveLength(INITIAL_HAND_SIZE + 2);
        expect(state.currentPlayer).toBe(P(2));
    });

    it('VARIANT actions are rejected by Classic', () => {
        const { state } = newGame(2);
        expect(
            engine.apply(state, { type: 'VARIANT', player: P(0), payload: null }).events[0],
        ).toMatchObject({ reason: 'variant_rule' });
    });
});
