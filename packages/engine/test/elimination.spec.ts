/**
 * PlayerState.eliminated (No Mercy's mercy rule). An eliminated player is
 * skipped by the turn order, contributes nothing to round scoring, is reset
 * when the next round starts, and is visible as such in PublicView.
 */
import { describe, expect, it } from 'vitest';
import { core, engine } from '../src';
import type { GameState, PlayerId } from '../src';
import { firstCard, hand, newGame, P, play, rig, types } from './helpers';

const THREE_PLAYERS = 3;
const RED_FOUR_POINTS = 4;

function eliminate(state: GameState, player: PlayerId): GameState {
    return core.updatePlayer(state, player, { eliminated: true });
}

describe('eliminated players', () => {
    const base = newGame(THREE_PLAYERS).state;
    const table = () =>
        rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'red', kind: 'number', value: 2 }, { color: 'red', kind: 'skip' }],
                [P(1)]: [{ color: 'red', kind: 'number', value: 3 }, { color: 'blue', kind: 'number', value: 7 }],
                [P(2)]: [{ color: 'red', kind: 'number', value: 4 }, { color: 'red', kind: 'number', value: 5 }],
            },
        });

    it('are skipped by the turn order in both directions', () => {
        const s = eliminate(table(), P(1));
        const forward = play(s, P(0), firstCard(s, P(0)));
        expect(forward.state.currentPlayer).toBe(P(2));
        const reversed: GameState = { ...s, direction: -1, currentPlayer: P(2) };
        const backward = play(reversed, P(2), firstCard(reversed, P(2)));
        expect(backward.state.currentPlayer).toBe(P(0));
    });

    it('are not the target of a Skip; the next active player is', () => {
        const s = eliminate(table(), P(1));
        const skip = hand(s, P(0))[1]!;
        const r = play(s, P(0), skip);
        expect(types(r)).toEqual(['CardPlayed', 'TurnSkipped', 'TurnChanged']);
        expect(r.events).toContainEqual({ type: 'TurnSkipped', player: P(2) });
        expect(r.state.currentPlayer).toBe(P(0));
    });

    it('when nobody else is active the turn stays with the same player', () => {
        const s = eliminate(eliminate(table(), P(1)), P(2));
        expect(core.nextPlayerId(s, P(0))).toBe(P(0));
    });

    it('contribute no points to the round winner and are reset next round', () => {
        const s = eliminate(
            rig(base, {
                top: { color: 'red', kind: 'number', value: 1 },
                hands: {
                    [P(0)]: [{ color: 'red', kind: 'number', value: 2 }],
                    [P(1)]: [{ color: 'wild', kind: 'wild' }, { color: 'wild', kind: 'wild_draw4' }],
                    [P(2)]: [{ color: 'red', kind: 'number', value: RED_FOUR_POINTS }],
                },
            }),
            P(1),
        );
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(types(r)).toEqual(['CardPlayed', 'RoundEnded']);
        expect(r.events[1]).toMatchObject({ winner: P(0), points: RED_FOUR_POINTS });

        const next = engine.apply(r.state, { type: 'START_ROUND' }).state;
        expect(next.players.map((p) => p.eliminated)).toEqual([false, false, false]);
    });

    it('are visible in PublicView', () => {
        const s = eliminate(table(), P(1));
        const view = engine.getPublicView(s, P(0));
        expect(view.players.map((p) => p.eliminated)).toEqual([false, true, false]);
    });
});
