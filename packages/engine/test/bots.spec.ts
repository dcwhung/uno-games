import { describe, expect, it } from 'vitest';
import { createBot, createRng, engine } from '../src';
import type { Action, BotDifficulty, GameState } from '../src';
import { CONFIG, P, players } from './helpers';

const MAX_STEPS = 5000;

/** Drive a whole game with bots of the given difficulty. Returns final state + steps. */
function simulate(
    difficulty: BotDifficulty,
    seed: number,
    n = 4,
): { state: GameState; steps: number; actions: Action[] } {
    const bots = Object.fromEntries(
        Array.from({ length: n }, (_, i) => [P(i), createBot(difficulty)]),
    );
    let rng = createRng(seed);
    let s = engine.createInitialState({ ...CONFIG, targetScore: 200 }, seed);
    const actions: Action[] = [
        { type: 'START_GAME', players: players(n) },
        { type: 'START_ROUND' },
    ];
    for (const a of actions) s = engine.apply(s, a).state;

    let steps = 0;
    while (s.phase !== 'game_over' && steps < MAX_STEPS) {
        steps++;
        if (s.phase === 'round_over') {
            const a: Action = { type: 'START_ROUND' };
            actions.push(a);
            s = engine.apply(s, a).state;
            continue;
        }
        // Whose decision is it?
        const actor = s.phase === 'challenge_window' ? s.draw4Challenge!.target : s.currentPlayer;
        // Give every *other* bot a chance to catch a missed UNO first.
        const catcher = s.unoVulnerable
            ? s.players.find((p) => p.id !== s.unoVulnerable)!.id
            : undefined;
        const who = catcher ?? actor;

        const view = engine.getPublicView(s, who);
        const legal = engine.getLegalMoves(s, who);
        const d = bots[who]!.decide(view, legal, rng);
        rng = d.rng;
        actions.push(d.action);
        const r = engine.apply(s, d.action);
        const rejected = r.events.find((e) => e.type === 'ActionRejected');
        if (rejected)
            throw new Error(
                `Bot ${who} action rejected: ${JSON.stringify(rejected)} in phase ${s.phase}`,
            );
        s = r.state;
    }
    return { state: s, steps, actions };
}

describe('bots', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
        it(`${difficulty} bots finish a full game to 200 points across 25 seeds without rejected actions`, () => {
            for (let seed = 1; seed <= 25; seed++) {
                const { state, steps } = simulate(difficulty, seed);
                expect(state.phase, `seed ${seed}`).toBe('game_over');
                expect(steps).toBeLessThan(MAX_STEPS);
                expect(state.gameWinner).toBeDefined();
            }
        });
    }

    it('card conservation holds after every step', () => {
        const { actions } = simulate('medium', 3);
        let s = engine.createInitialState({ ...CONFIG, targetScore: 200 }, 3);
        for (const a of actions) {
            s = engine.apply(s, a).state;
            if (s.phase === 'lobby' || s.round === 0) continue;
            const inHands = s.players.reduce((n, p) => n + p.hand.length, 0);
            expect(inHands + s.drawPile.length + s.discardPile.length).toBe(
                Object.keys(s.cards).length,
            );
        }
    });

    it('a full bot game replays deterministically', () => {
        const { state, actions } = simulate('hard', 11, 3);
        expect(engine.replay({ ...CONFIG, targetScore: 200 }, 11, actions)).toEqual(state);
    });

    it('medium bot chooses its most common colour for a wild', () => {
        const bot = createBot('medium');
        const view = engine.getPublicView(
            (() => {
                let s = engine.createInitialState(CONFIG, 5);
                s = engine.apply(s, { type: 'START_GAME', players: players(2) }).state;
                s = engine.apply(s, { type: 'START_ROUND' }).state;
                return { ...s, phase: 'choosing_color' as const, currentPlayer: P(0) };
            })(),
            P(0),
        );
        const counts: Record<string, number> = {};
        for (const c of view.myHand)
            if (c.front.color !== 'wild') counts[c.front.color] = (counts[c.front.color] ?? 0) + 1;
        const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0];
        const d = bot.decide(view, [], createRng(1));
        expect(d.action).toMatchObject({ type: 'CHOOSE_COLOR', color: best });
    });
});
