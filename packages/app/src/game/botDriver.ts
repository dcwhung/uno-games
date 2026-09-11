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

const BOT_THINK_MS = 900;
const BOT_FOLLOWUP_MS = 500;      // between CALL_UNO / DRAW and the next action of the same bot
const HUMAN_CATCH_GRACE_MS = 1500; // extra time for the human to tap a bot that forgot UNO
const RNG_SALT_UNO = 7919;

function botDifficulty(state: GameState, id: PlayerId): BotDifficulty {
  return state.playerConfigs.find((p) => p.id === id)?.difficulty ?? 'medium';
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
  console.error('botDriver: bot action and fallback both rejected', { bot: id, rejected: result.rejected });
}

/** When the human misses the UNO window, does any bot notice? */
function humanCaughtBy(state: GameState): PlayerId | undefined {
  let rng = rngForTick(state.seed ^ RNG_SALT_UNO, state.tick);
  for (const p of state.playerConfigs) {
    if (p.kind !== 'bot') continue;
    const alertness = 1 - createBot(p.difficulty ?? 'medium').unoForgetChance;
    const r = rng.next();
    rng = r.rng;
    if (r.value < alertness) return p.id;
  }
  return undefined;
}

export function useBotDriver(): void {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);

  useEffect(() => {
    if (!state) return;

    // 1. Human forgot UNO → timer, then bots may catch.
    if (state.unoVulnerable === HUMAN_ID) {
      const timer = setTimeout(() => {
        const catcher = humanCaughtBy(state);
        dispatch(catcher ? { type: 'CATCH_UNO', player: catcher, target: HUMAN_ID } : { type: 'TIMEOUT', player: HUMAN_ID });
      }, state.config.unoCallWindowMs);
      return () => clearTimeout(timer);
    }

    // 2. A bot needs to act.
    const bot = pendingBot(state);
    if (!bot) return;
    const sameBotContinuing = state.drawnCard !== undefined || state.phase === 'choosing_color';
    const humanCatchWindow = state.unoVulnerable !== undefined && state.unoVulnerable !== bot;
    const delay = (sameBotContinuing ? BOT_FOLLOWUP_MS : BOT_THINK_MS) + (humanCatchWindow ? HUMAN_CATCH_GRACE_MS : 0);

    const timer = setTimeout(() => runBotAction(state, bot, dispatch), delay);
    return () => clearTimeout(timer);
  }, [state, dispatch]);
}
