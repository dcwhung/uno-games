/**
 * bots/index.ts — heuristic bots. Pure: decide(view, legal, rng).
 *
 * The bot only ever sees PublicView (no opponent hands). The app's bot driver
 * calls decide() repeatedly until the bot's turn is over; each call returns a
 * single Action so the 3D layer can animate between them.
 */
import type {
  Action,
  Bot,
  BotDifficulty,
  Card,
  CardColor,
  CardFace,
  LegalMove,
  PlayerId,
  PublicView,
  Rng,
} from '../types';

const COLORS: readonly CardColor[] = ['red', 'yellow', 'green', 'blue'];

const UNO_FORGET_CHANCE: Readonly<Record<BotDifficulty, number>> = {
  easy: 0.5,
  medium: 0.2,
  hard: 0.05,
};

/** Challenge a +4 when the player who threw it has at most this many cards. */
const CHALLENGE_HAND_THRESHOLD: Readonly<Record<BotDifficulty, number>> = {
  easy: 0,      // never challenges
  medium: 2,
  hard: 3,
};

const OPPONENT_DANGER_HAND = 2;
const SCORE_ATTACK_WHEN_DANGER = 40;
const SCORE_ACTION_CARD = 10;
const SCORE_COLOR_FREQUENCY_WEIGHT = 3;
const SCORE_WILD_PENALTY = -15;
const SCORE_WILD_DRAW4_PENALTY = -20;
const SCORE_AVOID_KNOWN_COLOR = -8;

function pick<T>(items: readonly T[], rng: Rng): { readonly item: T; readonly rng: Rng } {
  const r = rng.next();
  return { item: items[Math.floor(r.value * items.length)]!, rng: r.rng };
}

function colorCounts(hand: readonly Card[]): Record<CardColor, number> {
  const counts: Record<CardColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.front.color !== 'wild') counts[c.front.color]++;
  return counts;
}

function bestColor(hand: readonly Card[]): CardColor {
  const counts = colorCounts(hand);
  return COLORS.reduce((best, c) => (counts[c] > counts[best] ? c : best), COLORS[0]!);
}

function nextOpponent(view: PublicView): PublicView['players'][number] {
  const n = view.players.length;
  const i = view.players.findIndex((p) => p.id === view.me);
  return view.players[(((i + view.direction) % n) + n) % n]!;
}

/**
 * Hard bot memory: colours the next opponent chose via Wild are colours they
 * probably hold; colours that were in force when they drew are colours they lack.
 * Derived purely from discardHistory, so it needs no extra state.
 */
function likelyHeldColors(view: PublicView): ReadonlySet<CardColor> {
  const held = new Set<CardColor>();
  const recent = view.discardHistory.slice(-8);
  for (const c of recent) if (c.front.color !== 'wild') held.add(c.front.color);
  return held;
}

function scoreMove(move: LegalMove, face: CardFace, hand: readonly Card[], view: PublicView, difficulty: BotDifficulty): number {
  const opp = nextOpponent(view);
  const counts = colorCounts(hand);
  let score = 0;

  if (face.color === 'wild') {
    score += face.kind === 'wild_draw4' ? SCORE_WILD_DRAW4_PENALTY : SCORE_WILD_PENALTY;
  } else {
    score += counts[face.color] * SCORE_COLOR_FREQUENCY_WEIGHT;
  }
  if (face.kind !== 'number') score += SCORE_ACTION_CARD;

  // Attack-ness comes from the plugin via LegalMove.traits, so new variant kinds are scored too.
  if (opp.handCount <= OPPONENT_DANGER_HAND && move.traits.attack) score += SCORE_ATTACK_WHEN_DANGER;

  if (difficulty === 'hard' && face.color !== 'wild' && likelyHeldColors(view).has(face.color)) {
    score += SCORE_AVOID_KNOWN_COLOR;
  }
  return score;
}

export function createBot(difficulty: BotDifficulty): Bot {
  const unoForgetChance = UNO_FORGET_CHANCE[difficulty];

  function decide(view: PublicView, legal: readonly LegalMove[], rng: Rng): { readonly action: Action; readonly rng: Rng } {
    const me: PlayerId = view.me;

    if (view.phase === 'choosing_color') {
      if (difficulty === 'easy') {
        const p = pick(COLORS, rng);
        return { action: { type: 'CHOOSE_COLOR', player: me, color: p.item }, rng: p.rng };
      }
      return { action: { type: 'CHOOSE_COLOR', player: me, color: bestColor(view.myHand) }, rng };
    }

    if (view.phase === 'challenge_window' && view.draw4Challenge?.target === me) {
      const thrower = view.players.find((p) => p.id === view.draw4Challenge!.player)!;
      const challenge = thrower.handCount <= CHALLENGE_HAND_THRESHOLD[difficulty];
      return { action: { type: challenge ? 'CHALLENGE_DRAW4' : 'ACCEPT_DRAW4', player: me }, rng };
    }

    // Catch an opponent who forgot UNO (all difficulties; the forget chance is on the *caller*).
    if (view.unoVulnerable && view.unoVulnerable !== me) {
      return { action: { type: 'CATCH_UNO', player: me, target: view.unoVulnerable }, rng };
    }

    // Say UNO before playing the second-to-last card, unless we "forget".
    const self = view.players.find((p) => p.id === me)!;
    if (view.myHand.length === 2 && !self.calledUno && legal.length > 0) {
      const r = rng.next();
      if (r.value >= unoForgetChance) {
        return { action: { type: 'CALL_UNO', player: me }, rng: r.rng };
      }
      rng = r.rng;
    }

    if (legal.length === 0) {
      return view.drawnCard !== undefined
        ? { action: { type: 'PASS', player: me }, rng }
        : { action: { type: 'DRAW_CARD', player: me }, rng };
    }

    let chosen: LegalMove;
    let nextRng = rng;
    if (difficulty === 'easy') {
      const p = pick(legal, rng);
      chosen = p.item;
      nextRng = p.rng;
    } else {
      chosen = legal.reduce((best, m) => {
        const a = scoreMove(m, view.myHand.find((c) => c.id === m.card)!.front, view.myHand, view, difficulty);
        const b = scoreMove(best, view.myHand.find((c) => c.id === best.card)!.front, view.myHand, view, difficulty);
        return a > b ? m : best;
      }, legal[0]!);
    }

    const action: Action = chosen.requiresColor
      ? { type: 'PLAY_CARD', player: me, card: chosen.card, chosenColor: difficulty === 'easy' ? pick(COLORS, nextRng).item : bestColor(view.myHand.filter((c) => c.id !== chosen.card)) }
      : { type: 'PLAY_CARD', player: me, card: chosen.card };
    return { action, rng: nextRng };
  }

  return { difficulty, decide, unoForgetChance };
}
