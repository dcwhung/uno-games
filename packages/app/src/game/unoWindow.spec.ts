import { describe, expect, it } from 'vitest';
import { engine } from '@uno/engine';
import type { Action, BotDifficulty, GameState, PlayerConfig } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import {
    BOT_IDS,
    DEFAULT_OPPONENT_COUNT,
    DEFAULT_PLAYERS,
    SEED,
    UNO_WINDOW_MS,
    baseConfig,
    dealtState,
    playersFor,
} from '../test/fixtures';
import { UNO_WINDOW_DISABLED, isUnoWindowDisabled, unoWindowAction } from './unoWindow';

const ALT_SEED = 43;
const [BOT_A, BOT_B] = BOT_IDS;
/** Enough distinct ticks to make a "no bot ever catches" spec effectively impossible by chance. */
const TICK_SAMPLE = 40;

/**
 * Round 1 dealt, then the human is down to one card and marked as having
 * missed the UNO call — the only position where the engine sets unoVulnerable.
 */
function humanVulnerable(
    unoCallWindowMs: number,
    seed = SEED,
    players: readonly PlayerConfig[] = DEFAULT_PLAYERS,
): GameState {
    const s = dealtState({ players, seed, config: baseConfig(unoCallWindowMs) });
    const human = s.players.find((p) => p.id === HUMAN_ID);
    if (!human) throw new Error('human not dealt');
    const [last, ...rest] = human.hand;
    if (!last) throw new Error('human hand empty');
    return {
        ...s,
        players: s.players.map((p) =>
            p.id === HUMAN_ID ? { ...p, hand: [last], calledUno: false } : p,
        ),
        drawPile: [...rest, ...s.drawPile],
        unoVulnerable: HUMAN_ID,
    };
}

describe('isUnoWindowDisabled', () => {
    it('should be true when unoCallWindowMs is the disabled sentinel', () => {
        expect(isUnoWindowDisabled(humanVulnerable(UNO_WINDOW_DISABLED))).toBe(true);
    });

    it('should be false when a positive window is configured', () => {
        expect(isUnoWindowDisabled(humanVulnerable(UNO_WINDOW_MS))).toBe(false);
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
