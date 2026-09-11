/**
 * botDriver.spec.ts — covers `scheduleUnoWindow`, the one part of the driver that
 * is a plain function rather than a React effect. `useBotDriver` itself still has
 * no harness (the app specs run in the node environment), so this file drives the
 * scheduler directly with a stub dispatch and fake timers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Action, GameEvent } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import { UNO_WINDOW_MS, humanVulnerable } from '../test/fixtures';
import { scheduleUnoWindow } from './botDriver';
import { UNO_WINDOW_DISABLED } from './unoWindow';

const ACCEPTED: readonly GameEvent[] = [];

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
