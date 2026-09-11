/**
 * @uno/engine — core type design (Milestone 1)
 *
 * Pure TypeScript. Zero React / DOM dependencies.
 * Everything here is data; behaviour lives in reducer.ts and rules/*.
 *
 * Design principles:
 *  - Event-sourced: apply(state, action) → { state, events }.
 *  - Deterministic: all randomness comes from `Rng`, seeded, so a game
 *    can be replayed from (seed + actions[]).
 *  - Variant-agnostic core: anything Classic-specific is expressed via
 *    the RulePlugin interface so Flip / No Mercy / Liar etc. plug in.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const INITIAL_HAND_SIZE = 7;
export const TARGET_SCORE = 500;

export const CARD_POINTS = {
  NUMBER: 'face',   // face value
  ACTION: 20,       // Skip / Reverse / Draw Two
  WILD: 50,         // Wild / Wild Draw Four
} as const;

export const PENALTY = {
  MISSED_UNO_CALL: 2,
  FAILED_CHALLENGE: 6,   // challenger loses: original 4 + 2
  SUCCESSFUL_CHALLENGE: 4, // +4 player caught: draws 4 instead
} as const;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export type PlayerId = string & { readonly __brand: 'PlayerId' };
export type CardId = string & { readonly __brand: 'CardId' };
export type Seed = number;

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export type CardColor = 'red' | 'yellow' | 'green' | 'blue';
export type WildColor = 'wild';

/** Kinds shared by Classic. Variants extend via `CardKindExt`. */
export type CoreCardKind =
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild_draw4';

/**
 * Extension point for variant-specific kinds
 * (e.g. 'draw6', 'draw10', 'skip_all', 'discard_all', 'flip', 'reverse_draw').
 * Variants declare their own literal union and cast through RulePlugin<K>.
 */
export type CardKindExt = string & { readonly __ext?: never };

export type CardKind = CoreCardKind | CardKindExt;

export interface CardFace {
  readonly color: CardColor | WildColor;
  readonly kind: CardKind;
  /** 0–9 for 'number'; undefined otherwise. */
  readonly value?: number;
}

/**
 * A physical card. `back` exists for double-sided variants (Flip).
 * For single-sided variants `back` is undefined and `activeSide` is always 'front'.
 */
export interface Card {
  readonly id: CardId;
  readonly front: CardFace;
  readonly back?: CardFace;
}

export type CardSide = 'front' | 'back';

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export type PlayerKind = 'human' | 'bot';
export type BotDifficulty = 'easy' | 'medium' | 'hard';

export interface PlayerConfig {
  readonly id: PlayerId;
  readonly name: string;
  readonly kind: PlayerKind;
  readonly difficulty?: BotDifficulty; // bots only
  readonly team?: number;             // Teams variant only
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly hand: readonly CardId[];
  /** True once the player has declared UNO for the current 1-card state. */
  readonly calledUno: boolean;
  readonly score: number;            // cumulative across rounds (500 target)
}

// ---------------------------------------------------------------------------
// Rules configuration (official defaults + House Rules toggles)
// ---------------------------------------------------------------------------

export interface HouseRules {
  readonly stacking: boolean;        // +2 on +2, +4 on +4 (official: false)
  readonly jumpIn: boolean;          // identical card out of turn (official: false)
  readonly sevenZero: boolean;       // 7 swaps, 0 rotates (official: false)
  readonly forcePlay: boolean;       // must play drawn card if legal (official: false)
}

export const OFFICIAL_HOUSE_RULES: HouseRules = {
  stacking: false,
  jumpIn: false,
  sevenZero: false,
  forcePlay: false,
};

export interface RuleConfig {
  readonly variant: VariantId;
  readonly houseRules: HouseRules;
  readonly targetScore: number;      // TARGET_SCORE by default
  /** Milliseconds the human has to press UNO; 0 = auto-call on their behalf, no window and no catch roll. */
  readonly unoCallWindowMs: number;
}

export type VariantId =
  | 'classic'
  | 'no_mercy'
  | 'flex'
  | 'zero'
  | 'teams'
  | 'liar'
  | 'all_wild'
  | 'flip';
// DOS and O'NO 99 are separate engines, not VariantIds.

// ---------------------------------------------------------------------------
// Game state
// ---------------------------------------------------------------------------

export type Direction = 1 | -1;

export type Phase =
  | 'lobby'
  | 'dealing'
  | 'playing'
  | 'choosing_color'      // after a Wild is played, awaiting colour
  | 'challenge_window'    // after Wild Draw Four, next player may challenge
  | 'round_over'
  | 'game_over';

export interface PendingDraw {
  readonly amount: number;
  readonly source: CardId;
}

export interface Draw4Challenge {
  /** Who played the Wild Draw Four. */
  readonly player: PlayerId;
  /** Who must accept or challenge. */
  readonly target: PlayerId;
  /** Colour in force before the +4 was played. */
  readonly priorColor: CardColor;
  /** True = the play was illegal (player held a matching-colour card). */
  readonly wasBluff: boolean;
}

