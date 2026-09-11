/**
 * RulePlugin.needsColorChoice and RulePlugin.cardTraits. Traits ride on
 * LegalMove so bots (PublicView + LegalMove only) never touch the plugin.
 */
import { describe, expect, it } from 'vitest';
import { classicRules, createBot, createEngine, createRng, engine } from '../src';
import type { CardId, CardTraits, LegalMove, RulePlugin } from '../src';
import { firstCard, hand, newGame, P, rig } from './helpers';

const THREE_PLAYERS = 3;
const ATTACK: CardTraits = { attack: true };
const NO_ATTACK: CardTraits = { attack: false };

function engineWith(overrides: Partial<RulePlugin>) {
    return createEngine({ classic: { ...classicRules, ...overrides } });
}

describe('RulePlugin.needsColorChoice', () => {
    const base = newGame(THREE_PLAYERS).state;
    const wildInHand = () =>
        rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'wild', kind: 'wild' }, { color: 'red', kind: 'number', value: 2 }] },
        });

    it('Classic: a Wild requires a colour', () => {
        const s = wildInHand();
        const wild = firstCard(s, P(0));
        expect(engine.getLegalMoves(s, P(0)).find((m) => m.card === wild)?.requiresColor).toBe(true);
    });

    it('a plugin may declare that Wilds need no colour; the play then completes in one action', () => {
        // All Wild style: colour never matters, so a Wild is just a card.
        const eng = engineWith({
            needsColorChoice: () => false,
            onCardPlayed: (state) => ({ state, events: [] }),
        });
        const s = wildInHand();
        const wild = firstCard(s, P(0));
        expect(eng.getLegalMoves(s, P(0)).find((m) => m.card === wild)?.requiresColor).toBe(false);
        const r = eng.apply(s, { type: 'PLAY_CARD', player: P(0), card: wild });
        expect(r.state.phase).toBe('playing');
        expect(r.state.currentPlayer).toBe(P(1));
    });
});

describe('RulePlugin.cardTraits', () => {
    const base = newGame(THREE_PLAYERS).state;
    const numberAndSkip = () =>
        rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: { [P(0)]: [{ color: 'red', kind: 'number', value: 2 }, { color: 'red', kind: 'skip' }] },
        });

    it('Classic marks Skip, Reverse, Draw Two and Wild Draw Four as attacks', () => {
        const traits = (kind: string) => classicRules.cardTraits?.(kind);
        expect(['skip', 'reverse', 'draw2', 'wild_draw4'].map(traits)).toEqual([ATTACK, ATTACK, ATTACK, ATTACK]);
        expect(['number', 'wild'].map(traits)).toEqual([NO_ATTACK, NO_ATTACK]);
    });

    it('getLegalMoves carries the plugin traits on every move', () => {
        const s = numberAndSkip();
        expect(engine.getLegalMoves(s, P(0)).map((m) => m.traits)).toEqual([NO_ATTACK, ATTACK]);
    });

    it('falls back to no traits when the plugin declares none', () => {
        const { cardTraits: _omitted, ...withoutTraits } = classicRules;
        const eng = createEngine({ classic: withoutTraits });
        const s = numberAndSkip();
        expect(eng.getLegalMoves(s, P(0)).map((m) => m.traits)).toEqual([NO_ATTACK, NO_ATTACK]);
    });
});

describe('bots read attack traits from LegalMove', () => {
    it('a medium bot prefers the move flagged as an attack when the next opponent is on two cards', () => {
        const base = newGame(THREE_PLAYERS).state;
        // Three cards in hand so the UNO-call branch stays out of the way; blue 9 is not legal on red.
        const s = rig(base, {
            top: { color: 'red', kind: 'number', value: 1 },
            hands: {
                [P(0)]: [{ color: 'red', kind: 'number', value: 2 }, { color: 'red', kind: 'skip' }, { color: 'blue', kind: 'number', value: 9 }],
                [P(1)]: [{ color: 'blue', kind: 'number', value: 3 }, { color: 'blue', kind: 'number', value: 4 }],
            },
        });
        const view = engine.getPublicView(s, P(0));
        const [number, skip] = hand(s, P(0)) as [CardId, CardId, CardId];
        const bot = createBot('medium');
        const flagged = (attackCard: CardId): LegalMove[] =>
            [number, skip].map((card) => ({ card, requiresColor: false, traits: { attack: card === attackCard } }));

        expect(bot.decide(view, flagged(number), createRng(1)).action).toMatchObject({ type: 'PLAY_CARD', card: number });
        expect(bot.decide(view, flagged(skip), createRng(1)).action).toMatchObject({ type: 'PLAY_CARD', card: skip });
    });
});
