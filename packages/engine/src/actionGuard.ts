/**
 * actionGuard.ts — shape validation for actions entering `apply` (CUI-0405).
 *
 * `Action` is a TypeScript union, which is a promise the compiler makes to
 * callers it can see. The values that actually reach `apply` need not keep it:
 * a replay log that has been through JSON (`JSON.stringify` deletes every key
 * whose value is `undefined`), a remote client, or a plain-JS caller can hand
 * us an unknown `type`, a missing `player`, or a `player` that is `null`, a
 * number, or an object. `apply` is pure and answers with an ActionRejected
 * event, so those fields are checked here, once, before any handler reads one.
 *
 * The rule for this file: treat the action as data of unknown shape. Never read
 * a field because the union says it is there, and never decide anything from
 * the *presence* of a key — `'player' in action` cannot tell a START_ROUND,
 * which has no actor by design, from a CATCH_UNO whose actor went missing.
 * What an action type carries is a property of the type, so that is where it is
 * written down.
 *
 * Shape only. Whose turn it is, what is in hand and what the variant allows
 * stay with the handlers, which reject with their own, more specific reasons.
 */
import { CARD_COLORS, MAX_PLAYERS, MIN_PLAYERS } from './types';
import type {
    Action,
    ActionType,
    BotDifficulty,
    CardColor,
    GameState,
    PlayerConfig,
    PlayerId,
    PlayerKind,
    RejectReason,
} from './types';

/**
 * Whether an action type names the player performing it, read off the union
 * itself (W-054). `Record<ActionType, boolean>` only forced the table to be
 * *complete* — `true` and `false` were interchangeable to the compiler, so a
 * typo or a bad merge could classify a `player`-bearing action as `false`, and
 * `actionShapeReason` would skip `isSeatedPlayer` on that one type: CUI-0405's
 * hole, reopened with a green build. Deriving each value from the member it
 * describes makes a wrong classification a type error, not a silent regression.
 */
type CarriesActorTable = {
    readonly [T in ActionType]: Extract<Action, { type: T }> extends { player: PlayerId }
        ? true
        : false;
};

/**
 * Every action type, mapped to whether it names the player performing it.
 * Still written out by hand on purpose: adding a member to the `Action` union
 * fails the build right here until the new type has been classified, which is
 * what keeps this table from drifting away from the union it describes.
 */
const CARRIES_ACTOR: CarriesActorTable = {
    // Table-level: nobody in particular performs these.
    START_GAME: false,
    START_ROUND: false,
    PLAY_CARD: true,
    DRAW_CARD: true,
    PASS: true,
    CHOOSE_COLOR: true,
    CALL_UNO: true,
    CATCH_UNO: true,
    CHALLENGE_DRAW4: true,
    ACCEPT_DRAW4: true,
    TIMEOUT: true,
    VARIANT: true,
};

const COLOR_NAMES: ReadonlySet<string> = new Set<string>(CARD_COLORS);

/**
 * The seat kinds and bot difficulties a roster may name. Local to this file on
 * purpose: these are the only runtime lists of either union inside the engine,
 * so there is nothing here to drift from — unlike the colours, which existed
 * twice and were hoisted to `types.ts` for that reason.
 */
const PLAYER_KINDS: ReadonlySet<string> = new Set<string>([
    'human',
    'bot',
] satisfies readonly PlayerKind[]);

const BOT_DIFFICULTIES: ReadonlySet<string> = new Set<string>([
    'easy',
    'medium',
    'hard',
] satisfies readonly BotDifficulty[]);

/** Read a field off an action without pretending to know its type. */
function field(action: Action, name: string): unknown {
    return (action as Readonly<Record<string, unknown>>)[name];
}

/**
 * A seat at this table. The `typeof` is not redundant with the search: it says
 * that a non-string is wrong whatever the table holds, and it is what makes the
 * result safe to hand to `getPlayer`.
 */