/** `wasBluff` is derived from the thrower's hidden hand, so it never leaves the engine (AU-006). */
export type PublicDraw4Challenge = Omit<Draw4Challenge, 'wasBluff'>;

export interface GameState {
  readonly config: RuleConfig;
  readonly seed: Seed;
  /** Monotonic counter; increments per applied action. Used for RNG + replay. */
  readonly tick: number;

  readonly phase: Phase;
  readonly players: readonly PlayerState[];
  readonly playerConfigs: readonly PlayerConfig[];
  readonly currentPlayer: PlayerId;
  readonly direction: Direction;

  /** All cards by id. Hands / piles reference ids only. */
  readonly cards: Readonly<Record<CardId, Card>>;
  readonly drawPile: readonly CardId[];
  readonly discardPile: readonly CardId[];   // last element = top
  readonly activeSide: CardSide;             // Flip: which side is face-up
  /** Colour in force (set by Wild choice, else top card colour). */
  readonly activeColor: CardColor;

  /** Accumulated draw penalty awaiting resolution (stacking / +4 challenge). */
  readonly pendingDraw?: PendingDraw | undefined;
  /** Player who may still be caught for a missed UNO call. */
  readonly unoVulnerable?: PlayerId | undefined;
  /** Card drawn this turn; only it may be played, or the player passes. */
  readonly drawnCard?: CardId | undefined;
  /** Context for the Wild Draw Four challenge window. */
  readonly draw4Challenge?: Draw4Challenge | undefined;
  /** True while the first player is choosing a colour for an opening Wild. */
  readonly openingWild?: boolean | undefined;

  readonly round: number;
  readonly roundWinner?: PlayerId | undefined;
  readonly gameWinner?: PlayerId | undefined;

  /** Opaque per-variant scratch (e.g. Liar bluff state). Serialisable. */
  readonly variantState?: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Actions (inputs — what a player *attempts*)
// ---------------------------------------------------------------------------

export type Action =
  | { readonly type: 'START_GAME'; readonly players: readonly PlayerConfig[] }
  | { readonly type: 'START_ROUND' }
  | { readonly type: 'PLAY_CARD'; readonly player: PlayerId; readonly card: CardId; readonly chosenColor?: CardColor }
  | { readonly type: 'DRAW_CARD'; readonly player: PlayerId }
  | { readonly type: 'PASS'; readonly player: PlayerId }          // after drawing a non-playable card
  | { readonly type: 'CHOOSE_COLOR'; readonly player: PlayerId; readonly color: CardColor }
  | { readonly type: 'CALL_UNO'; readonly player: PlayerId }
  | { readonly type: 'CATCH_UNO'; readonly player: PlayerId; readonly target: PlayerId }
  | { readonly type: 'CHALLENGE_DRAW4'; readonly player: PlayerId }
  | { readonly type: 'ACCEPT_DRAW4'; readonly player: PlayerId }
  | { readonly type: 'TIMEOUT'; readonly player: PlayerId }        // UNO window expired
  | { readonly type: 'VARIANT'; readonly player: PlayerId; readonly payload: unknown }; // variant-specific

export type ActionType = Action['type'];

// ---------------------------------------------------------------------------
// Events (outputs — what *happened*; the 3D layer animates these)
// ---------------------------------------------------------------------------

export type GameEvent =
  | { readonly type: 'GameStarted'; readonly players: readonly PlayerId[] }
  | { readonly type: 'RoundStarted'; readonly round: number; readonly dealer: PlayerId }
  | { readonly type: 'CardsDealt'; readonly player: PlayerId; readonly cards: readonly CardId[] }
  | { readonly type: 'DiscardStarted'; readonly card: CardId }
  | { readonly type: 'CardPlayed'; readonly player: PlayerId; readonly card: CardId }
  | { readonly type: 'CardDrawn'; readonly player: PlayerId; readonly cards: readonly CardId[]; readonly reason: DrawReason }
  | { readonly type: 'DrawPileReshuffled'; readonly count: number }
  | { readonly type: 'ColorChosen'; readonly player: PlayerId; readonly color: CardColor }
  | { readonly type: 'DirectionReversed'; readonly direction: Direction }
  | { readonly type: 'TurnSkipped'; readonly player: PlayerId }
  | { readonly type: 'TurnChanged'; readonly player: PlayerId }
  | { readonly type: 'UnoCalled'; readonly player: PlayerId }
  | { readonly type: 'UnoCaught'; readonly player: PlayerId; readonly by: PlayerId }
  | { readonly type: 'Draw4Challenged'; readonly by: PlayerId; readonly against: PlayerId; readonly succeeded: boolean }
  | { readonly type: 'SideFlipped'; readonly side: CardSide }   // Flip
  | { readonly type: 'RoundEnded'; readonly winner: PlayerId; readonly points: number; readonly scores: Readonly<Record<PlayerId, number>> }
  | { readonly type: 'GameEnded'; readonly winner: PlayerId }
  | { readonly type: 'ActionRejected'; readonly action: Action; readonly reason: RejectReason }
  | { readonly type: 'Variant'; readonly name: string; readonly payload: unknown };

export type DrawReason = 'turn' | 'penalty' | 'draw2' | 'draw4' | 'uno_missed' | 'challenge';

export type RejectReason =
  | 'not_your_turn'
  | 'card_not_in_hand'
  | 'illegal_card'
  | 'wrong_phase'
  | 'color_required'
  | 'no_uno_to_catch'
  | 'already_called'
  | 'variant_rule';

export interface ApplyResult {
  readonly state: GameState;
  readonly events: readonly GameEvent[];
}

// ---------------------------------------------------------------------------
// RNG (seeded, pure)
// ---------------------------------------------------------------------------

export interface Rng {
  /** Returns [0, 1) and the next Rng — never mutates. */
  next(): { readonly value: number; readonly rng: Rng };
  shuffle<T>(items: readonly T[]): { readonly items: readonly T[]; readonly rng: Rng };
}

// ---------------------------------------------------------------------------
// Rule plugin — what a variant must provide
// ---------------------------------------------------------------------------

export interface LegalMove {
  readonly card: CardId;
  /** Wild cards need a colour; the bot / UI fills this in. */
  readonly requiresColor: boolean;
}

export interface RulePlugin {
  readonly id: VariantId;
  readonly displayNameKey: string;                 // i18n key; theme maps to "UNO Flip" etc.
  readonly supportedHouseRules: readonly (keyof HouseRules)[];

