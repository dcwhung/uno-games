/**
 * CUI-0101 — the reducer is pure, so a malformed action must come back as an
 * ActionRejected event, never as a thrown Error. A corrupted replay log or a
 * remote client can name a seat that does not exist at the table; `getPlayer`
 * throws on an unknown id, so every handler that looks a player up has to be
 * guarded. `apply` validates the actor once, up front, for all of them.
 *
 * CUI-0405 — the first cut of that guard read the actor with
 * `'player' in action ? action.player : undefined` and skipped validation when
 * the answer was `undefined`, so the one value it had to catch was the one it
 * waved through: an action whose `player` is missing or `undefined`. That is
 * not an exotic shape — `JSON.stringify` deletes every key whose value is
 * `undefined`, so it is what a persisted action log turns into. The describes
 * below pin each malformed shape QA found, plus the neighbouring fields
 * (`CATCH_UNO.target`, the colours, the START_GAME roster) that the same
 * "trust the union at runtime" mistake left open.
 */
import { describe, expect, it } from 'vitest';
import { elementAt, engine } from '../src';
import type { Action, GameState, PlayerId } from '../src';
import { CONFIG, DEFAULT_SEED, firstCard, newGame, P, players, rig } from './helpers';

const GHOST = 'ghost' as PlayerId;
const TWO_PLAYERS = 2;
const ONE_PLAYER = 1;
const OVER_MAX_PLAYERS = 5;
const LONG_ID_LENGTH = 10_000;
const CATCH_UNO_INDEX = 2;

/** Every action shape that carries a `player`, with `actor` in the actor slot. */
function actorActions(state: GameState, actor: unknown): Action[] {
    const player = actor as PlayerId;
    return [
        { type: 'PLAY_CARD', player, card: firstCard(state, P(0)) },
        { type: 'DRAW_CARD', player },
        { type: 'PASS', player },
        { type: 'CHOOSE_COLOR', player, color: 'blue' },
        { type: 'CALL_UNO', player },
        { type: 'CATCH_UNO', player, target: P(0) },
        { type: 'CHALLENGE_DRAW4', player },
        { type: 'ACCEPT_DRAW4', player },
        { type: 'TIMEOUT', player },
        { type: 'VARIANT', player, payload: null },
    ];
}

/** The same shapes aimed at a seat that does not exist. */
function ghostActions(state: GameState): Action[] {
    return actorActions(state, GHOST);
}

/** `action` with one key deleted — what a JSON round-trip does to an undefined value. */
function withoutKey(action: Action, key: string): Action {
    const copy: Record<string, unknown> = { ...action };
    delete copy[key];
    return copy as Action;
}

/**
 * Values a `player` field can hold once the action has left TypeScript: a log
 * that went through JSON, a database null, a wrong-typed remote payload, a key
 * chosen to walk the prototype chain, a near-miss of a real seat id.
 */
const MALFORMED_ACTORS: readonly { readonly label: string; readonly value: unknown }[] = [
    { label: 'undefined', value: undefined },
    { label: 'null', value: null },
    { label: 'number', value: 0 },
    { label: 'boolean', value: true },
    { label: 'empty string', value: '' },
    { label: 'plain object', value: {} },
    { label: 'object with an id', value: { id: 'p0' } },
    { label: 'array', value: ['p0'] },
    { label: 'prototype key', value: '__proto__' },
    { label: 'constructor key', value: 'constructor' },
    { label: 'inherited method name', value: 'toString' },
    { label: 'wrong case', value: 'P0' },
    { label: 'trailing space', value: 'p0 ' },
    { label: 'unicode look-alike', value: 'р0' },
    { label: 'very long string', value: 'p'.repeat(LONG_ID_LENGTH) },
    { label: 'symbol', value: Symbol('p0') },
];

/** Action types no engine build knows, including ones that live on Object.prototype. */
const UNKNOWN_ACTION_TYPES: readonly unknown[] = [
    '',
    'play_card',
    'PLAY_CARD ',
    'NOPE',
    '__proto__',
    'constructor',
    'toString',
    undefined,
    null,
    0,
    {},
];

