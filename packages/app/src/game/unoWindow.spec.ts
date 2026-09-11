import { describe, expect, it } from 'vitest';
import { engine, OFFICIAL_HOUSE_RULES, TARGET_SCORE } from '@uno/engine';
import type { GameState, PlayerConfig, PlayerId, RuleConfig } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import { UNO_WINDOW_DISABLED, isUnoWindowDisabled, unoWindowAction } from './unoWindow';

const SEED = 42;
const ALT_SEED = 43;
const UNO_WINDOW_MS = 2000;
const BOT_A = 'bot0' as PlayerId;
const BOT_B = 'bot1' as PlayerId;
/** Enough distinct ticks to make a "no bot ever catches" spec effectively impossible by chance. */
const TICK_SAMPLE = 40;

const PLAYERS: PlayerConfig[] = [
    { id: HUMAN_ID, name: 'You', kind: 'human' },
    { id: BOT_A, name: 'Momo', kind: 'bot', difficulty: 'medium' },
    { id: BOT_B, name: 'Kiki', kind: 'bot', difficulty: 'medium' },
];

function config(unoCallWindowMs: number): RuleConfig {
    return { variant: 'classic', houseRules: OFFICIAL_HOUSE_RULES, targetScore: TARGET_SCORE, unoCallWindowMs };
}

/**
 * Round 1 dealt, then the human is down to one card and marked as having
 * missed the UNO call — the only position where the engine sets unoVulnerable.
 */
function humanVulnerable(unoCallWindowMs: number, seed = SEED): GameState {
    let s = engine.createInitialState(config(unoCallWindowMs), seed);
    s = engine.apply(s, { type: 'START_GAME', players: PLAYERS }).state;
    s = engine.apply(s, { type: 'START_ROUND' }).state;
    const human = s.players.find((p) => p.id === HUMAN_ID);
    if (!human) throw new Error('human not dealt');
    const [last, ...rest] = human.hand;
    if (!last) throw new Error('human hand empty');
    return {
        ...s,
        players: s.players.map((p) => (p.id === HUMAN_ID ? { ...p, hand: [last], calledUno: false } : p)),
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
            Array.from({ length: TICK_SAMPLE }, (_, tick) => ({ ...humanVulnerable(UNO_WINDOW_MS, seed), tick }))
                .some((state) => unoWindowAction(state).type === 'CATCH_UNO'),
        );

        expect(caught).toBe(true);
    });
});
