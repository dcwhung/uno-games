import { describe, expect, it } from 'vitest';
import { engine } from '../src';
import type { GameState } from '../src';
import { firstCard, newGame, P, play, rig } from './helpers';

// ---------------------------------------------------------------------------
// AU-006: `Draw4Challenge.wasBluff` is derived from the thrower's hidden hand.
// It must never reach a PublicView, otherwise a bot (or a remote client) could
// decide the challenge with information it is not entitled to.
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 3;

/** P(0) throws a Wild Draw Four at P(1); `bluff` controls whether P(0) also held a red card. */
function challengeWindow(bluff: boolean): GameState {
    const base = newGame(PLAYER_COUNT).state;
    const rigged = rig(base, {
        top: { color: 'red', kind: 'number', value: 1 },
        hands: {
            [P(0)]: [
                { color: 'wild', kind: 'wild_draw4' },
                { color: bluff ? 'red' : 'blue', kind: 'number', value: 7 },
            ],
            [P(1)]: [{ color: 'green', kind: 'number', value: 2 }],
            [P(2)]: [{ color: 'yellow', kind: 'number', value: 5 }],
        },
    });
    const state = play(rigged, P(0), firstCard(rigged, P(0)), 'blue').state;
    expect(state.phase).toBe('challenge_window');
    return state;
}

describe('getPublicView', () => {
    it.each([true, false])('strips wasBluff from draw4Challenge (bluff=%s)', (bluff) => {
        const state = challengeWindow(bluff);
        expect(state.draw4Challenge?.wasBluff).toBe(bluff);

        const view = engine.getPublicView(state, P(1));
        expect(view.draw4Challenge).toBeDefined();
        expect(view.draw4Challenge).not.toHaveProperty('wasBluff');
        expect(view.draw4Challenge).toEqual({ player: P(0), target: P(1), priorColor: 'red' });
    });

    it('strips wasBluff for every seat, not only the target', () => {
        const state = challengeWindow(true);
        for (const seat of [P(0), P(1), P(2)]) {
            expect(engine.getPublicView(state, seat).draw4Challenge).not.toHaveProperty('wasBluff');
        }
    });

    it('omits draw4Challenge entirely outside a challenge window', () => {
        const state = newGame(PLAYER_COUNT).state;
        expect(engine.getPublicView(state, P(0))).not.toHaveProperty('draw4Challenge');
    });
});
