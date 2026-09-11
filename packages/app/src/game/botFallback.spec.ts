import { describe, expect, it } from 'vitest';
import { engine } from '@uno/engine';
import type { Action, GameEvent, GameState, PlayerId } from '@uno/engine';

import { BOT_IDS, dealtState, handOf } from '../test/fixtures';
import { dispatchWithFallback, fallbackActionFor, wasRejected } from './botFallback';

const [BOT_A, BOT_B] = BOT_IDS;

function botTurn(state: GameState, bot: PlayerId): GameState {
    return { ...state, phase: 'playing', currentPlayer: bot, drawnCard: undefined };
}

const REJECTED: GameEvent = {
    type: 'ActionRejected',
    action: { type: 'PASS', player: BOT_A },
    reason: 'wrong_phase',
};
const ACCEPTED: GameEvent = { type: 'TurnChanged', player: BOT_B };

describe('wasRejected', () => {
    it('should be true when the events contain an ActionRejected', () => {
        expect(wasRejected([ACCEPTED, REJECTED])).toBe(true);
    });

    it('should be false when no event is an ActionRejected', () => {
        expect(wasRejected([ACCEPTED])).toBe(false);
        expect(wasRejected([])).toBe(false);
    });
});

describe('fallbackActionFor', () => {
    it('should draw when it is the bot turn and nothing has been drawn yet', () => {
        const state = botTurn(dealtState(), BOT_A);

        expect(fallbackActionFor(state, BOT_A)).toEqual({ type: 'DRAW_CARD', player: BOT_A });
    });

    it('should pass when the bot has already drawn this turn', () => {
        const base = botTurn(dealtState(), BOT_A);
        const drawn = handOf(base, BOT_A)[0];
        if (!drawn) throw new Error('bot has no cards');
        const state: GameState = { ...base, drawnCard: drawn };

        expect(fallbackActionFor(state, BOT_A)).toEqual({ type: 'PASS', player: BOT_A });
    });

    it('should choose a colour when the bot is stuck in choosing_color', () => {
        const state: GameState = { ...botTurn(dealtState(), BOT_A), phase: 'choosing_color' };

        const action = fallbackActionFor(state, BOT_A);

        expect(action?.type).toBe('CHOOSE_COLOR');
        // The chosen colour must be accepted by the engine, otherwise the fallback is useless.
        if (!action) throw new Error('no fallback');
        expect(wasRejected(engine.apply(state, action).events)).toBe(false);
    });

    it('should accept the draw four when the bot is the challenge target', () => {
        const base = dealtState();
        const state: GameState = {
            ...base,
            phase: 'challenge_window',
            currentPlayer: BOT_B,
            draw4Challenge: { player: BOT_B, target: BOT_A, priorColor: 'red', wasBluff: false },
        };

        expect(fallbackActionFor(state, BOT_A)).toEqual({ type: 'ACCEPT_DRAW4', player: BOT_A });
    });

    it('should return undefined when the bot has nothing to do', () => {
        const state = botTurn(dealtState(), BOT_A);

        expect(fallbackActionFor(state, BOT_B)).toBeUndefined();
        expect(fallbackActionFor({ ...state, phase: 'round_over' }, BOT_A)).toBeUndefined();
    });

    it('should produce an action the engine accepts from a real dealt position', () => {
        const state = botTurn(dealtState(), BOT_A);
        const action = fallbackActionFor(state, BOT_A);
        if (!action) throw new Error('no fallback');

        expect(wasRejected(engine.apply(state, action).events)).toBe(false);
    });
});

describe('dispatchWithFallback', () => {
    const state = botTurn(dealtState(), BOT_A);
    const decided: Action = { type: 'PASS', player: BOT_A }; // illegal: nothing drawn yet

    function recordingDispatch(): {
        dispatch: (a: Action) => readonly GameEvent[];
        seen: Action[];
    } {
        const seen: Action[] = [];
        return {
            seen,
            dispatch(action) {
                seen.push(action);
                return engine.apply(state, action).events;
            },
        };
    }

    it('should dispatch only the decided action when the engine accepts it', () => {
        const { dispatch, seen } = recordingDispatch();
        const accepted: Action = { type: 'DRAW_CARD', player: BOT_A };

        const result = dispatchWithFallback(state, BOT_A, accepted, dispatch);

        expect(seen).toEqual([accepted]);
        expect(result).toEqual({ resolved: true, rejected: [] });
    });

    it('should dispatch the fallback when the decided action is rejected', () => {
        const { dispatch, seen } = recordingDispatch();

        const result = dispatchWithFallback(state, BOT_A, decided, dispatch);

        expect(seen).toEqual([decided, { type: 'DRAW_CARD', player: BOT_A }]);
        expect(result).toEqual({ resolved: true, rejected: [decided] });
    });

    it('should report unresolved when the fallback is rejected too', () => {
        const seen: Action[] = [];
        const alwaysReject = (action: Action): readonly GameEvent[] => {
            seen.push(action);
            return [{ type: 'ActionRejected', action, reason: 'wrong_phase' }];
        };

        const result = dispatchWithFallback(state, BOT_A, decided, alwaysReject);

        expect(seen).toHaveLength(2);
        expect(result.resolved).toBe(false);
        expect(result.rejected).toEqual(seen);
    });

    it('should report unresolved without a second dispatch when no fallback exists', () => {
        const seen: Action[] = [];
        const alwaysReject = (action: Action): readonly GameEvent[] => {
            seen.push(action);
            return [{ type: 'ActionRejected', action, reason: 'wrong_phase' }];
        };
        const idle: GameState = { ...state, phase: 'round_over' };

        const result = dispatchWithFallback(idle, BOT_A, decided, alwaysReject);

        expect(seen).toEqual([decided]);
        expect(result).toEqual({ resolved: false, rejected: [decided] });
    });
});
