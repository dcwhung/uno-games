/**
 * malformed-action.fuzz.spec.ts — CUI-0405, the defect class rather than the case.
 *
 * actor-validation.spec.ts pins the exact shapes QA found. This spec goes after
 * what they are instances of: `Action` is a compile-time union and nothing more,
 * so `apply` must survive *any* value, and the way to show that is to feed it
 * values nobody wrote by hand. Every field of every action type is randomised
 * over a pool of the shapes real callers actually produce — a key a JSON round
 * trip deleted, a database null, a number where an id belongs, an object, a
 * prototype-walking key, an empty string, unicode, an absurd length — plus
 * action types this engine has never heard of.
 *
 * Two assertions, both about the contract in `apply`'s header comment:
 *  1. `apply` never throws. A reject is an event, not an exception.
 *  2. the state it returns is still readable — a known phase, a real colour, an
 *     integer tick, seats that are seats. "Did not throw" is not enough: an
 *     unvalidated `chosenColor` used to land in `activeColor` verbatim.
 *
 * Determinism: every value comes from `rngForTick(FUZZ_SEED, case)`, the
 * engine's own PRNG. CLAUDE.md R1 bans Math.random outright, and a fuzz run
 * that cannot be reproduced reports failures nobody can act on; this one draws
 * the same actions on every machine and every run, and a failure names the
 * scenario and case index that produced it.
 */
import { describe, expect, it } from 'vitest';
import { CARD_COLORS, elementAt, engine, MAX_PLAYERS, MIN_PLAYERS, rngForTick } from '../src';
import type { Action, ApplyResult, GameState, Phase, PlayerState } from '../src';
import { CONFIG, DEFAULT_SEED, newGame, P, players, rig } from './helpers';

const FUZZ_SEED = 0x0405;
const CASES_PER_SCENARIO = 300;
/** Enough context to debug from, without a failure message the size of the run. */
const MAX_REPORTED_PROBLEMS = 10;

const TWO_PLAYERS = 2;
const FOUR_PLAYERS = 4;
const LONG_STRING_LENGTH = 10_000;
const PICK = 'the fuzz pool is not empty';

// Roll shapes. A field is absent 40% of the time (what a JSON round trip does),
// malformed 40%, and valid 20% — often enough that legal actions do get built,
// which is what keeps the run from only ever exercising the reject paths.
const FIELD_ROLL_SIDES = 10;
const FIELD_ABSENT_BELOW = 4;
const FIELD_MALFORMED_BELOW = 8;
/** One case in this many omits `type` entirely / names a type the engine has never heard of. */
const TYPE_ABSENT_IN = 20;
const TYPE_UNKNOWN_IN = 8;

const ACTION_TYPES: readonly string[] = [
    'START_GAME',
    'START_ROUND',
    'PLAY_CARD',
    'DRAW_CARD',
    'PASS',
    'CHOOSE_COLOR',
    'CALL_UNO',
    'CATCH_UNO',
    'CHALLENGE_DRAW4',
    'ACCEPT_DRAW4',
    'TIMEOUT',
    'VARIANT',
];

const UNKNOWN_TYPES: readonly unknown[] = [
    '',
    'play_card',
    'PLAY_CARD ',
    'START',
    '__proto__',
    'constructor',
    'toString',
    'hasOwnProperty',
    0,
    null,
    {},
];

/** Fields any action shape in the union carries; every case draws for all of them. */
const FIELDS: readonly string[] = [
    'player',
    'target',
    'card',
    'color',
    'chosenColor',
    'players',
    'payload',
];

/** An object literal with an own `__proto__` key — only JSON.parse builds one. */
const POLLUTING_OBJECT: unknown = JSON.parse('{"__proto__":{"polluted":true}}');

