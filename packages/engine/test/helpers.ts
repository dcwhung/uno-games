import { engine } from '../src';
import type {
    Action,
    ApplyResult,
    Card,
    CardColor,
    CardFace,
    CardId,
    CardKind,
    GameEvent,
    GameState,
    PlayerConfig,
    PlayerId,
    PlayerState,
    RuleConfig,
} from '../src';
import { OFFICIAL_HOUSE_RULES, TARGET_SCORE } from '../src';

export const P = (n: number) => `p${n}` as PlayerId;
export const DEFAULT_SEED = 42;

export const CONFIG: RuleConfig = {
    variant: 'classic',
    houseRules: OFFICIAL_HOUSE_RULES,
    targetScore: TARGET_SCORE,
    unoCallWindowMs: 0,
};

export function players(n: number): PlayerConfig[] {
    return Array.from({ length: n }, (_, i) => ({
        id: P(i),
        name: `Player ${i}`,
        kind: i === 0 ? 'human' : 'bot',
    }));
}

/** Lobby → round 1 dealt and in play. */
export function newGame(n = 4, seed = DEFAULT_SEED): { state: GameState; events: GameEvent[] } {
    let s = engine.createInitialState(CONFIG, seed);
    const events: GameEvent[] = [];
    for (const a of [
        { type: 'START_GAME', players: players(n) },
        { type: 'START_ROUND' },
    ] as Action[]) {
        const r = engine.apply(s, a);
        s = r.state;
        events.push(...r.events);
    }
    return { state: s, events };
}

export interface FaceSpec {
    color: CardColor | 'wild';
    kind: CardKind;
    value?: number;
}

/**
 * Rebuild hands / top card from face specs so a test can set up an exact
 * position. Cards are pulled from the round's deck; everything else goes to
 * the draw pile.
 */
export function rig(
    base: GameState,
    opts: {
        hands: Partial<Record<PlayerId, FaceSpec[]>>;
        top: FaceSpec;
        activeColor?: CardColor;
        currentPlayer?: PlayerId;
        direction?: 1 | -1;
        drawPileSize?: number;
    },
): GameState {
    const used = new Set<CardId>();
    const all = Object.values(base.cards);

    const take = (spec: FaceSpec): CardId => {
        const c = all.find(
            (x) =>
                !used.has(x.id) &&
                x.front.color === spec.color &&
                x.front.kind === spec.kind &&
                (spec.value === undefined || x.front.value === spec.value),
        );
        if (!c) throw new Error(`No unused card matching ${JSON.stringify(spec)}`);
        used.add(c.id);
        return c.id;
    };

    const top = take(opts.top);
    const players = base.players.map((p) => ({
        ...p,
        hand: (opts.hands[p.id] ?? []).map(take),
        calledUno: false,
    }));
    let rest = all.map((c) => c.id).filter((id) => !used.has(id));
    if (opts.drawPileSize !== undefined) rest = rest.slice(0, opts.drawPileSize);
    const topFace = faceOf(base, top);

    return {
        ...base,
        phase: 'playing',
        players,
        discardPile: [top],
        drawPile: rest,
        activeColor: opts.activeColor ?? (topFace.color === 'wild' ? 'red' : topFace.color),
        currentPlayer: opts.currentPlayer ?? P(0),
        direction: opts.direction ?? 1,
        pendingDraw: undefined,
        unoVulnerable: undefined,
        drawnCard: undefined,
        draw4Challenge: undefined,
        openingWild: false,
    };
}

// ---------------------------------------------------------------------------
// Lookups (W-009)
//
// `noUncheckedIndexedAccess` types every indexed read as `T | undefined`. These
// throw with what was being looked for so a spec that sets up the wrong position
// fails on the setup, not many lines later on a confusing undefined — and so no
// spec needs a `!`. Same pattern as app/src/test/fixtures.ts (S-045).
// ---------------------------------------------------------------------------

/** The seat with this id; throws when the table has no such player. */
export function seatOf(state: GameState, id: PlayerId): PlayerState {
    const player = state.players.find((p) => p.id === id);
    if (!player) throw new Error(`player ${id} not in state`);
    return player;
}

/** The seat at this index; throws when the table is shorter. */
export function seatAt(state: GameState, index: number): PlayerState {
    const player = state.players[index];
    if (!player) throw new Error(`no seat at index ${index} of ${state.players.length}`);
    return player;
}

export function hand(state: GameState, id: PlayerId): readonly CardId[] {
    return seatOf(state, id).hand;
}

/** The card at `index` of the player's hand; throws when the hand is shorter. */
export function cardAt(state: GameState, id: PlayerId, index: number): CardId {
    const card = hand(state, id)[index];
    if (!card) throw new Error(`player ${id} has no card at index ${index}`);
    return card;
}

export function firstCard(state: GameState, id: PlayerId): CardId {
    return cardAt(state, id, 0);
}

/** The card with this id; throws when it is not part of the round's deck. */
export function cardOf(state: GameState, id: CardId): Card {
    const card = state.cards[id];
    if (!card) throw new Error(`card ${id} not in state`);
    return card;
}

export function faceOf(state: GameState, id: CardId): CardFace {
    return cardOf(state, id).front;
}

/**
 * A card still in the draw pile whose front matches `matches`. Throws naming
 * `what` so a rig that exhausted the deck fails on the setup, not the assertion.
 */
export function findInDrawPile(
    state: GameState,
    what: string,
    matches: (face: CardFace) => boolean,
): CardId {
    const id = state.drawPile.find((cardId) => matches(faceOf(state, cardId)));
    if (!id) throw new Error(`no ${what} left in the draw pile`);
    return id;
}

/** The opening card: the bottom of the discard pile. Throws when nothing was flipped. */
export function openingCard(state: GameState): CardId {
    const [opening] = state.discardPile;
    if (!opening) throw new Error('discard pile is empty');
    return opening;
}

export function types(r: ApplyResult): string[] {
    return r.events.map((e) => e.type);
}

export function play(
    state: GameState,
    player: PlayerId,
    card: CardId,
    chosenColor?: CardColor,
): ApplyResult {
    return engine.apply(
        state,
        chosenColor
            ? { type: 'PLAY_CARD', player, card, chosenColor }
            : { type: 'PLAY_CARD', player, card },
    );
}