  /** Build the full deck for this variant. Deterministic given rng. */
  buildDeck(rng: Rng): { readonly cards: readonly Card[]; readonly rng: Rng };

  /** Can `card` be played on the current state by `player`? */
  isLegal(state: GameState, player: PlayerId, card: CardId): boolean;

  /** Effects when a card lands. Returns state delta + events. Core handles turn advance. */
  onCardPlayed(state: GameState, player: PlayerId, card: CardId, chosenColor?: CardColor): ApplyResult;

  /**
   * Runs each time the reducer hands the turn to `player` (after TurnChanged).
   * Stacking resolution / mercy checks live here. See reducer.ts header for the contract.
   */
  onTurnStart?(state: GameState, player: PlayerId): ApplyResult;

  /** Points a card is worth when left in a losing hand at round end. */
  cardPoints(card: Card, side: CardSide): number;

  /** Handle VARIANT actions (Liar bluff calls, Flex choices, etc.). */
  onVariantAction?(state: GameState, action: Extract<Action, { type: 'VARIANT' }>): ApplyResult;

  /** Optional override, e.g. Teams: round ends when either teammate empties. */
  isRoundOver?(state: GameState): PlayerId | undefined;
}

// ---------------------------------------------------------------------------
// Public view — what a bot (or remote client) is allowed to see
// ---------------------------------------------------------------------------

export interface PublicPlayerView {
  readonly id: PlayerId;
  readonly handCount: number;
  readonly calledUno: boolean;
  readonly score: number;
}

export interface PublicView {
  readonly me: PlayerId;
  readonly myHand: readonly Card[];
  readonly players: readonly PublicPlayerView[];
  readonly currentPlayer: PlayerId;
  readonly direction: Direction;
  readonly topCard: Card | undefined;
  readonly activeColor: CardColor;
  readonly activeSide: CardSide;
  readonly drawPileCount: number;
  readonly discardHistory: readonly Card[];   // visible to all; Hard bots use it
  readonly phase: Phase;
  readonly pendingDraw?: PendingDraw;
  readonly unoVulnerable?: PlayerId;
  readonly drawnCard?: CardId;
  readonly draw4Challenge?: PublicDraw4Challenge;
  readonly houseRules: HouseRules;
}

// ---------------------------------------------------------------------------
// Bot interface
// ---------------------------------------------------------------------------

export interface Bot {
  readonly difficulty: BotDifficulty;
  /** Decide the next action from public information only. Pure given rng. */
  decide(view: PublicView, legal: readonly LegalMove[], rng: Rng): { readonly action: Action; readonly rng: Rng };
  /** Probability [0,1] this bot forgets to call UNO — difficulty-driven. */
  readonly unoForgetChance: number;
}

// ---------------------------------------------------------------------------
// Engine entry points (implemented in reducer.ts)
// ---------------------------------------------------------------------------

export interface Engine {
  createInitialState(config: RuleConfig, seed: Seed): GameState;
  apply(state: GameState, action: Action): ApplyResult;
  getLegalMoves(state: GameState, player: PlayerId): readonly LegalMove[];
  getPublicView(state: GameState, player: PlayerId): PublicView;
  /** Rebuild state from seed + action log (resume / debug). */
  replay(config: RuleConfig, seed: Seed, actions: readonly Action[]): GameState;
}
