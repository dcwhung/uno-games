/**
 * core.ts — pure helpers shared by the reducer and rule plugins.
 * No plugin-specific logic here.
 */
import { elementAt, invariant } from './invariant';
import { rngForTick } from './rng';
import type {
    Action,
    ApplyResult,
    Card,
    CardColor,
    CardFace,
    CardId,
    CardSide,
    DrawReason,
    GameEvent,
    GameState,
    Phase,
    PlayerId,
    PlayerState,
} from './types';

export const ONE_STEP = 1;
export const TWO_STEPS = 2;

// Invariant labels. Each names the guarantee the lookup below depends on, so a
// thrown error says which one broke rather than just "undefined".
const SEAT_INVARIANT = 'seat index comes from the table size';
const DISCARD_INVARIANT = 'discard pile is never empty while a round is in play';
const DRAW_PILE_INVARIANT = 'draw pile is restocked before it is drawn from';

/** Re-exported so callers outside the engine share one definition of "this cannot be undefined". */
export { elementAt, invariant } from './invariant';

// ---------------------------------------------------------------------------
// UNO call rule (single source of truth — W-006)
//
// The reducer needs the individual predicates to report a precise reject
// reason; UI and bots only need the combined answer. Both live here so the
// hand-size limit and the closed phases cannot drift between layers.
// ---------------------------------------------------------------------------

/** You may call UNO once you hold this many cards or fewer (but not zero). */
export const UNO_CALL_MAX_HAND = 2;
const UNO_CALL_MIN_HAND = 1;
const UNO_CALL_CLOSED_PHASES: ReadonlySet<Phase> = new Set<Phase>([
    'lobby',
    'round_over',
    'game_over',
]);

/**
 * Minimal player shape for `canCallUno`. `handCount` (not `hand`) is used so
 * both `PlayerState` (via `hand.length`) and `PublicPlayerView` fit, keeping
 * the helper usable by bots that only ever see the public view.
 */
export interface UnoCallCandidate {
    readonly handCount: number;
    readonly calledUno: boolean;
}

export function isUnoCallHandSize(handCount: number): boolean {
    return handCount >= UNO_CALL_MIN_HAND && handCount <= UNO_CALL_MAX_HAND;
}

export function isUnoCallPhase(phase: Phase): boolean {
    return !UNO_CALL_CLOSED_PHASES.has(phase);
}