describe('actor validation', () => {
    const base = newGame(TWO_PLAYERS).state;
    const table = () =>
        rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'red', kind: 'number', value: 2 }],
                [P(1)]: [{ color: 'red', kind: 'number', value: 3 }],
            },
        });

    it('should reject CALL_UNO from an unknown player instead of throwing', () => {
        const s = table();
        const r = engine.apply(s, { type: 'CALL_UNO', player: GHOST });
        expect(r.events).toEqual([
            {
                type: 'ActionRejected',
                action: { type: 'CALL_UNO', player: GHOST },
                reason: 'unknown_player',
            },
        ]);
        expect(r.state).toBe(s);
    });

    it('should reject CATCH_UNO from an unknown player instead of throwing', () => {
        const s = { ...table(), unoVulnerable: P(0) };
        const r = engine.apply(s, { type: 'CATCH_UNO', player: GHOST, target: P(0) });
        expect(r.events[0]).toMatchObject({ type: 'ActionRejected', reason: 'unknown_player' });
        expect(r.state).toBe(s);
    });

    it('should reject CATCH_UNO naming an unknown target instead of throwing', () => {
        const s = { ...table(), unoVulnerable: P(0) };
        const r = engine.apply(s, { type: 'CATCH_UNO', player: P(1), target: GHOST });
        expect(r.events[0]).toMatchObject({ type: 'ActionRejected', reason: 'no_uno_to_catch' });
        expect(r.state).toBe(s);
    });

    it('should reject every player-bearing action from an unknown player', () => {
        const s = table();
        for (const action of ghostActions(s)) {
            const r = engine.apply(s, action);
            expect(r.events[0], action.type).toMatchObject({
                type: 'ActionRejected',
                reason: 'unknown_player',
            });
            expect(r.state, action.type).toBe(s);
        }
    });

    it('should still reject a known player by the rule that actually applies', () => {
        // Regression guard: the entry check must not shadow the handlers' own reasons.
        const s = table();
        expect(
            engine.apply(s, { type: 'PLAY_CARD', player: P(1), card: firstCard(s, P(1)) })
                .events[0],
        ).toMatchObject({ reason: 'not_your_turn' });
        expect(engine.apply(s, { type: 'CALL_UNO', player: P(0) }).events[0]).toMatchObject({
            type: 'UnoCalled',
        });
        expect(engine.apply(s, { type: 'PASS', player: P(0) }).events[0]).toMatchObject({
            reason: 'wrong_phase',
        });
    });

    it('should leave table-level actions with no actor untouched', () => {
        // START_GAME / START_ROUND carry no `player`; validation must skip them.
        const lobby = engine.createInitialState(base.config, base.seed);
        expect(engine.apply(lobby, { type: 'START_ROUND' }).events[0]).toMatchObject({
            type: 'ActionRejected',
            reason: 'wrong_phase',
        });
        expect(newGame(TWO_PLAYERS).state.phase).toBe('playing');
    });
});

