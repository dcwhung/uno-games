import { describe, expect, it } from 'vitest';
import { engine } from '@uno/engine';
import type { Action, BotDifficulty, GameState, PlayerConfig } from '@uno/engine';

import { DEFAULT_BOT_DIFFICULTY } from '../persistence/settings';
import { HUMAN_ID } from '../store/gameStore';
import {
    BOT_IDS,
    DEFAULT_OPPONENT_COUNT,
    SEED,
    UNO_WINDOW_MS,
    humanVulnerable,
    playersFor,
} from '../test/fixtures';
import {
    MAX_UNO_WINDOW_MS,
    UNO_WINDOW_DISABLED,
    isUnoWindowDisabled,
    unoWindowAction,
} from './unoWindow';

const ALT_SEED = 43;
const [BOT_A, BOT_B] = BOT_IDS;
/** Enough distinct ticks to make a "no bot ever catches" spec effectively impossible by chance. */
const TICK_SAMPLE = 40;

/** The same seats with `difficulty` dropped, so the module's own default applies. */
function withoutDifficulty(state: GameState): GameState {
    return {
        ...state,
        playerConfigs: state.playerConfigs.map((p): PlayerConfig => ({
            id: p.id,
            name: p.name,
            kind: p.kind,
        })),
    };
}

// S-025: `persistence/settings.ts` only admits integers >= 0, but a RuleConfig
// can also be built by a spec, and later by a URL param or a multiplayer lobby.
// Anything that is not a finite positive duration must count as "disabled":
// setTimeout coerces -1 / NaN / Infinity to 0 and fires immediately, which is
// exactly the instant-catch bug W-008 fixed.
const NEGATIVE_WINDOW_MS = -1;
/** Above setTimeout's 32-bit range, where it wraps to "fire immediately". */
const OVERFLOW_WINDOW_MS = 2 ** 31;
/**
 * `baseConfig()` substitutes its own default for `undefined`, so the "field never
 * set" case has to be written onto the config directly. Typed `number` in
 * RuleConfig, but a legacy or hand-built config can still arrive without it.
 */
function withMissingWindow(state: GameState): GameState {
    const config = { ...state.config } as Record<string, unknown>;
    delete config.unoCallWindowMs;
    return { ...state, config: config as unknown as GameState['config'] };
}

describe('isUnoWindowDisabled', () => {
    it('should be true when unoCallWindowMs is the disabled sentinel', () => {
        expect(isUnoWindowDisabled(humanVulnerable(UNO_WINDOW_DISABLED))).toBe(true);
    });

    it('should be false when a positive window is configured', () => {
        expect(isUnoWindowDisabled(humanVulnerable(UNO_WINDOW_MS))).toBe(false);
    });

    it('should be true when the window is negative', () => {
        expect(isUnoWindowDisabled(humanVulnerable(NEGATIVE_WINDOW_MS))).toBe(true);
    });

    it('should be true when the window is NaN', () => {
        expect(isUnoWindowDisabled(humanVulnerable(NaN))).toBe(true);
    });

    it('should be true when the window is Infinity', () => {
        expect(isUnoWindowDisabled(humanVulnerable(Infinity))).toBe(true);
    });

    it('should be true when the window overflows the setTimeout range', () => {
        expect(isUnoWindowDisabled(humanVulnerable(OVERFLOW_WINDOW_MS))).toBe(true);
    });

    it('should be true when the window is missing entirely', () => {
        expect(isUnoWindowDisabled(withMissingWindow(humanVulnerable(UNO_WINDOW_MS)))).toBe(true);
    });

    it('should be false for the largest window setTimeout can honour', () => {
        expect(isUnoWindowDisabled(humanVulnerable(MAX_UNO_WINDOW_MS))).toBe(false);
    });
});

describe('unoWindowAction with a malformed window', () => {
    it.each([
        ['negative', NEGATIVE_WINDOW_MS],
        ['NaN', NaN],
        ['overflowing', OVERFLOW_WINDOW_MS],
    ])('should auto-call UNO rather than roll a catch for a %s window', (_label, ms) => {
        // The driver would have handed these to setTimeout, which fires at once
        // and lets a bot catch a human who never got a window (W-008).
        expect(unoWindowAction(humanVulnerable(ms))).toEqual({
            type: 'CALL_UNO',
            player: HUMAN_ID,
        });
    });
});