export function isSeatedPlayer(state: GameState, value: unknown): value is PlayerId {
    return typeof value === 'string' && state.players.some((p) => p.id === value);
}

/**
 * An action type this engine knows. `Object.hasOwn`, not `in`: `in` answers
 * true for '__proto__', 'constructor' and 'toString', which are exactly the
 * strings a hostile or corrupted log is likeliest to carry.
 */
function isKnownActionType(value: unknown): value is ActionType {
    return typeof value === 'string' && Object.hasOwn(CARRIES_ACTOR, value);
}

function isCardColor(value: unknown): value is CardColor {
    return typeof value === 'string' && COLOR_NAMES.has(value);
}

function isPlayerKind(value: unknown): value is PlayerKind {
    return typeof value === 'string' && PLAYER_KINDS.has(value);
}

function isBotDifficulty(value: unknown): value is BotDifficulty {
    return typeof value === 'string' && BOT_DIFFICULTIES.has(value);
}

/**
 * A seat, checked against every field `PlayerConfig` declares — not only the
 * ones this package happens to read (W-056). `id` was the engine's own need;
 * the rest matter because START_GAME copies the whole object into
 * `state.playerConfigs`, and the app reads it from there: a `name` that is not
 * a string reaches React as a child, a `kind` that is not 'bot' stops the bot
 * driver from ever taking that seat's turn, and a `difficulty` outside the
 * union indexes the bot tables to `undefined`. A boundary vets what it
 * forwards, not only what it uses, so the rule for a new field is the rule
 * used here: check exactly what the type declares, and nothing more.
 */
function isPlayerConfig(value: unknown): value is PlayerConfig {
    if (typeof value !== 'object' || value === null) return false;
    const seat = value as Readonly<Record<string, unknown>>;
    return (
        typeof seat.id === 'string' &&
        typeof seat.name === 'string' &&
        isPlayerKind(seat.kind) &&
        (seat.difficulty === undefined || isBotDifficulty(seat.difficulty)) &&
        (seat.team === undefined || typeof seat.team === 'number')
    );
}

/** The roster and its dealer, or undefined when START_GAME did not carry a seatable table. */
export interface Roster {
    readonly players: readonly PlayerConfig[];
    readonly dealer: PlayerConfig;
}

/**
 * The table a START_GAME asks for, or undefined when it is not one. This is the
 * only actor-shaped field no entry check can vet against the state, because at
 * START_GAME there are no seats yet to compare against.
 *
 * Shape only: two seats sharing an id is a roster invariant rather than a
 * shape, and is tracked on its own (CUI-0408). This is where that check will
 * belong when it lands — there is no second entry point for a roster.
 */
export function validRoster(value: unknown): Roster | undefined {
    if (!Array.isArray(value)) return undefined;
    const seats: readonly unknown[] = value;
    if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS) return undefined;
    if (!seats.every(isPlayerConfig)) return undefined;
    const [dealer] = seats;
    // Unreachable for a roster that passed the size check; typed, not asserted.
    return dealer === undefined ? undefined : { players: seats, dealer };
}

/** CHOOSE_COLOR must name a colour; PLAY_CARD may, and then it has to be a real one. */
function colorIsUsable(type: ActionType, action: Action): boolean {
    if (type === 'CHOOSE_COLOR') return isCardColor(field(action, 'color'));
    if (type !== 'PLAY_CARD') return true;
    const chosen = field(action, 'chosenColor');
    return chosen === undefined || isCardColor(chosen);
}

/**
 * Why `apply` must refuse this action outright, or undefined when its shape is
 * sound enough for a handler to read.
 */
export function actionShapeReason(state: GameState, action: Action): RejectReason | undefined {
    const type = field(action, 'type');
    if (!isKnownActionType(type)) return 'unknown_action';
    if (CARRIES_ACTOR[type] && !isSeatedPlayer(state, field(action, 'player')))
        return 'unknown_player';
    if (!colorIsUsable(type, action)) return 'color_required';
    return undefined;
}
