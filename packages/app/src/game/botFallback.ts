/**
 * botFallback.ts — pure recovery logic for a bot whose action the engine refused.
 *
 * A rejected action leaves the engine state untouched, so the bot driver's
 * effect would never re-run and the game would stall silently (AU-003). The
 * helpers here pick a minimal legal action from state alone — no RNG — so the
 * action log still replays byte-for-byte.
 */
import type { Action, CardColor, GameEvent, GameState, PlayerId } from '@uno/engine';

/** Tie-break order when the bot's hand has no dominant colour. */
const COLOR_ORDER: readonly CardColor[] = ['red', 'yellow', 'green', 'blue'];
const DEFAULT_COLOR: CardColor = 'red';

export type Dispatch = (action: Action) => readonly GameEvent[];

export interface BotDispatchResult {
    /** False when every attempted action was refused — the game cannot progress. */
    readonly resolved: boolean;
    /** Actions the engine refused, in the order they were attempted. */
    readonly rejected: readonly Action[];
}

export function wasRejected(events: readonly GameEvent[]): boolean {
    return events.some((e) => e.type === 'ActionRejected');
}

/** Most frequent colour in hand; deterministic tie-break by COLOR_ORDER. */
function dominantColor(state: GameState, bot: PlayerId): CardColor {
    const hand = state.players.find((p) => p.id === bot)?.hand ?? [];
    const counts = new Map<CardColor, number>();
    for (const id of hand) {
        const color = state.cards[id]?.front.color;
        if (color === undefined || color === 'wild') continue;
        counts.set(color, (counts.get(color) ?? 0) + 1);
    }
    let best = DEFAULT_COLOR;
    let bestCount = 0;
    for (const color of COLOR_ORDER) {
        const n = counts.get(color) ?? 0;
        if (n > bestCount) {
            best = color;
            bestCount = n;
        }
    }
    return best;
}

/**
 * The simplest action the engine will accept for `bot` in this position, or
 * undefined when the bot has nothing pending. Order: draw → pass → phase-specific.
 */
export function fallbackActionFor(state: GameState, bot: PlayerId): Action | undefined {
    if (state.phase === 'challenge_window') {
        return state.draw4Challenge?.target === bot ? { type: 'ACCEPT_DRAW4', player: bot } : undefined;
    }
    if (state.currentPlayer !== bot) return undefined;
    if (state.phase === 'choosing_color') {
        return { type: 'CHOOSE_COLOR', player: bot, color: dominantColor(state, bot) };
    }
    if (state.phase !== 'playing') return undefined;
    return state.drawnCard === undefined ? { type: 'DRAW_CARD', player: bot } : { type: 'PASS', player: bot };
}

/**
 * Dispatch `decided`; if the engine refuses it, dispatch the fallback instead.
 * `state` is still valid for the fallback because a rejected action never
 * changes state.
 */
export function dispatchWithFallback(
    state: GameState,
    bot: PlayerId,
    decided: Action,
    dispatch: Dispatch,
): BotDispatchResult {
    if (!wasRejected(dispatch(decided))) return { resolved: true, rejected: [] };

    const fallback = fallbackActionFor(state, bot);
    if (fallback === undefined) return { resolved: false, rejected: [decided] };

    const fallbackRejected = wasRejected(dispatch(fallback));
    return { resolved: !fallbackRejected, rejected: fallbackRejected ? [decided, fallback] : [decided] };
}