export function canCallUno(player: UnoCallCandidate, phase: Phase): boolean {
    return isUnoCallPhase(phase) && !player.calledUno && isUnoCallHandSize(player.handCount);
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/**
 * The player attempting `action`, or undefined for the table-level actions
 * (START_GAME / START_ROUND) that nobody in particular performs.
 */
export function actionActor(action: Action): PlayerId | undefined {
    return 'player' in action ? action.player : undefined;
}

/** Non-throwing counterpart to `getPlayer`: is there a seat with this id? */
export function hasPlayer(state: GameState, id: PlayerId): boolean {
    return state.players.some((p) => p.id === id);
}

export function playerIndex(state: GameState, id: PlayerId): number {
    const i = state.players.findIndex((p) => p.id === id);
    if (i < 0) throw new Error(`Unknown player ${id}`);
    return i;
}

export function getPlayer(state: GameState, id: PlayerId): PlayerState {
    return playerAt(state, playerIndex(state, id));
}

/** The seat at `index`. Every index reaching here is derived from `players.length`. */
export function playerAt(state: GameState, index: number): PlayerState {
    return elementAt(state.players, index, SEAT_INVARIANT);
}

/** The card with this id, from a deck map that is not (yet) on the state. */
export function cardFrom(cards: Readonly<Record<CardId, Card>>, id: CardId): Card {
    return invariant(cards[id], `card ${id} is in the round's deck`);
}

/** The card with this id. Every id in play was minted into `state.cards` when the round was dealt. */
export function getCard(state: GameState, id: CardId): Card {
    return cardFrom(state.cards, id);
}

/** Top of a discard pile: its last entry. Also valid for a pile being rebuilt mid-draw. */
export function topDiscardId(discardPile: readonly CardId[]): CardId {
    return invariant(discardPile[discardPile.length - 1], DISCARD_INVARIANT);
}

/** Pop the top of a draw pile. Callers reshuffle first, so it is never empty here. */
export function takeFromDrawPile(drawPile: CardId[]): CardId {
    return invariant(drawPile.pop(), DRAW_PILE_INVARIANT);
}

/** Out of the round (No Mercy's mercy rule); an absent flag means still in it. */
export function isEliminated(state: GameState, id: PlayerId): boolean {
    return getPlayer(state, id).eliminated === true;
}

/** Seat `offset` places away from `i` in the current direction, wrapping around the table. */
function seatAt(state: GameState, i: number, offset: number): number {
    const n = state.players.length;
    return (((i + offset * state.direction) % n) + n) % n;
}

/** Next seat still in the round; stays put when everyone else has been eliminated. */
function nextActiveIndex(state: GameState, i: number): number {
    const n = state.players.length;
    for (let offset = ONE_STEP; offset < n; offset++) {
        const j = seatAt(state, i, offset);
        if (!playerAt(state, j).eliminated) return j;
    }
    return i;
}

export function nextPlayerId(state: GameState, from: PlayerId, steps = ONE_STEP): PlayerId {
    let i = playerIndex(state, from);
    for (let taken = 0; taken < steps; taken++) i = nextActiveIndex(state, i);
    return playerAt(state, i).id;
}

export function activeFace(state: GameState, card: Card): CardFace {
    return faceOn(card, state.activeSide);
}

export function faceOn(card: Card, side: CardSide): CardFace {
    return side === 'front' ? card.front : (card.back ?? card.front);
}

export function topCard(state: GameState): Card {
    return getCard(state, topDiscardId(state.discardPile));
}

export function handHasColor(state: GameState, player: PlayerId, color: CardColor): boolean {
    return getPlayer(state, player).hand.some(
        (id) => activeFace(state, getCard(state, id)).color === color,
    );
}

// ---------------------------------------------------------------------------
// State updates (all return new objects)
// ---------------------------------------------------------------------------

export function updatePlayer(
    state: GameState,
    id: PlayerId,
    patch: Partial<PlayerState>,
): GameState {
    return {
        ...state,
        players: state.players.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    };
}

export function bumpTick(state: GameState): GameState {
    return { ...state, tick: state.tick + 1 };
}

/**
 * Draw `amount` cards for `player`, reshuffling the discard pile (minus top)
 * into the draw pile when it runs dry. Resets the player's UNO call.
 */
export function drawCards(
    state: GameState,
    player: PlayerId,
    amount: number,
    reason: DrawReason,
): ApplyResult {
    const events: GameEvent[] = [];
    let drawPile = state.drawPile.slice();
    let discardPile = state.discardPile.slice();
    const drawn: CardId[] = [];
    let tick = state.tick;

    for (let i = 0; i < amount; i++) {
        if (drawPile.length === 0) {
            if (discardPile.length <= 1) break; // nothing left anywhere — stop drawing
            const top = topDiscardId(discardPile);
            const rest = discardPile.slice(0, -1);
            tick += 1;
            const { items } = rngForTick(state.seed, tick).shuffle(rest);
            drawPile = items.slice();
            discardPile = [top];
            events.push({ type: 'DrawPileReshuffled', count: drawPile.length });
        }
        drawn.push(takeFromDrawPile(drawPile));
    }

    let next: GameState = { ...state, drawPile, discardPile, tick };
    const p = getPlayer(next, player);
    next = updatePlayer(next, player, { hand: [...p.hand, ...drawn], calledUno: false });
    if (next.unoVulnerable === player) next = { ...next, unoVulnerable: undefined };
    if (drawn.length > 0) events.push({ type: 'CardDrawn', player, cards: drawn, reason });
    return { state: next, events };
}

export function skipPlayer(state: GameState, player: PlayerId): ApplyResult {
    return {
        state: { ...state, currentPlayer: player },
        events: [{ type: 'TurnSkipped', player }],
    };
}

export function merge(a: ApplyResult, b: ApplyResult): ApplyResult {
    return { state: b.state, events: [...a.events, ...b.events] };
}
