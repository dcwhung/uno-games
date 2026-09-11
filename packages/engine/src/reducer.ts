/**
 * reducer.ts — the engine. Pure: apply(state, action) → { state, events }.
 *
 * Turn-flow contract with plugins (see RulePlugin.onCardPlayed):
 *  - The reducer moves the card to the discard pile and sets activeColor for
 *    coloured cards BEFORE calling the plugin.
 *  - The plugin applies effects. To skip someone it sets currentPlayer to the
 *    skipped player; the reducer then advances one step from there.
 *  - If the plugin leaves phase as 'choosing_color' or 'challenge_window' the
 *    reducer does NOT advance; the follow-up action resumes the flow.
 *  - pendingDraw is owned by the plugin: the reducer never clears it while a
 *    card is being played, so onCardPlayed sees the amount in force (stacking).
 *    Only START_ROUND and the Draw Four resolution reset it.
 *  - UNO vulnerability is judged AFTER onCardPlayed, from the hand the effects
 *    left behind (Discard All can drop a player to one card).
 *  - onTurnStart(state, player) runs each time the reducer hands the turn to a
 *    player: after TurnChanged in advanceTurn, after the dealer-first Reverse
 *    opening, and once the opening-Wild colour is chosen. Its events follow
 *    TurnChanged. The reducer does not advance again afterwards; a hook that
 *    ends the turn must move currentPlayer and emit TurnChanged itself.
 *  - finishPlay asks isRoundOver first; the empty-hand rule is the fallback.
 */
import {
  activeFace,
  bumpTick,
  drawCards,
  getPlayer,
  merge,
  nextPlayerId,
  topCard,
  updatePlayer,
} from './core';
import { rngForTick } from './rng';
import {
  INITIAL_HAND_SIZE,
  MAX_PLAYERS,
  MIN_PLAYERS,
  PENALTY,
  type Action,
  type ApplyResult,
  type Card,
  type CardColor,
  type CardId,
  type Engine,
  type GameEvent,
  type GameState,
  type LegalMove,
  type PlayerConfig,
  type PlayerId,
  type PublicView,
  type RejectReason,
  type RuleConfig,
  type RulePlugin,
  type Seed,
  type VariantId,
} from './types';

const FIRST_ROUND = 1;
const UNO_HAND_SIZE = 1;
const UNO_CALL_MAX_HAND = 2;
const SINGLE_DRAW = 1;

type Registry = Readonly<Partial<Record<VariantId, RulePlugin>>>;