describe('malformed actor (CUI-0405)', () => {
    const base = newGame(TWO_PLAYERS).state;
    const table = () =>
        rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'red', kind: 'number', value: 2 }],
                [P(1)]: [{ color: 'red', kind: 'number', value: 3 }],
            },
        });

    it('should reject every player-bearing action whose actor is undefined', () => {
        const s = table();
        for (const action of actorActions(s, undefined)) {
            expect(() => engine.apply(s, action), action.type).not.toThrow();
            expect(engine.apply(s, action).events[0], action.type).toMatchObject({
                type: 'ActionRejected',
                reason: 'unknown_player',
            });
        }
    });

    it('should reject every player-bearing action whose player key was dropped', () => {
        // What JSON.stringify leaves behind: the key is gone, not merely undefined.
        const s = table();
        for (const shape of actorActions(s, P(0))) {
            const action = withoutKey(shape, 'player');
            expect(Object.hasOwn(action, 'player'), shape.type).toBe(false);
            expect(() => engine.apply(s, action), shape.type).not.toThrow();
            expect(engine.apply(s, action).events[0], shape.type).toMatchObject({
                type: 'ActionRejected',
                reason: 'unknown_player',
            });
        }
    });

    it('should reject an actor of any wrong type rather than throwing or accepting it', () => {
        const s = table();
        const problems: string[] = [];
        for (const { label, value } of MALFORMED_ACTORS) {
            for (const action of actorActions(s, value)) {
                const where = `${action.type} with ${label}`;
                try {
                    const r = engine.apply(s, action);
                    if (r.state !== s) problems.push(`${where}: state changed`);
                    const [first] = r.events;
                    if (first?.type !== 'ActionRejected' || first.reason !== 'unknown_player')
                        problems.push(`${where}: ${JSON.stringify(r.events.map((e) => e.type))}`);
                } catch (error) {
                    problems.push(`${where}: threw ${String(error)}`);
                }
            }
        }
        expect(problems).toEqual([]);
    });

    it('should reject an action type it does not know instead of returning nothing', () => {
        // Without this the switch in `apply` falls through and returns undefined,
        // so `replay` dies on `.state` one line later.
        const s = table();
        for (const type of UNKNOWN_ACTION_TYPES) {
            const action = { type, player: P(0) } as Action;
            const label = String(type);
            expect(() => engine.apply(s, action), label).not.toThrow();
            expect(engine.apply(s, action).events[0], label).toMatchObject({
                type: 'ActionRejected',
                reason: 'unknown_action',
            });
            expect(engine.apply(s, action).state, label).toBe(s);
        }
    });

    it('should reject CATCH_UNO with no target while nobody is vulnerable', () => {
        // `unoVulnerable` is undefined for most of a round, so a target that is
        // also undefined compares equal to it and falls through to the
        // eliminated lookup — which throws on a seat that is not there.
        const s = table();
        expect(s.unoVulnerable).toBeUndefined();
        const action = withoutKey({ type: 'CATCH_UNO', player: P(0), target: P(1) }, 'target');
        expect(() => engine.apply(s, action)).not.toThrow();
        expect(engine.apply(s, action).events[0]).toMatchObject({
            type: 'ActionRejected',
            reason: 'no_uno_to_catch',
        });
    });

    it('should replay a JSON round-tripped log that lost its actor', () => {
        // The reachable path from the ticket: persist a log, read it back, resume.
        const log = [
            { type: 'START_GAME', players: players(TWO_PLAYERS) },
            { type: 'START_ROUND' },
            { type: 'CATCH_UNO', player: undefined, target: P(0) },
        ] as Action[];
        const persisted = JSON.parse(JSON.stringify(log)) as Action[];
        const revived = elementAt(persisted, CATCH_UNO_INDEX, 'the round-tripped CATCH_UNO');
        expect(Object.hasOwn(revived, 'player')).toBe(false);

        expect(() => engine.replay(CONFIG, DEFAULT_SEED, persisted)).not.toThrow();
        expect(engine.replay(CONFIG, DEFAULT_SEED, persisted).phase).toBe('playing');
    });
});

