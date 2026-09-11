/**
 * CUI-0101 — the reducer is pure, so a malformed action must come back as an
 * ActionRejected event, never as a thrown Error. A corrupted replay log or a
 * remote client can name a seat that does not exist at the table; `getPlayer`
 * throws on an unknown id, so every handler that looks a player up has to be
 * guarded. `apply` validates the actor once, up front, for all of them.
 */
import { describe, expect, it } from 'vitest';
import { engine } from '../src';
import type { Action, GameState, PlayerId } from '../src';
import { firstCard, newGame, P, rig } from './helpers';

const GHOST = 'ghost' as PlayerId;
const TWO_PLAYERS = 2;

/** Every action shape that carries a `player`, aimed at a seat that does not exist. */
function ghostActions(state: GameState): Action[] {
    return [
        { type: 'PLAY_CARD', player: GHOST, card: firstCard(state, P(0)) },
        { type: 'DRAW_CARD', player: GHOST },
        { type: 'PASS', player: GHOST },
        { type: 'CHOOSE_COLOR', player: GHOST, color: 'blue' },
        { type: 'CALL_UNO', player: GHOST },
        { type: 'CATCH_UNO', player: GHOST, target: P(0) },
        { type: 'CHALLENGE_DRAW4', player: GHOST },
        { type: 'ACCEPT_DRAW4', player: GHOST },
        { type: 'TIMEOUT', player: GHOST },
        { type: 'VARIANT', player: GHOST, payload: null },
    ];
}

describe('actor validation', () => {
    const base = newGame(TWO_PLAYERS).state;
    const table = () =>
        rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'red', kind: 'number', value: 2 }],
                [P(1)]: [{ color: 'red', kind: 'number', value: 3 }],
            },
        });

    it('should reject CALL_UNO from an unknown player instead of throwing', () => {
        const s = table();
        const r = engine.apply(s, { type: 'CALL_UNO', player: GHOST });
        expect(r.events).toEqual([
            {
                type: 'ActionRejected',
                action: { type: 'CALL_UNO', player: GHOST },
                reason: 'unknown_player',
            },
        ]);
        expect(r.state).toBe(s);
    });

    it('should reject CATCH_UNO from an unknown player instead of throwing', () => {
        const s = { ...table(), unoVulnerable: P(0) };
        const r = engine.apply(s, { type: 'CATCH_UNO', player: GHOST, target: P(0) });
        expect(r.events[0]).toMatchObject({ type: 'ActionRejected', reason: 'unknown_player' });
        expect(r.state).toBe(s);
    });

    it('should reject CATCH_UNO naming an unknown target instead of throwing', () => {
        const s = { ...table(), unoVulnerable: P(0) };
        const r = engine.apply(s, { type: 'CATCH_UNO', player: P(1), target: GHOST });
        expect(r.events[0]).toMatchObject({ type: 'ActionRejected', reason: 'no_uno_to_catch' });
        expect(r.state).toBe(s);
    });

    it('should reject every player-bearing action from an unknown player', () => {
        const s = table();
        for (const action of ghostActions(s)) {
            const r = engine.apply(s, action);
            expect(r.events[0], action.type).toMatchObject({
                type: 'ActionRejected',
                reason: 'unknown_player',
            });
            expect(r.state, action.type).toBe(s);
        }
    });

    it('should still reject a known player by the rule that actually applies', () => {
        // Regression guard: the entry check must not shadow the handlers' own reasons.
        const s = table();
        expect(
            engine.apply(s, { type: 'PLAY_CARD', player: P(1), card: firstCard(s, P(1)) })
                .events[0],
        ).toMatchObject({ reason: 'not_your_turn' });
        expect(engine.apply(s, { type: 'CALL_UNO', player: P(0) }).events[0]).toMatchObject({
            type: 'UnoCalled',
        });
        expect(engine.apply(s, { type: 'PASS', player: P(0) }).events[0]).toMatchObject({
            reason: 'wrong_phase',
        });
    });

    it('should leave table-level actions with no actor untouched', () => {
        // START_GAME / START_ROUND carry no `player`; validation must skip them.
        const lobby = engine.createInitialState(base.config, base.seed);
        expect(engine.apply(lobby, { type: 'START_ROUND' }).events[0]).toMatchObject({
            type: 'ActionRejected',
            reason: 'wrong_phase',
        });
        expect(newGame(TWO_PLAYERS).state.phase).toBe('playing');
    });
});
