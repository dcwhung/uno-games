/**
 * PlayerState.eliminated (No Mercy's mercy rule). An eliminated player is
 * skipped by the turn order, contributes nothing to round scoring, is reset
 * when the next round starts, and is visible as such in PublicView.
 */
import { describe, expect, it } from 'vitest';
import { core, engine, PENALTY } from '../src';
import type { GameState, PlayerId } from '../src';
import { cardAt, firstCard, hand, newGame, P, play, rig, types } from './helpers';

/** The Skip in the rigged hand sits second. */
const SECOND_CARD = 1;

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
                [P(0)]: [
                    { color: 'red', kind: 'number', value: 2 },
                    { color: 'red', kind: 'skip' },
                ],
                [P(1)]: [
                    { color: 'red', kind: 'number', value: 3 },
                    { color: 'blue', kind: 'number', value: 7 },
                ],
                [P(2)]: [
                    { color: 'red', kind: 'number', value: 4 },
                    { color: 'red', kind: 'number', value: 5 },
                ],
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
        const skip = cardAt(s, P(0), SECOND_CARD);
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
                    [P(1)]: [
                        { color: 'wild', kind: 'wild' },
                        { color: 'wild', kind: 'wild_draw4' },
                    ],
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

// ---------------------------------------------------------------------------
// CUI-0201 — the UNO actions are the only ones an eliminated player could
// still reach. PLAY_CARD / DRAW_CARD / PASS go through `requireTurn` and an
// eliminated player is never `currentPlayer`; CALL_UNO and CATCH_UNO only
// looked at phase, hand size and `unoVulnerable`, so someone already out of
// the round could call UNO or send a live player to draw two.
// ---------------------------------------------------------------------------

describe('eliminated players and the UNO window', () => {
    const base = newGame(THREE_PLAYERS).state;

    /** P0 to play, P1 holding a single uncalled card, P2 out of the round. */
    const table = () =>
        eliminate(
            rig(base, {
                top: { color: 'red', kind: 'number', value: 1 },
                hands: {
                    [P(0)]: [
                        { color: 'red', kind: 'number', value: 2 },
                        { color: 'red', kind: 'number', value: 6 },
                    ],
                    [P(1)]: [{ color: 'red', kind: 'number', value: 3 }],
                    [P(2)]: [{ color: 'red', kind: 'number', value: 4 }],
                },
            }),
            P(2),
        );

    it('should reject CALL_UNO from an eliminated player', () => {
        const s = table();
        const r = engine.apply(s, { type: 'CALL_UNO', player: P(2) });
        expect(r.events[0]).toMatchObject({ type: 'ActionRejected', reason: 'eliminated' });
        expect(r.state).toBe(s);
    });

    it('should reject CATCH_UNO from an eliminated player', () => {
        const s: GameState = { ...table(), unoVulnerable: P(1) };
        const r = engine.apply(s, { type: 'CATCH_UNO', player: P(2), target: P(1) });
        expect(r.events[0]).toMatchObject({ type: 'ActionRejected', reason: 'eliminated' });
        expect(r.state).toBe(s);
    });

    it('should reject CATCH_UNO aimed at an eliminated target', () => {
        // Their cards left the round with them, so a draw-two penalty is meaningless.
        const s: GameState = { ...table(), unoVulnerable: P(2) };
        const r = engine.apply(s, { type: 'CATCH_UNO', player: P(0), target: P(2) });
        expect(r.events[0]).toMatchObject({ type: 'ActionRejected', reason: 'no_uno_to_catch' });
        expect(r.state).toBe(s);
    });

    it('should never mark an eliminated player as vulnerable to a missed UNO call', () => {
        // Root cause of the case above: a plugin that eliminates someone inside
        // onCardPlayed must not leave them exposed in the window afterwards.
        const s = eliminate(table(), P(0));
        const r = play(s, P(0), firstCard(s, P(0)));
        expect(hand(r.state, P(0))).toHaveLength(1);
        expect(r.state.unoVulnerable).toBeUndefined();
    });

    it('should still let an eliminated player time their own UNO window out', () => {
        // Otherwise the flag sticks to a seat that can never clear it itself.
        const s: GameState = { ...table(), unoVulnerable: P(2) };
        const r = engine.apply(s, { type: 'TIMEOUT', player: P(2) });
        expect(r.events).toEqual([]);
        expect(r.state.unoVulnerable).toBeUndefined();
    });

    it('should leave the UNO actions of active players untouched', () => {
        const s: GameState = { ...table(), unoVulnerable: P(1) };
        expect(engine.apply(s, { type: 'CALL_UNO', player: P(1) }).events[0]).toMatchObject({
            type: 'UnoCalled',
        });
        const caught = engine.apply(s, { type: 'CATCH_UNO', player: P(0), target: P(1) });
        expect(types(caught)).toEqual(['UnoCaught', 'CardDrawn']);
        expect(hand(caught.state, P(1))).toHaveLength(1 + PENALTY.MISSED_UNO_CALL);
    });
});