describe('malformed action fields (CUI-0405)', () => {
    const base = newGame(TWO_PLAYERS).state;
    const table = () =>
        rig(base, {
            top: { color: 'wild', kind: 'wild' },
            hands: {
                [P(0)]: [{ color: 'wild', kind: 'wild' }],
                [P(1)]: [{ color: 'red', kind: 'number', value: 3 }],
            },
        });

    it('should reject CHOOSE_COLOR without a usable colour instead of storing it', () => {
        const s: GameState = { ...table(), phase: 'choosing_color' };
        for (const { label, value } of MALFORMED_ACTORS) {
            const action = { type: 'CHOOSE_COLOR', player: P(0), color: value } as Action;
            expect(() => engine.apply(s, action), label).not.toThrow();
            const r = engine.apply(s, action);
            expect(r.events[0], label).toMatchObject({
                type: 'ActionRejected',
                reason: 'color_required',
            });
            expect(r.state.activeColor, label).toBe(s.activeColor);
        }
    });

    it('should reject PLAY_CARD whose chosenColor is not a colour', () => {
        const s = table();
        const card = firstCard(s, P(0));
        const bogus = {
            type: 'PLAY_CARD',
            player: P(0),
            card,
            chosenColor: 'purple',
        } as unknown as Action;
        expect(() => engine.apply(s, bogus)).not.toThrow();
        expect(engine.apply(s, bogus).events[0]).toMatchObject({
            type: 'ActionRejected',
            reason: 'color_required',
        });

        // An absent chosenColor is the normal Wild flow and must still work.
        const wild = { type: 'PLAY_CARD', player: P(0), card } as Action;
        expect(engine.apply(s, wild).state.phase).toBe('choosing_color');
    });

    it('should reject a roster seat whose declared fields are not what PlayerConfig says', () => {
        const lobby = engine.createInitialState(CONFIG, DEFAULT_SEED);
        // One malformed seat per roster, alongside one sound seat, so the
        // rejection can only be coming from the field under test.
        const sound = { id: P(1), name: 'Player 1', kind: 'bot' };
        const brokenSeats: readonly Readonly<Record<string, unknown>>[] = [
            { id: P(0), kind: 'human' }, // name missing
            { id: P(0), name: null, kind: 'human' },
            { id: P(0), name: 7, kind: 'human' },
            { id: P(0), name: { toString: 'not a string' }, kind: 'human' },
            { id: P(0), name: 'Player 0' }, // kind missing
            { id: P(0), name: 'Player 0', kind: null },
            { id: P(0), name: 'Player 0', kind: 'Human' }, // case matters
            { id: P(0), name: 'Player 0', kind: 'spectator' },
            { id: P(0), name: 'Player 0', kind: 'bot', difficulty: 'ultra' },
            { id: P(0), name: 'Player 0', kind: 'bot', difficulty: null },
            { id: P(0), name: 'Player 0', kind: 'bot', difficulty: 2 },
            { id: P(0), name: 'Player 0', kind: 'bot', team: '1' },
            { id: P(0), name: 'Player 0', kind: 'bot', team: null },
        ];
        for (const seat of brokenSeats) {
            const action = { type: 'START_GAME', players: [seat, sound] } as unknown as Action;
            const label = JSON.stringify(seat) ?? 'undefined';
            expect(() => engine.apply(lobby, action), label).not.toThrow();
            expect(engine.apply(lobby, action).events[0], label).toMatchObject({
                type: 'ActionRejected',
                reason: 'variant_rule',
            });
            expect(engine.apply(lobby, action).state, label).toBe(lobby);
        }
    });

    it('should still seat a roster whose optional fields are absent or well formed', () => {
        const lobby = engine.createInitialState(CONFIG, DEFAULT_SEED);
        const rosters: readonly unknown[] = [
            players(TWO_PLAYERS), // no difficulty, no team
            [
                { id: P(0), name: 'Player 0', kind: 'human', team: 0 },
                { id: P(1), name: 'Player 1', kind: 'bot', difficulty: 'hard', team: 1 },
            ],
            [
                { id: P(0), name: '', kind: 'human' }, // empty name is a name
                { id: P(1), name: 'Player 1', kind: 'bot', difficulty: 'easy' },
            ],
        ];
        for (const roster of rosters) {
            const action = { type: 'START_GAME', players: roster } as Action;
            const label = JSON.stringify(roster) ?? 'undefined';
            expect(engine.apply(lobby, action).events[0], label).toMatchObject({
                type: 'GameStarted',
            });
        }
    });

    it('should reject START_GAME whose roster is not a seatable list', () => {
        const lobby = engine.createInitialState(CONFIG, DEFAULT_SEED);
        const rosters: readonly unknown[] = [
            undefined,
            null,
            'p0p1',
            0,
            {},
            [],
            [null, null],
            [{ name: 'no id' }, { name: 'no id either' }],
            [{ id: 0 }, { id: 1 }],
            players(ONE_PLAYER),
            players(OVER_MAX_PLAYERS),
        ];
        for (const roster of rosters) {
            const action = { type: 'START_GAME', players: roster } as Action;
            const label = JSON.stringify(roster) ?? 'undefined';
            expect(() => engine.apply(lobby, action), label).not.toThrow();
            expect(engine.apply(lobby, action).events[0], label).toMatchObject({
                type: 'ActionRejected',
                reason: 'variant_rule',
            });
        }
    });
});
