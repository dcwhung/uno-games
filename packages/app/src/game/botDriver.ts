/**
 * botDriver.ts — drives bot turns and the human UNO timer.
 *
 * Runs as a React effect on every state change. All timing lives here so the
 * engine stays free of clocks. Bot randomness is derived from (seed, tick) so
 * a replayed action log reproduces the same bot decisions.
 */
import { useEffect } from 'react';
import { createBot, engine, rngForTick } from '@uno/engine';
import type { Action, BotDifficulty, GameState, PlayerId } from '@uno/engine';
import { HUMAN_ID, useGameStore } from '../store/gameStore';
import { dispatchWithFallback } from './botFallback';
import type { Dispatch } from './botFallback';
import { isUnoWindowDisabled, unoWindowAction } from './unoWindow';

const BOT_THINK_MS = 900;
const BOT_FOLLOWUP_MS = 500; // between CALL_UNO / DRAW and the next action of the same bot
const HUMAN_CATCH_GRACE_MS = 1500; // extra time for the human to tap a bot that forgot UNO
const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'medium';

function botDifficulty(state: GameState, id: PlayerId): BotDifficulty {
    return state.playerConfigs.find((p) => p.id === id)?.difficulty ?? DEFAULT_BOT_DIFFICULTY;
}

function isBot(state: GameState, id: PlayerId): boolean {
    return state.playerConfigs.find((p) => p.id === id)?.kind === 'bot';
}

/** Which bot (if any) must act next, given the phase. */
function pendingBot(state: GameState): PlayerId | undefined {
    if (state.phase === 'challenge_window') {
        const target = state.draw4Challenge?.target;
        return target && isBot(state, target) ? target : undefined;
    }
    if (state.phase === 'playing' || state.phase === 'choosing_color') {
        return isBot(state, state.currentPlayer) ? state.currentPlayer : undefined;
    }
    return undefined;
}

function decideBotAction(state: GameState, id: PlayerId): Action {
    const bot = createBot(botDifficulty(state, id));
    const view = engine.getPublicView(state, id);
    const legal = engine.getLegalMoves(state, id);
    return bot.decide(view, legal, rngForTick(state.seed, state.tick)).action;
}

/** Dispatch the bot's decision, falling back to a safe action if the engine refuses it (AU-003). */
function runBotAction(state: GameState, id: PlayerId, dispatch: Dispatch): void {
    const result = dispatchWithFallback(state, id, decideBotAction(state, id), dispatch);
    if (result.resolved) return;
    // The game cannot progress from here. There is no logger yet, so this is the
    // dev-only signal that a bot / rule plugin produced no legal action.
    console.error('botDriver: bot action and fallback both rejected', {
        bot: id,
        rejected: result.rejected,
    });
}

/**
 * Human forgot UNO. With the window disabled we call it for them right away
 * (no timer, so no catch roll — W-008); otherwise the window runs out and
 * bots get their chance to catch.
 */
function scheduleUnoWindow(state: GameState, dispatch: Dispatch): (() => void) | undefined {
    if (isUnoWindowDisabled(state)) {
        dispatch(unoWindowAction(state));
        return undefined;
    }
    const timer = setTimeout(() => dispatch(unoWindowAction(state)), state.config.unoCallWindowMs);
    return () => clearTimeout(timer);
}

export function useBotDriver(): void {
    const state = useGameStore((s) => s.state);
    const dispatch = useGameStore((s) => s.dispatch);

    useEffect(() => {
        if (!state) return;

        // 1. Human forgot UNO → auto-call, or timer then bots may catch.
        if (state.unoVulnerable === HUMAN_ID) return scheduleUnoWindow(state, dispatch);

        // 2. A bot needs to act.
        const bot = pendingBot(state);
        if (!bot) return;
        const sameBotContinuing = state.drawnCard !== undefined || state.phase === 'choosing_color';
        const humanCatchWindow = state.unoVulnerable !== undefined && state.unoVulnerable !== bot;
        const delay =
            (sameBotContinuing ? BOT_FOLLOWUP_MS : BOT_THINK_MS) +
            (humanCatchWindow ? HUMAN_CATCH_GRACE_MS : 0);

        const timer = setTimeout(() => runBotAction(state, bot, dispatch), delay);
        return () => clearTimeout(timer);
    }, [state, dispatch]);
}