const MALFORMED_VALUES: readonly unknown[] = [
    undefined,
    null,
    true,
    false,
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    '',
    ' ',
    'p',
    'P0',
    'p0 ',
    'ghost',
    'null',
    '0',
    '__proto__',
    'constructor',
    'prototype',
    'toString',
    'hasOwnProperty',
    '\u0000',
    'p\u0000',
    '\n',
    '🂡🃏',
    'р0',
    'x'.repeat(LONG_STRING_LENGTH),
    {},
    { id: 'p0' },
    { type: 'PLAY_CARD' },
    [],
    ['p0'],
    [null],
    Symbol('fuzz'),
    () => 'p0',
    new Map(),
    POLLUTING_OBJECT,
];

/**
 * The pool, boxed. It holds `undefined` itself, and an indexed read cannot tell
 * that apart from reading past the end — which is exactly what `elementAt`
 * refuses to guess at. Boxing keeps the draw honest without an assertion.
 */
const MALFORMED_BOXES: readonly { readonly value: unknown }[] = MALFORMED_VALUES.map((value) => ({
    value,
}));

const PHASES: readonly Phase[] = [
    'lobby',
    'dealing',
    'playing',
    'choosing_color',
    'challenge_window',
    'round_over',
    'game_over',
];

interface Stream {
    int(max: number): number;
    pick<T>(items: readonly T[]): T;
}

/** Deterministic value stream: the engine's PRNG, one per scenario (CLAUDE.md R1). */
function stream(tick: number): Stream {
    let rng = rngForTick(FUZZ_SEED, tick);
    const int = (max: number): number => {
        const { value, rng: next } = rng.next();
        rng = next;
        return Math.floor(value * max);
    };
    return {
        int,
        pick<T>(items: readonly T[]): T {
            return elementAt(items, int(items.length), PICK);
        },
    };
}

/** A value this field would hold if the caller were well behaved. */
function validFor(field: string, state: GameState, s: Stream): unknown {
    switch (field) {
        case 'player':
        case 'target':
            return state.players.length > 0 ? s.pick(state.players).id : P(0);
        case 'card': {
            const ids = Object.keys(state.cards);
            return ids.length > 0 ? s.pick(ids) : 'c0';
        }
        case 'color':
        case 'chosenColor':
            return s.pick(CARD_COLORS);
        case 'players':
            return players(MIN_PLAYERS + s.int(MAX_PLAYERS - MIN_PLAYERS + 1));
        default:
            return null;
    }
}

function generate(state: GameState, s: Stream): Action {
    const action: Record<string, unknown> = {};
    if (s.int(TYPE_ABSENT_IN) !== 0) {
        action.type = s.int(TYPE_UNKNOWN_IN) === 0 ? s.pick(UNKNOWN_TYPES) : s.pick(ACTION_TYPES);
    }
    for (const field of FIELDS) {
        const roll = s.int(FIELD_ROLL_SIDES);
        if (roll < FIELD_ABSENT_BELOW) continue;
        action[field] =
            roll < FIELD_MALFORMED_BELOW
                ? s.pick(MALFORMED_BOXES).value
                : validFor(field, state, s);
    }
    return action as unknown as Action;
}

/** The action as it comes back from a persisted log, or undefined when it will not serialise. */
function roundTrip(action: Action): Action | undefined {
    try {
        const json = JSON.stringify(action);
        return json === undefined ? undefined : (JSON.parse(json) as Action);
    } catch {
        return undefined;
    }
}

function isSeat(p: PlayerState): boolean {
    return typeof p.id === 'string' && Array.isArray(p.hand) && typeof p.score === 'number';
}

/** What is wrong with this state, or undefined when the next reader can trust it. */
function stateProblem(s: GameState): string | undefined {
    if (!PHASES.includes(s.phase)) return `phase ${String(s.phase)}`;
    if (!CARD_COLORS.includes(s.activeColor)) return `activeColor ${String(s.activeColor)}`;
    if (!Number.isInteger(s.tick) || s.tick < 0) return `tick ${String(s.tick)}`;
    if (typeof s.currentPlayer !== 'string') return `currentPlayer ${String(s.currentPlayer)}`;
    if (!s.players.every(isSeat)) return 'a seat lost its shape';
    return undefined;
}

