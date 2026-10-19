/**
 * botDriver.spec.ts — covers `scheduleDriver` (the effect body) and
 * `scheduleUnoWindow`, the parts of the driver that are plain functions rather
 * than a React effect. `useBotDriver` itself still has no harness (the app specs
 * run in the node environment), so this file drives the scheduler directly with
 * a stub dispatch and fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, GameEvent } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import { UNO_WINDOW_MS, dealtState, humanVulnerable } from '../test/fixtures';
import { scheduleDriver, scheduleUnoWindow } from './botDriver';
import { UNO_WINDOW_DISABLED } from './unoWindow';

const ACCEPTED: readonly GameEvent[] = [];
const PAUSED = true;
const RUNNING = false;

function reject(action: Action): readonly GameEvent[] {
    return [{ type: 'ActionRejected', action, reason: 'not_your_turn' }];
}

/** Records what the driver dispatched and answers with `events`. */
function stubDispatch(events: (action: Action) => readonly GameEvent[]) {
    const seen: Action[] = [];
    return {
        seen,
        dispatch: (action: Action): readonly GameEvent[] => {
            seen.push(action);
            return events(action);
        },
    };
}

describe('scheduleUnoWindow', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.useFakeTimers();
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        errorSpy.mockRestore();
    });

    it('should auto-call UNO immediately when the window is disabled', () => {
        const { seen, dispatch } = stubDispatch(() => ACCEPTED);

        const cleanup = scheduleUnoWindow(humanVulnerable(UNO_WINDOW_DISABLED), dispatch);

        expect(seen).toEqual([{ type: 'CALL_UNO', player: HUMAN_ID }]);
        expect(cleanup).toBeUndefined();
    });

    it('should not dispatch until a configured window has elapsed', () => {
        const { seen, dispatch } = stubDispatch(() => ACCEPTED);

        scheduleUnoWindow(humanVulnerable(UNO_WINDOW_MS), dispatch);

        expect(seen).toEqual([]);
        vi.advanceTimersByTime(UNO_WINDOW_MS);
        expect(seen).toHaveLength(1);
    });

    it('should cancel the pending window when the cleanup runs', () => {
        const { seen, dispatch } = stubDispatch(() => ACCEPTED);

        scheduleUnoWindow(humanVulnerable(UNO_WINDOW_MS), dispatch)?.();
        vi.advanceTimersByTime(UNO_WINDOW_MS);

        expect(seen).toEqual([]);
    });

    it('should not log anything when the engine accepts the auto-call', () => {
        const { dispatch } = stubDispatch(() => ACCEPTED);

        scheduleUnoWindow(humanVulnerable(UNO_WINDOW_DISABLED), dispatch);

        expect(errorSpy).not.toHaveBeenCalled();
    });

    it('should report a refused auto-call when the window is disabled', () => {
        // S-027: a rejected action returns the same state reference, so the effect
        // never re-runs and `unoVulnerable` sticks forever. Without this the stall
        // is completely silent.
        const { dispatch } = stubDispatch(reject);

        scheduleUnoWindow(humanVulnerable(UNO_WINDOW_DISABLED), dispatch);

        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('should report a refused outcome when a configured window expires', () => {
        const { dispatch } = stubDispatch(reject);

        scheduleUnoWindow(humanVulnerable(UNO_WINDOW_MS), dispatch);
        vi.advanceTimersByTime(UNO_WINDOW_MS);

        expect(errorSpy).toHaveBeenCalledTimes(1);
    });
});

describe('scheduleDriver', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('should let the leading bot act once its think time has passed', () => {
        const { seen, dispatch } = stubDispatch(() => ACCEPTED);

        scheduleDriver(dealtState(), RUNNING, dispatch);
        vi.runAllTimers();

        expect(seen).toHaveLength(1);
    });

    it('should schedule nothing for a bot while the game is paused', () => {
        // W-081: the menu sheet says "Paused", so no bot timer may be pending behind it.
        const { seen, dispatch } = stubDispatch(() => ACCEPTED);

        const cleanup = scheduleDriver(dealtState(), PAUSED, dispatch);
        vi.runAllTimers();

        expect(seen).toEqual([]);
        expect(cleanup).toBeUndefined();
    });

    it('should schedule nothing for the UNO window while the game is paused', () => {
        const { seen, dispatch } = stubDispatch(() => ACCEPTED);

        scheduleDriver(humanVulnerable(UNO_WINDOW_MS), PAUSED, dispatch);
        vi.runAllTimers();

        expect(seen).toEqual([]);
    });

    it('should act from the unchanged state once unpaused', () => {
        const { seen, dispatch } = stubDispatch(() => ACCEPTED);
        const state = dealtState();

        scheduleDriver(state, PAUSED, dispatch);
        vi.runAllTimers();
        scheduleDriver(state, RUNNING, dispatch);
        vi.runAllTimers();

        expect(seen).toHaveLength(1);
    });

    it('should cancel the pending bot action when the cleanup runs', () => {
        const { seen, dispatch } = stubDispatch(() => ACCEPTED);

        scheduleDriver(dealtState(), RUNNING, dispatch)?.();
        vi.runAllTimers();

        expect(seen).toEqual([]);
    });
});
