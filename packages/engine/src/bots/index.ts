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
import { CARD_COLORS } from '../types';
import { canCallUno, elementAt, invariant, UNO_CALL_MAX_HAND } from '../core';

// A tuple, not `readonly CardColor[]`: `COLORS[0]` then reads as a colour rather
// than `CardColor | undefined`, so `bestColor`'s reduce needs no assertion.
const COLORS = CARD_COLORS;

/** Seat in the public view; every id a bot looks up came out of the view itself. */
type PublicSeat = PublicView['players'][number];

const UNO_FORGET_CHANCE: Readonly<Record<BotDifficulty, number>> = {
    easy: 0.5,
    medium: 0.2,
    hard: 0.05,
};

/** Challenge a +4 when the player who threw it has at most this many cards. */
const CHALLENGE_HAND_THRESHOLD: Readonly<Record<BotDifficulty, number>> = {
    easy: 0, // never challenges
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

/** Uniform choice. Callers only ever pass a non-empty list, and rng.next() is < 1. */
function pick<T>(items: readonly T[], rng: Rng): { readonly item: T; readonly rng: Rng } {
    const r = rng.next();
    const index = Math.floor(r.value * items.length);
    return { item: elementAt(items, index, 'bot picks from a non-empty list'), rng: r.rng };
}

/** The seat with this id; `id` always comes from the view's own player list. */
function seatOf(view: PublicView, id: PlayerId): PublicSeat {
    return invariant(
        view.players.find((p) => p.id === id),
        `player ${id} is seated at the table`,
    );
}

/** The face of a legal move's card; legal moves are built from this very hand. */
function faceOfMove(view: PublicView, move: LegalMove): CardFace {
    return invariant(
        view.myHand.find((c) => c.id === move.card),
        `legal move ${move.card} is in the bot's own hand`,
    ).front;
}

function colorCounts(hand: readonly Card[]): Record<CardColor, number> {
    const counts: Record<CardColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const c of hand) if (c.front.color !== 'wild') counts[c.front.color]++;
    return counts;
}

function bestColor(hand: readonly Card[]): CardColor {
    const counts = colorCounts(hand);
    return COLORS.reduce<CardColor>((best, c) => (counts[c] > counts[best] ? c : best), COLORS[0]);
}

function nextOpponent(view: PublicView): PublicSeat {
    const n = view.players.length;
    const i = view.players.findIndex((p) => p.id === view.me);
    const seat = (((i + view.direction) % n) + n) % n;
    return elementAt(view.players, seat, 'next seat wraps within the table');
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

function scoreMove(
    move: LegalMove,
    face: CardFace,
    hand: readonly Card[],
    view: PublicView,
    difficulty: BotDifficulty,
): number {
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
    if (opp.handCount <= OPPONENT_DANGER_HAND && move.traits.attack)
        score += SCORE_ATTACK_WHEN_DANGER;

    if (difficulty === 'hard' && face.color !== 'wild' && likelyHeldColors(view).has(face.color)) {
        score += SCORE_AVOID_KNOWN_COLOR;
    }
    return score;
}

export function createBot(difficulty: BotDifficulty): Bot {
    const unoForgetChance = UNO_FORGET_CHANCE[difficulty];

    function decide(
        view: PublicView,
        legal: readonly LegalMove[],
        rng: Rng,
    ): { readonly action: Action; readonly rng: Rng } {
        const me: PlayerId = view.me;

        if (view.phase === 'choosing_color') {
            if (difficulty === 'easy') {
                const p = pick(COLORS, rng);
                return { action: { type: 'CHOOSE_COLOR', player: me, color: p.item }, rng: p.rng };
            }
            return {
                action: { type: 'CHOOSE_COLOR', player: me, color: bestColor(view.myHand) },
                rng,
            };
        }

        // Hoisted so the thrower lookup keeps the narrowing the `?.` gave us.
        const pending = view.draw4Challenge;
        if (view.phase === 'challenge_window' && pending?.target === me) {
            const thrower = seatOf(view, pending.player);
            const challenge = thrower.handCount <= CHALLENGE_HAND_THRESHOLD[difficulty];
            return {
                action: { type: challenge ? 'CHALLENGE_DRAW4' : 'ACCEPT_DRAW4', player: me },
                rng,
            };
        }

        // Catch an opponent who forgot UNO (all difficulties; the forget chance is on the *caller*).
        if (view.unoVulnerable && view.unoVulnerable !== me) {
            return { action: { type: 'CATCH_UNO', player: me, target: view.unoVulnerable }, rng };
        }

        // Strategy: say UNO at the earliest legal moment (right before playing the
        // second-to-last card), never as a late call — unless we "forget". The
        // legality itself comes from the engine rule (canCallUno), not from here.
        const self = seatOf(view, me);
        const aboutToGoDownToOne = view.myHand.length === UNO_CALL_MAX_HAND;
        if (aboutToGoDownToOne && canCallUno(self, view.phase) && legal.length > 0) {
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
            chosen = legal.reduce(
                (best, m) => {
                    const a = scoreMove(m, faceOfMove(view, m), view.myHand, view, difficulty);
                    const b = scoreMove(
                        best,
                        faceOfMove(view, best),
                        view.myHand,
                        view,
                        difficulty,
                    );
                    return a > b ? m : best;
                },
                elementAt(legal, 0, 'legal moves are non-empty here'),
            );
        }

        const action: Action = chosen.requiresColor
            ? {
                  type: 'PLAY_CARD',
                  player: me,
                  card: chosen.card,
                  chosenColor:
                      difficulty === 'easy'
                          ? pick(COLORS, nextRng).item
                          : bestColor(view.myHand.filter((c) => c.id !== chosen.card)),
              }
            : { type: 'PLAY_CARD', player: me, card: chosen.card };
        return { action, rng: nextRng };
    }

    return { difficulty, decide, unoForgetChance };
}