function resultProblem(result: ApplyResult | undefined): string | undefined {
    if (result === undefined) return 'apply returned nothing';
    if (!Array.isArray(result.events)) return 'events is not an array';
    for (const event of result.events) {
        if (typeof event.type !== 'string') return `event type ${String(event.type)}`;
        if (event.type === 'ActionRejected' && typeof event.reason !== 'string')
            return `reject reason ${String(event.reason)}`;
    }
    return stateProblem(result.state);
}

interface Scenario {
    readonly label: string;
    readonly state: GameState;
}

function scenarios(): readonly Scenario[] {
    const lobby = engine.createInitialState(CONFIG, DEFAULT_SEED);
    const seated = engine.apply(lobby, {
        type: 'START_GAME',
        players: players(FOUR_PLAYERS),
    }).state;
    const playing = newGame(FOUR_PLAYERS).state;
    const duel = rig(newGame(TWO_PLAYERS).state, {
        top: { color: 'red', kind: 'number', value: 1 },
        hands: {
            [P(0)]: [{ color: 'red', kind: 'number', value: 2 }],
            [P(1)]: [{ color: 'red', kind: 'number', value: 3 }],
        },
    });

    return [
        { label: 'lobby', state: lobby },
        { label: 'seated', state: seated },
        { label: 'playing', state: playing },
        { label: 'vulnerable', state: { ...duel, unoVulnerable: P(0) } },
        { label: 'choosing_color', state: { ...playing, phase: 'choosing_color' } },
        {
            label: 'challenge_window',
            state: {
                ...playing,
                phase: 'challenge_window',
                draw4Challenge: {
                    player: P(0),
                    target: P(1),
                    priorColor: 'red',
                    wasBluff: false,
                },
            },
        },
        {
            label: 'eliminated',
            state: {
                ...playing,
                players: playing.players.map((p) =>
                    p.id === P(1) ? { ...p, eliminated: true } : p,
                ),
            },
        },
        { label: 'game_over', state: { ...playing, phase: 'game_over' } },
    ];
}

/** Returns the outcome so the run can prove it built legal actions too, not only garbage. */
function probe(state: GameState, action: Action, where: string, problems: string[]): boolean {
    let result: ApplyResult | undefined;
    try {
        result = engine.apply(state, action);
    } catch (error) {
        problems.push(`${where}: threw ${String(error)}`);
        return false;
    }
    const problem = resultProblem(result);
    if (problem !== undefined) problems.push(`${where}: ${problem}`);
    return result?.events.some((e) => e.type !== 'ActionRejected') === true;
}

describe('malformed action fuzz (CUI-0405)', () => {
    it('should never throw and never hand back a state the next reader cannot trust', () => {
        const problems: string[] = [];
        let applied = 0;
        let accepted = 0;

        scenarios().forEach((scenario, index) => {
            const s = stream(index);
            for (let c = 0; c < CASES_PER_SCENARIO; c++) {
                const action = generate(scenario.state, s);
                const where = `${scenario.label}#${c}`;
                applied += 1;
                if (probe(scenario.state, action, where, problems)) accepted += 1;

                // The same action after a persist/load cycle: keys whose value was
                // undefined are gone, NaN became null, symbols vanished.
                const persisted = roundTrip(action);
                if (persisted === undefined) continue;
                applied += 1;
                if (probe(scenario.state, persisted, `${where} json`, problems)) accepted += 1;
            }
        });

        expect(problems.slice(0, MAX_REPORTED_PROBLEMS)).toEqual([]);
        expect(applied).toBeGreaterThan(scenarios().length * CASES_PER_SCENARIO);
        // A run that rejected everything would prove nothing about the happy path.
        expect(accepted).toBeGreaterThan(0);
    });

    it('should not let a __proto__ key on an action reach Object.prototype', () => {
        const polluted = JSON.parse(
            '{"type":"CALL_UNO","player":"p0","__proto__":{"polluted":true}}',
        ) as Action;
        const state = newGame(TWO_PLAYERS).state;

        expect(() => engine.apply(state, polluted)).not.toThrow();
        expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });
});
