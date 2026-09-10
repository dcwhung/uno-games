/**
 * core.ts — pure helpers shared by the reducer and rule plugins.
 * No plugin-specific logic here.
 */
import { rngForTick } from './rng';
import type {
  ApplyResult,
  Card,
  CardColor,
  CardFace,
  CardId,
  CardSide,
  DrawReason,
  GameEvent,
  GameState,
  PlayerId,
  PlayerState,
} from './types';

export const ONE_STEP = 1;
export const TWO_STEPS = 2;

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

export function playerIndex(state: GameState, id: PlayerId): number {
  const i = state.players.findIndex((p) => p.id === id);
  if (i < 0) throw new Error(`Unknown player ${id}`);
  return i;
}

export function getPlayer(state: GameState, id: PlayerId): PlayerState {
  return state.players[playerIndex(state, id)]!;
}

export function nextPlayerId(state: GameState, from: PlayerId, steps = ONE_STEP): PlayerId {
  const n = state.players.length;
  const i = playerIndex(state, from);
  const j = (((i + steps * state.direction) % n) + n) % n;
  return state.players[j]!.id;
}

export function activeFace(state: GameState, card: Card): CardFace {
  return faceOn(card, state.activeSide);
}

export function faceOn(card: Card, side: CardSide): CardFace {
  return side === 'front' ? card.front : (card.back ?? card.front);
}

export function topCard(state: GameState): Card {
  const id = state.discardPile[state.discardPile.length - 1];
  if (!id) throw new Error('Discard pile is empty');
  return state.cards[id]!;
}

export function handHasColor(state: GameState, player: PlayerId, color: CardColor): boolean {
  return getPlayer(state, player).hand.some((id) => activeFace(state, state.cards[id]!).color === color);
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
      const top = discardPile[discardPile.length - 1]!;
      const rest = discardPile.slice(0, -1);
      tick += 1;
      const { items } = rngForTick(state.seed, tick).shuffle(rest);
      drawPile = items.slice();
      discardPile = [top];
      events.push({ type: 'DrawPileReshuffled', count: drawPile.length });
    }
    drawn.push(drawPile.pop()!);
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