describe('unoWindowAction', () => {
    it('should auto-call UNO for the human when the window is disabled', () => {
        const state = humanVulnerable(UNO_WINDOW_DISABLED);

        expect(unoWindowAction(state)).toEqual({ type: 'CALL_UNO', player: HUMAN_ID });
    });

    it('should produce an auto-call the engine accepts', () => {
        const state = humanVulnerable(UNO_WINDOW_DISABLED);

        const { state: next, events } = engine.apply(state, unoWindowAction(state));

        expect(events.some((e) => e.type === 'ActionRejected')).toBe(false);
        expect(next.unoVulnerable).toBeUndefined();
    });

    it('should never auto-call when a positive window is configured', () => {
        for (let tick = 0; tick < TICK_SAMPLE; tick++) {
            const state: GameState = { ...humanVulnerable(UNO_WINDOW_MS), tick };

            expect(unoWindowAction(state).type).not.toBe('CALL_UNO');
        }
    });

    it('should resolve the expired window as CATCH_UNO by a bot or TIMEOUT', () => {
        const state = humanVulnerable(UNO_WINDOW_MS);

        const action = unoWindowAction(state);

        if (action.type === 'CATCH_UNO') {
            expect(action.target).toBe(HUMAN_ID);
            expect([BOT_A, BOT_B]).toContain(action.player);
        } else {
            expect(action).toEqual({ type: 'TIMEOUT', player: HUMAN_ID });
        }
    });

    it('should be deterministic for the same seed and tick', () => {
        const state = humanVulnerable(UNO_WINDOW_MS);

        expect(unoWindowAction(state)).toEqual(unoWindowAction({ ...state }));
    });

    it('should treat a bot with no configured difficulty as the shared default', () => {
        // S-024: the `?? DEFAULT_BOT_DIFFICULTY` fallback is replay-affecting, so it
        // must resolve to the same value the lobby hands out when nothing is set.
        const configured = humanVulnerable(
            UNO_WINDOW_MS,
            SEED,
            playersFor(DEFAULT_OPPONENT_COUNT, DEFAULT_BOT_DIFFICULTY),
        );

        expect(unoWindowAction(withoutDifficulty(configured))).toEqual(unoWindowAction(configured));
    });

    it('should let bots catch the human on at least one sampled tick', () => {
        // Guards against a regression where the catch roll silently always misses.
        const caught = [SEED, ALT_SEED].some((seed) =>
            Array.from({ length: TICK_SAMPLE }, (_, tick) => ({
                ...humanVulnerable(UNO_WINDOW_MS, seed),
                tick,
            })).some((state) => unoWindowAction(state).type === 'CATCH_UNO'),
        );

        expect(caught).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// W-020: golden values. The determinism spec above only proves "same input,
// same output"; these lock the *actual* output of the catch roll so a replay
// recorded today still resolves identically after a refactor.
//
// If you change RNG_SALT_UNO, the rngForTick seeding, the bot iteration
// order, or a difficulty's unoForgetChance, this spec WILL break — that is
// its job. Re-record the table only when a replay-breaking change is
// intended, and say so in the commit message.
// ---------------------------------------------------------------------------

interface GoldenCase {
    readonly seed: number;
    readonly tick: number;
    readonly difficulty: BotDifficulty;
    readonly expected: Action;
}

const CATCH_BY_A: Action = { type: 'CATCH_UNO', player: BOT_A, target: HUMAN_ID };
const CATCH_BY_B: Action = { type: 'CATCH_UNO', player: BOT_B, target: HUMAN_ID };
const TIMEOUT: Action = { type: 'TIMEOUT', player: HUMAN_ID };

// Recorded 2026-09-11 against unoWindow.ts @ RNG_SALT_UNO = 7919.
const GOLDEN: readonly GoldenCase[] = [
    // Same seed + tick, different difficulty: easy bots miss, medium bots catch.
    { seed: SEED, tick: 1, difficulty: 'easy', expected: TIMEOUT },
    { seed: SEED, tick: 1, difficulty: 'medium', expected: CATCH_BY_A },
    // First bot misses, second bot catches — pins the iteration order.
    { seed: SEED, tick: 2, difficulty: 'medium', expected: CATCH_BY_B },
    { seed: ALT_SEED, tick: 2, difficulty: 'hard', expected: CATCH_BY_B },
    // Every bot misses on this roll.
    { seed: ALT_SEED, tick: 2, difficulty: 'medium', expected: TIMEOUT },
];

function humanVulnerableAt(seed: number, tick: number, difficulty: BotDifficulty): GameState {
    return {
        ...humanVulnerable(UNO_WINDOW_MS, seed, playersFor(DEFAULT_OPPONENT_COUNT, difficulty)),
        tick,
    };
}

describe('unoWindowAction golden values', () => {
    it.each(GOLDEN)(
        'should resolve seed $seed / tick $tick / $difficulty as $expected.type',
        ({ seed, tick, difficulty, expected }) => {
            expect(unoWindowAction(humanVulnerableAt(seed, tick, difficulty))).toEqual(expected);
        },
    );
});
