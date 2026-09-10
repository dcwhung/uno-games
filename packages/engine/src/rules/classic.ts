/**
 * rules/classic.ts — Mattel official Classic UNO.
 *
 * Deck: 108 cards. Per colour: one 0, two each of 1–9, two Skip, two Reverse,
 * two Draw Two. Plus four Wild and four Wild Draw Four.
 */
import {
  activeFace,
  drawCards,
  handHasColor,
  merge,
  nextPlayerId,
  skipPlayer,
  topCard,
} from '../core';
import { CARD_POINTS } from '../types';
import type {
  ApplyResult,
  Card,
  CardColor,
  CardId,
  CardSide,
  GameState,
  PlayerId,
  Rng,
  RulePlugin,
} from '../types';

export const COLORS: readonly CardColor[] = ['red', 'yellow', 'green', 'blue'];
const NUMBER_MIN = 0;
const NUMBER_MAX = 9;
const COPIES_OF_ZERO = 1;
const COPIES_OF_OTHER = 2;
const COPIES_OF_EACH_WILD = 4;
const TWO_PLAYER_COUNT = 2;
const DRAW_TWO_AMOUNT = 2;
const DRAW_FOUR_AMOUNT = 4;

export const CLASSIC_DECK_SIZE = 108;

let cardSeq = 0;
function makeCard(color: CardColor | 'wild', kind: Card['front']['kind'], value?: number): Card {
  const id = `c${cardSeq++}` as CardId;
  return value === undefined
    ? { id, front: { color, kind } }
    : { id, front: { color, kind, value } };
}

export function buildClassicDeck(): readonly Card[] {
  cardSeq = 0;
  const cards: Card[] = [];
  for (const color of COLORS) {
    for (let v = NUMBER_MIN; v <= NUMBER_MAX; v++) {
      const copies = v === 0 ? COPIES_OF_ZERO : COPIES_OF_OTHER;
      for (let c = 0; c < copies; c++) cards.push(makeCard(color, 'number', v));
    }
    for (let c = 0; c < COPIES_OF_OTHER; c++) {
      cards.push(makeCard(color, 'skip'));
      cards.push(makeCard(color, 'reverse'));
      cards.push(makeCard(color, 'draw2'));
    }
  }
  for (let c = 0; c < COPIES_OF_EACH_WILD; c++) {
    cards.push(makeCard('wild', 'wild'));
    cards.push(makeCard('wild', 'wild_draw4'));
  }
  return cards;
}

function isLegal(state: GameState, _player: PlayerId, cardId: CardId): boolean {
  const face = activeFace(state, state.cards[cardId]!);
  // Wilds are always playable; an illegal +4 is caught via challenge, not here.
  if (face.color === 'wild') return true;
  if (face.color === state.activeColor) return true;
  const top = activeFace(state, topCard(state));
  if (top.color === 'wild') return false;
  if (face.kind === 'number') return top.kind === 'number' && top.value === face.value;
  return top.kind === face.kind;
}

function onCardPlayed(
  state: GameState,
  player: PlayerId,
  cardId: CardId,
  chosenColor?: CardColor,
): ApplyResult {
  const face = activeFace(state, state.cards[cardId]!);
  const next = nextPlayerId(state, player);
  const twoPlayer = state.players.length === TWO_PLAYER_COUNT;

  switch (face.kind) {
    case 'number':
      return { state, events: [] };

    case 'skip':
      return skipPlayer(state, next);

    case 'reverse': {
      const reversed: GameState = { ...state, direction: state.direction === 1 ? -1 : 1 };
      const ev: ApplyResult = {
        state: reversed,
        events: [{ type: 'DirectionReversed', direction: reversed.direction }],
      };
      // With two players Reverse acts like Skip.
      return twoPlayer ? merge(ev, skipPlayer(reversed, next)) : ev;
    }

    case 'draw2': {
      const drawn = drawCards(state, next, DRAW_TWO_AMOUNT, 'draw2');
      return merge(drawn, skipPlayer(drawn.state, next));
    }

    case 'wild':
      return chooseOrWait(state, player, chosenColor, undefined);

    case 'wild_draw4': {
      const challenge = {
        player,
        target: next,
        priorColor: state.activeColor,
        wasBluff: handHasColor(state, player, state.activeColor),
      };
      return chooseOrWait(state, player, chosenColor, challenge);
    }

    default:
      throw new Error(`Classic cannot handle card kind ${face.kind}`);
  }
}

function chooseOrWait(
  state: GameState,
  player: PlayerId,
  chosenColor: CardColor | undefined,
  challenge: GameState['draw4Challenge'],
): ApplyResult {
  const withChallenge: GameState = challenge
    ? { ...state, draw4Challenge: challenge, pendingDraw: { amount: DRAW_FOUR_AMOUNT, source: state.discardPile[state.discardPile.length - 1]! } }
    : state;

  if (chosenColor === undefined) {
    return { state: { ...withChallenge, phase: 'choosing_color' }, events: [] };
  }
  const colored: GameState = { ...withChallenge, activeColor: chosenColor };
  return {
    state: challenge ? { ...colored, phase: 'challenge_window' } : colored,
    events: [{ type: 'ColorChosen', player, color: chosenColor }],
  };
}

function cardPoints(card: Card, side: CardSide): number {
  const face = side === 'front' ? card.front : (card.back ?? card.front);
  if (face.color === 'wild') return CARD_POINTS.WILD;
  if (face.kind === 'number') return face.value ?? 0;
  return CARD_POINTS.ACTION;
}

export const classicRules: RulePlugin = {
  id: 'classic',
  displayNameKey: 'variant.classic',
  supportedHouseRules: ['stacking', 'jumpIn', 'sevenZero', 'forcePlay'],
  buildDeck(rng: Rng) {
    const { items, rng: next } = rng.shuffle(buildClassicDeck());
    return { cards: items, rng: next };
  },
  isLegal,
  onCardPlayed,
  cardPoints,
};
