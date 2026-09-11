// Shared spec fixtures for @uno/app (W-043). Not a spec itself: vitest only picks
// up `*.spec.ts`, and `src/test/**` is excluded from coverage in vitest.config.ts.
//
// Only the parts that were genuinely identical across specs live here. Spec-specific
// constants (golden seeds, alternate seeds, opponent counts) stay in their own file.
import { engine, OFFICIAL_HOUSE_RULES, TARGET_SCORE } from '@uno/engine';
import type {
    BotDifficulty,
    CardId,
    GameState,
    PlayerConfig,
    PlayerId,
    RuleConfig,
} from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';

/**
 * Round 1 reaches `playing` at every table size with this seed — that is the only
 * guarantee specs should lean on. The opening card itself is seat-count dependent,
 * so do NOT assume "7 cards each" or "bot0 leads" (CUI-0301):
 *
 * | Table | Opening card   | Hands           | Leads |
 * |-------|----------------|-----------------|-------|
 * | 2p    | blue 6         | 7 / 7           | bot0  |
 * | 3p    | yellow 2       | 7 / 7 / 7       | bot0  |
 * | 4p    | yellow Draw Two| 7 / 9 / 7 / 7   | bot1  |
 *
 * At 4 players the engine (correctly) makes bot0 draw two and skips it. All three
 * rows are asserted in `fixtures.spec.ts`, so this table cannot silently drift.
 */
export const SEED = 42;
export const UNO_WINDOW_MS = 2000;
export const DEFAULT_DIFFICULTY: BotDifficulty = 'medium';
export const DEFAULT_OPPONENT_COUNT = 2;

/** Seat ids the engine assigns to bots, in seat order. Tuple-typed so `BOT_IDS[0]` needs no `!`. */
export const BOT_IDS: readonly [PlayerId, PlayerId, PlayerId] = [
    'bot0' as PlayerId,
    'bot1' as PlayerId,
    'bot2' as PlayerId,
];

export function botId(index: number): PlayerId {
    return `bot${index}` as PlayerId;
}

export function baseConfig(unoCallWindowMs: number = UNO_WINDOW_MS): RuleConfig {
    return {
        variant: 'classic',
        houseRules: OFFICIAL_HOUSE_RULES,
        targetScore: TARGET_SCORE,
        unoCallWindowMs,
    };
}

export const CONFIG: RuleConfig = baseConfig();

/** Human in seat 0 followed by `opponentCount` bots of the same difficulty. */
export function playersFor(
    opponentCount: number,
    difficulty: BotDifficulty = DEFAULT_DIFFICULTY,
): PlayerConfig[] {
    const bots = Array.from({ length: opponentCount }, (_, i): PlayerConfig => ({
        id: botId(i),
        name: `Bot ${i}`,
        kind: 'bot',
        difficulty,
    }));
    return [{ id: HUMAN_ID, name: 'You', kind: 'human' }, ...bots];
}

export const DEFAULT_PLAYERS: PlayerConfig[] = playersFor(DEFAULT_OPPONENT_COUNT);

export interface DealtStateOptions {
    readonly players?: readonly PlayerConfig[];
    readonly seed?: number;
    readonly config?: RuleConfig;
}

/** Lobby → round 1 in play, built through the real engine so hands / piles are legal. */
export function dealtState({
    players = DEFAULT_PLAYERS,
    seed = SEED,
    config = CONFIG,
}: DealtStateOptions = {}): GameState {
    let s = engine.createInitialState(config, seed);
    s = engine.apply(s, { type: 'START_GAME', players }).state;
    return engine.apply(s, { type: 'START_ROUND' }).state;
}

/** The player's hand; throws instead of returning `undefined` so specs need no `!`. */
export function handOf(state: GameState, id: PlayerId): readonly CardId[] {
    const player = state.players.find((p) => p.id === id);
    if (!player) throw new Error(`player ${id} not in state`);
    return player.hand;
}

/** First card of the player's hand; throws when the hand is empty. */
export function firstCardOf(state: GameState, id: PlayerId): CardId {
    const [first] = handOf(state, id);
    if (!first) throw new Error(`player ${id} has no cards`);
    return first;
}

/** Top card of a pile (last element); throws when the pile is empty. */
export function topOf(pile: readonly CardId[]): CardId {
    const top = pile.at(-1);
    if (!top) throw new Error('pile is empty');
    return top;
}
