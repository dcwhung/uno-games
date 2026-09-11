/**
 * unoWindow.ts — pure decision for what happens when the human's UNO window
 * closes. The driver owns the clock; this module owns the outcome so it can be
 * specced without React.
 *
 * A real window is a duration `setTimeout` can honour, after which bots may
 * catch the human, rolled from (seed, tick) so replays are identical. Anything
 * else means the human never has to press UNO: the driver calls it on their
 * behalf the moment they become vulnerable (W-008 / AU-013).
 */
import { createBot, rngForTick } from '@uno/engine';
import type { Action, GameState, PlayerId } from '@uno/engine';
import { DEFAULT_BOT_DIFFICULTY } from '../persistence/settings';
import { HUMAN_ID } from '../store/gameStore';

export const UNO_WINDOW_DISABLED = 0;
/**
 * setTimeout keeps its delay in a signed 32-bit int; a larger value wraps and
 * fires immediately, so a "window" beyond this is no window at all.
 */
export const MAX_UNO_WINDOW_MS = 2 ** 31 - 1;
/** Decorrelates the catch roll from the bot's own decision roll on the same tick. */
const RNG_SALT_UNO = 7919;

/** A window the driver can actually wait out: strictly positive and within setTimeout's range. */
function isRealUnoWindow(ms: number): boolean {
    return ms > UNO_WINDOW_DISABLED && ms <= MAX_UNO_WINDOW_MS;
}

/**
 * S-025: `persistence/settings.ts` admits only integers >= 0, but a RuleConfig can
 * also be hand-built (specs today; a URL param or multiplayer lobby tomorrow). A
 * negative, NaN, Infinity or overflowing value would reach `setTimeout` and fire
 * on the spot, so the human would be caught without ever getting a window — the
 * exact symptom W-008 fixed. Treat every such value as disabled instead.
 */
export function isUnoWindowDisabled(state: GameState): boolean {
    return !isRealUnoWindow(state.config.unoCallWindowMs);
}

/** When the human misses the UNO window, does any bot notice? */
function humanCaughtBy(state: GameState): PlayerId | undefined {
    let rng = rngForTick(state.seed ^ RNG_SALT_UNO, state.tick);
    for (const p of state.playerConfigs) {
        if (p.kind !== 'bot') continue;
        const alertness = 1 - createBot(p.difficulty ?? DEFAULT_BOT_DIFFICULTY).unoForgetChance;
        const r = rng.next();
        rng = r.rng;
        if (r.value < alertness) return p.id;
    }
    return undefined;
}

/** The action to dispatch for a human who is currently `unoVulnerable`. */
export function unoWindowAction(state: GameState): Action {
    if (isUnoWindowDisabled(state)) return { type: 'CALL_UNO', player: HUMAN_ID };
    const catcher = humanCaughtBy(state);
    return catcher
        ? { type: 'CATCH_UNO', player: catcher, target: HUMAN_ID }
        : { type: 'TIMEOUT', player: HUMAN_ID };
}
