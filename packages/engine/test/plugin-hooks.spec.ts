/**
 * Reducer ↔ RulePlugin contract specs. Each describe wraps `classicRules`
 * in a test plugin that overrides one optional hook and proves the reducer
 * honours it — and that Classic (no hook) behaves exactly as before.
 */
import { describe, expect, it } from 'vitest';
import { classicRules, createEngine, engine } from '../src';
import type { ApplyResult, GameState, PlayerId, RulePlugin } from '../src';
import { firstCard, hand, newGame, P, rig, types } from './helpers';

type RigOptions = Parameters<typeof rig>[1];

const TWO_CARD_HANDS: RigOptions = {
    top: { color: 'red', kind: 'number', value: 1 },
    hands: {
        [P(0)]: [{ color: 'red', kind: 'number', value: 2 }, { color: 'blue', kind: 'number', value: 3 }],
        [P(1)]: [{ color: 'red', kind: 'number', value: 4 }, { color: 'green', kind: 'number', value: 4 }],
        [P(2)]: [{ color: 'red', kind: 'number', value: 5 }, { color: 'green', kind: 'number', value: 6 }],
    },
};

function engineWith(overrides: Partial<RulePlugin>) {
    return createEngine({ classic: { ...classicRules, ...overrides } });
}

function playFirst(eng: ReturnType<typeof createEngine>, s: GameState, player: PlayerId): ApplyResult {
    return eng.apply(s, { type: 'PLAY_CARD', player, card: firstCard(s, player) });
}

describe('RulePlugin.isRoundOver', () => {
    const base = newGame(3).state;

    it('ends the round with the winner the hook returns, even though nobody is out of cards', () => {
        // Teams-like rule: the round is over as soon as P0 is down to one card, and P1 is the winner.
        const eng = engineWith({
            isRoundOver: (state) => (hand(state, P(0)).length <= 1 ? P(1) : undefined),
        });
        const s = rig(base, TWO_CARD_HANDS);
        const r = playFirst(eng, s, P(0));
        expect(types(r)).toEqual(['CardPlayed', 'RoundEnded']);
        expect(r.state.phase).toBe('round_over');
        expect(r.state.roundWinner).toBe(P(1));
    });

    it('falls back to the empty-hand rule when the hook returns undefined', () => {
        const eng = engineWith({ isRoundOver: () => undefined });
        const s = rig(base, { ...TWO_CARD_HANDS, hands: { [P(0)]: [{ color: 'red', kind: 'number', value: 2 }] } });
        const r = playFirst(eng, s, P(0));
        expect(types(r)).toEqual(['CardPlayed', 'RoundEnded']);
        expect(r.state.roundWinner).toBe(P(0));
    });

    it('without the hook, Classic still ends the round only on an empty hand', () => {
        const s = rig(base, TWO_CARD_HANDS);
        const r = engine.apply(s, { type: 'PLAY_CARD', player: P(0), card: firstCard(s, P(0)) });
        expect(types(r)).toEqual(['CardPlayed', 'TurnChanged']);
        expect(r.state.phase).toBe('playing');
    });
});