export function createEngine(registry: Registry): Engine {
  function plugin(state: GameState): RulePlugin {
    const p = registry[state.config.variant];
    if (!p) throw new Error(`No rule plugin registered for ${state.config.variant}`);
    return p;
  }

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  function createInitialState(config: RuleConfig, seed: Seed): GameState {
    return {
      config,
      seed,
      tick: 0,
      phase: 'lobby',
      players: [],
      playerConfigs: [],
      currentPlayer: '' as PlayerId,
      direction: 1,
      cards: {},
      drawPile: [],
      discardPile: [],
      activeSide: 'front',
      activeColor: 'red',
      round: 0,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function reject(state: GameState, action: Action, reason: RejectReason): ApplyResult {
    return { state, events: [{ type: 'ActionRejected', action, reason }] };
  }

  function requireTurn(state: GameState, player: PlayerId): RejectReason | undefined {
    if (state.phase !== 'playing') return 'wrong_phase';
    if (state.currentPlayer !== player) return 'not_your_turn';
    return undefined;
  }

  /** Give the plugin its turn-start hook for `player`; no-op when the plugin has none. */
  function startTurn(state: GameState, player: PlayerId): ApplyResult {
    return plugin(state).onTurnStart?.(state, player) ?? { state, events: [] };
  }

  function advanceTurn(state: GameState): ApplyResult {
    const next = nextPlayerId(state, state.currentPlayer);
    const changed: ApplyResult = {
      state: { ...state, currentPlayer: next, drawnCard: undefined },
      events: [{ type: 'TurnChanged', player: next }],
    };
    return merge(changed, startTurn(changed.state, next));
  }

  /** Default round-over rule: the player who just acted has emptied their hand. */
  function emptyHandWinner(state: GameState, player: PlayerId): PlayerId | undefined {
    return getPlayer(state, player).hand.length === 0 ? player : undefined;
  }

  /** Called once a card's effects are fully resolved. The plugin's isRoundOver wins over the default. */
  function finishPlay(state: GameState, player: PlayerId): ApplyResult {
    const winner = plugin(state).isRoundOver?.(state) ?? emptyHandWinner(state, player);
    if (winner !== undefined) return endRound(state, winner);
    return advanceTurn(state);
  }

  function endRound(state: GameState, winner: PlayerId): ApplyResult {
    const rules = plugin(state);
    let points = 0;
    for (const p of state.players) {
      if (p.id === winner) continue;
      for (const id of p.hand) points += rules.cardPoints(state.cards[id]!, state.activeSide);
    }
    let next = updatePlayer(state, winner, { score: getPlayer(state, winner).score + points });
    const scores = Object.fromEntries(next.players.map((p) => [p.id, p.score])) as Record<PlayerId, number>;
    const events: GameEvent[] = [{ type: 'RoundEnded', winner, points, scores }];
    next = { ...next, phase: 'round_over', roundWinner: winner, unoVulnerable: undefined, drawnCard: undefined };

    if (scores[winner]! >= state.config.targetScore) {
      next = { ...next, phase: 'game_over', gameWinner: winner };
      events.push({ type: 'GameEnded', winner });
    }
    return { state: next, events };
  }

  /** Judged from the hand the card effects left behind, so plugin discards / draws count. */
  function markUnoVulnerable(state: GameState, player: PlayerId): GameState {
    const me = getPlayer(state, player);
    if (me.hand.length === UNO_HAND_SIZE && !me.calledUno) return { ...state, unoVulnerable: player };
    return state;
  }

  function clearUnoVulnerabilityFor(state: GameState, actor: PlayerId): GameState {
    // Once the next player acts, the window to catch a missed UNO has closed.
    if (state.unoVulnerable && state.unoVulnerable !== actor) {
      return { ...state, unoVulnerable: undefined };
    }
    return state;
  }

  // -------------------------------------------------------------------------
  // Action handlers
  // -------------------------------------------------------------------------

  function startGame(state: GameState, action: Extract<Action, { type: 'START_GAME' }>): ApplyResult {
    if (state.phase !== 'lobby') return reject(state, action, 'wrong_phase');
    const n = action.players.length;
    if (n < MIN_PLAYERS || n > MAX_PLAYERS) return reject(state, action, 'variant_rule');
    const players = action.players.map((p: PlayerConfig) => ({ id: p.id, hand: [], calledUno: false, score: 0 }));
    const next: GameState = {
      ...state,
      phase: 'round_over',
      players,
      playerConfigs: action.players,
      currentPlayer: players[0]!.id,
      round: 0,
    };
    return { state: next, events: [{ type: 'GameStarted', players: players.map((p) => p.id) }] };
  }

  function startRound(state: GameState, action: Action): ApplyResult {
    if (state.phase !== 'round_over') return reject(state, action, 'wrong_phase');
    const rules = plugin(state);
    const round = state.round + 1;
    const dealerIdx = (round - FIRST_ROUND) % state.players.length;
    const dealer = state.players[dealerIdx]!.id;

    let s: GameState = bumpTick({ ...state, round, direction: 1, activeSide: 'front' });
    const { cards } = rules.buildDeck(rngForTick(s.seed, s.tick));
    const cardMap: Record<CardId, Card> = {};
    for (const c of cards) cardMap[c.id] = c;

    let drawPile = cards.map((c) => c.id);
    const events: GameEvent[] = [{ type: 'RoundStarted', round, dealer }];

    // Deal clockwise from dealer's left.
    const order = state.players.map((_, i) => state.players[(dealerIdx + 1 + i) % state.players.length]!.id);
    const hands: Record<PlayerId, CardId[]> = {};
    for (const id of order) hands[id] = [];
    for (let k = 0; k < INITIAL_HAND_SIZE; k++) {
      for (const id of order) hands[id]!.push(drawPile.pop()!);
    }
    for (const id of order) events.push({ type: 'CardsDealt', player: id, cards: hands[id]! });

    // Opening card: Wild Draw Four goes back into the deck and we redraw.
    let opening = drawPile.pop()!;
    while (activeFace(s, cardMap[opening]!).kind === 'wild_draw4') {
      s = bumpTick(s);
      const { items } = rngForTick(s.seed, s.tick).shuffle([...drawPile, opening]);
      drawPile = items.slice();
      opening = drawPile.pop()!;
    }
    events.push({ type: 'DiscardStarted', card: opening });

    const openingFace = activeFace(s, cardMap[opening]!);
    s = {
      ...s,
      phase: 'playing',
      cards: cardMap,
      drawPile,
      discardPile: [opening],
      players: s.players.map((p) => ({ ...p, hand: hands[p.id]!, calledUno: false })),
      currentPlayer: dealer,
      activeColor: openingFace.color === 'wild' ? s.activeColor : openingFace.color,
      pendingDraw: undefined,
      draw4Challenge: undefined,
      unoVulnerable: undefined,
      drawnCard: undefined,
      roundWinner: undefined,
      openingWild: false,
    };

    // Treat the opening card as if the dealer played it.
    const effect = rules.onCardPlayed(s, dealer, opening);
    let out: ApplyResult = { state: effect.state, events: [...events, ...effect.events] };

    if (out.state.phase === 'choosing_color') {
      const first = nextPlayerId(out.state, dealer);
      out = { state: { ...out.state, currentPlayer: first, openingWild: true }, events: out.events };
      return out;
    }
    if (openingFace.kind === 'reverse' && state.players.length > MIN_PLAYERS) {
      // Dealer plays first when the opening card is a Reverse.
      const dealerFirst: ApplyResult = { state: out.state, events: [...out.events, { type: 'TurnChanged', player: dealer }] };
      return merge(dealerFirst, startTurn(out.state, dealer));
    }
    return merge(out, advanceTurn(out.state));
  }

  function playCard(state: GameState, action: Extract<Action, { type: 'PLAY_CARD' }>): ApplyResult {
    const bad = requireTurn(state, action.player);
    if (bad) return reject(state, action, bad);
    const me = getPlayer(state, action.player);
    if (!me.hand.includes(action.card)) return reject(state, action, 'card_not_in_hand');
    if (state.drawnCard !== undefined && state.drawnCard !== action.card) return reject(state, action, 'illegal_card');
    const rules = plugin(state);
    if (!rules.isLegal(state, action.player, action.card)) return reject(state, action, 'illegal_card');

    const face = activeFace(state, state.cards[action.card]!);
    let s = clearUnoVulnerabilityFor(state, action.player);
    s = bumpTick(s);
    s = updatePlayer(s, action.player, { hand: me.hand.filter((id) => id !== action.card) });
    s = {
      ...s,
      discardPile: [...s.discardPile, action.card],
      activeColor: face.color === 'wild' ? s.activeColor : face.color,
      drawnCard: undefined,
      draw4Challenge: undefined,
    };

    const played: ApplyResult = {
      state: s,
      events: [{ type: 'CardPlayed', player: action.player, card: action.card }],
    };
    const effect = rules.onCardPlayed(s, action.player, action.card, action.chosenColor);
    const out: ApplyResult = { state: markUnoVulnerable(effect.state, action.player), events: [...played.events, ...effect.events] };
    if (out.state.phase !== 'playing') return out;
    return merge(out, finishPlay(out.state, action.player));
  }

  function drawCard(state: GameState, action: Extract<Action, { type: 'DRAW_CARD' }>): ApplyResult {
    const bad = requireTurn(state, action.player);
    if (bad) return reject(state, action, bad);
    if (state.drawnCard !== undefined) return reject(state, action, 'wrong_phase');

    let s = clearUnoVulnerabilityFor(state, action.player);
    s = bumpTick(s);
    const drawn = drawCards(s, action.player, SINGLE_DRAW, 'turn');
    const drawnEvent = drawn.events.find((e) => e.type === 'CardDrawn');
    const card = drawnEvent?.type === 'CardDrawn' ? drawnEvent.cards[0] : undefined;
    const withDrawn: GameState = { ...drawn.state, drawnCard: card };

    // Official: if the drawn card is unplayable the turn ends immediately.
    if (card === undefined || !plugin(s).isLegal(withDrawn, action.player, card)) {
      return merge({ state: withDrawn, events: drawn.events }, advanceTurn(withDrawn));
    }
    return { state: withDrawn, events: drawn.events };
  }

  function pass(state: GameState, action: Extract<Action, { type: 'PASS' }>): ApplyResult {
    const bad = requireTurn(state, action.player);
    if (bad) return reject(state, action, bad);
    if (state.drawnCard === undefined) return reject(state, action, 'wrong_phase');
    return advanceTurn(bumpTick(state));
  }

  function chooseColor(state: GameState, action: Extract<Action, { type: 'CHOOSE_COLOR' }>): ApplyResult {
    if (state.phase !== 'choosing_color') return reject(state, action, 'wrong_phase');
    if (state.currentPlayer !== action.player) return reject(state, action, 'not_your_turn');

    const colored: GameState = bumpTick({ ...state, activeColor: action.color });
    const ev: GameEvent = { type: 'ColorChosen', player: action.player, color: action.color };

    if (state.openingWild) {
      // First player chose the colour for an opening Wild and now plays.
      const ready: GameState = { ...colored, phase: 'playing', openingWild: false };
      return merge({ state: ready, events: [ev] }, startTurn(ready, action.player));
    }
    if (state.draw4Challenge) {
      return { state: { ...colored, phase: 'challenge_window' }, events: [ev] };
    }
    return merge({ state: { ...colored, phase: 'playing' }, events: [ev] }, finishPlay({ ...colored, phase: 'playing' }, action.player));
  }

  function resolveDraw4(state: GameState, action: Action, challenge: boolean): ApplyResult {
    if (state.phase !== 'challenge_window' || !state.draw4Challenge) return reject(state, action, 'wrong_phase');
    const ctx = state.draw4Challenge;
    const actor = (action as { player: PlayerId }).player;
    if (actor !== ctx.target) return reject(state, action, 'not_your_turn');

    const s: GameState = bumpTick({ ...state, phase: 'playing', draw4Challenge: undefined, pendingDraw: undefined });
    let out: ApplyResult = { state: s, events: [] };

    if (!challenge) {
      out = merge(out, drawCards(s, ctx.target, PENALTY.SUCCESSFUL_CHALLENGE, 'draw4'));
      out = merge(out, { state: { ...out.state, currentPlayer: ctx.target }, events: [{ type: 'TurnSkipped', player: ctx.target }] });
      return merge(out, finishPlay(out.state, ctx.player));
    }

    const succeeded = ctx.wasBluff;
    out = merge(out, { state: s, events: [{ type: 'Draw4Challenged', by: ctx.target, against: ctx.player, succeeded }] });
    if (succeeded) {
      // Bluffer draws 4; challenger then plays normally.
      out = merge(out, drawCards(out.state, ctx.player, PENALTY.SUCCESSFUL_CHALLENGE, 'challenge'));
      return merge(out, finishPlay(out.state, ctx.player));
    }
    // Challenger loses: draws 6 and is skipped.
    out = merge(out, drawCards(out.state, ctx.target, PENALTY.FAILED_CHALLENGE, 'challenge'));
    out = merge(out, { state: { ...out.state, currentPlayer: ctx.target }, events: [{ type: 'TurnSkipped', player: ctx.target }] });
    return merge(out, finishPlay(out.state, ctx.player));
  }

  function callUno(state: GameState, action: Extract<Action, { type: 'CALL_UNO' }>): ApplyResult {
    if (state.phase === 'lobby' || state.phase === 'round_over' || state.phase === 'game_over') return reject(state, action, 'wrong_phase');
    const me = getPlayer(state, action.player);
    if (me.calledUno) return reject(state, action, 'already_called');
    if (me.hand.length > UNO_CALL_MAX_HAND || me.hand.length === 0) return reject(state, action, 'variant_rule');
    let s = updatePlayer(bumpTick(state), action.player, { calledUno: true });
    if (s.unoVulnerable === action.player) s = { ...s, unoVulnerable: undefined };
    return { state: s, events: [{ type: 'UnoCalled', player: action.player }] };
  }

  function catchUno(state: GameState, action: Extract<Action, { type: 'CATCH_UNO' }>): ApplyResult {
    if (state.unoVulnerable !== action.target || action.player === action.target) return reject(state, action, 'no_uno_to_catch');
    const s = bumpTick({ ...state, unoVulnerable: undefined });
    const drawn = drawCards(s, action.target, PENALTY.MISSED_UNO_CALL, 'uno_missed');
    return { state: drawn.state, events: [{ type: 'UnoCaught', player: action.target, by: action.player }, ...drawn.events] };
  }

  function timeout(state: GameState, action: Extract<Action, { type: 'TIMEOUT' }>): ApplyResult {
    if (state.unoVulnerable !== action.player) return reject(state, action, 'no_uno_to_catch');
    return { state: bumpTick({ ...state, unoVulnerable: undefined }), events: [] };
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  function apply(state: GameState, action: Action): ApplyResult {
    switch (action.type) {
      case 'START_GAME': return startGame(state, action);
      case 'START_ROUND': return startRound(state, action);
      case 'PLAY_CARD': return playCard(state, action);
      case 'DRAW_CARD': return drawCard(state, action);
      case 'PASS': return pass(state, action);
      case 'CHOOSE_COLOR': return chooseColor(state, action);
      case 'CHALLENGE_DRAW4': return resolveDraw4(state, action, true);
      case 'ACCEPT_DRAW4': return resolveDraw4(state, action, false);
      case 'CALL_UNO': return callUno(state, action);
      case 'CATCH_UNO': return catchUno(state, action);
      case 'TIMEOUT': return timeout(state, action);
      case 'VARIANT': {
        const handler = plugin(state).onVariantAction;
        return handler ? handler(state, action) : reject(state, action, 'variant_rule');
      }
    }
  }

  function getLegalMoves(state: GameState, player: PlayerId): readonly LegalMove[] {
    if (state.phase !== 'playing' || state.currentPlayer !== player) return [];
    const rules = plugin(state);
    const hand = getPlayer(state, player).hand;
    const candidates = state.drawnCard !== undefined ? hand.filter((id) => id === state.drawnCard) : hand;
    return candidates
      .filter((id) => rules.isLegal(state, player, id))
      .map((id) => ({ card: id, requiresColor: activeFace(state, state.cards[id]!).color === 'wild' }));
  }

  function getPublicView(state: GameState, me: PlayerId): PublicView {
    const view: PublicView = {
      me,
      myHand: getPlayer(state, me).hand.map((id) => state.cards[id]!),
      players: state.players.map((p) => ({ id: p.id, handCount: p.hand.length, calledUno: p.calledUno, score: p.score })),
      currentPlayer: state.currentPlayer,
      direction: state.direction,
      topCard: state.discardPile.length > 0 ? topCard(state) : undefined,
      activeColor: state.activeColor as CardColor,
      activeSide: state.activeSide,
      drawPileCount: state.drawPile.length,
      discardHistory: state.discardPile.map((id) => state.cards[id]!),
      phase: state.phase,
      houseRules: state.config.houseRules,
    };
    return {
      ...view,
      ...(state.pendingDraw ? { pendingDraw: state.pendingDraw } : {}),
      ...(state.unoVulnerable ? { unoVulnerable: state.unoVulnerable } : {}),
      ...(state.drawnCard ? { drawnCard: state.drawnCard } : {}),
      ...(state.draw4Challenge ? { draw4Challenge: state.draw4Challenge } : {}),
    };
  }

  function replay(config: RuleConfig, seed: Seed, actions: readonly Action[]): GameState {
    let s = createInitialState(config, seed);
    for (const a of actions) s = apply(s, a).state;
    return s;
  }

  return { createInitialState, apply, getLegalMoves, getPublicView, replay };
}
