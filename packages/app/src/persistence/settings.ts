import { MAX_PLAYERS, type BotDifficulty } from '@uno/engine';

const SETTINGS_KEY = 'uno.settings.v1';
const STATS_KEY = 'uno.stats.v1';

// One seat is always the human, so the engine's player cap bounds the bot count.
// Derived (not hard-coded) so a future MAX_PLAYERS change cannot desync the lobby.
const HUMAN_SEATS = 1;
export const MIN_OPPONENTS = 1;
export const MAX_OPPONENTS = MAX_PLAYERS - HUMAN_SEATS;
const DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'medium', 'hard'];

/**
 * The one difficulty default in the app (S-024). It is both the lobby's starting
 * value and the fallback the bot driver / UNO window apply when a `PlayerConfig`
 * carries no `difficulty`. Those two used to be separate literals in `game/`, which
 * could drift apart — and because bot rolls are seeded, a drift would silently
 * change recorded replays. Changing this value is therefore replay-affecting.
 */
export const DEFAULT_BOT_DIFFICULTY: BotDifficulty = 'medium';

export interface Settings {
    readonly opponents: 1 | 2 | 3;
    readonly difficulty: BotDifficulty;
    readonly unoCallWindowMs: number;
}

export interface Stats {
    readonly gamesPlayed: number;
    readonly gamesWon: number;
    readonly roundsWon: number;
}

export const DEFAULT_SETTINGS: Settings = {
    opponents: 3,
    difficulty: DEFAULT_BOT_DIFFICULTY,
    unoCallWindowMs: 2000,
};
const DEFAULT_STATS: Stats = { gamesPlayed: 0, gamesWon: 0, roundsWon: 0 };

function readRaw(key: string): unknown {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return undefined;
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Settings validation (C-002): localStorage is user-editable, so every field
// is checked individually and falls back to its default when out of contract.
// Feeding an unchecked value into the engine made START_GAME reject and the
// HUD crash on an empty players array.
// ---------------------------------------------------------------------------

function isOpponents(value: unknown): value is Settings['opponents'] {
    return (
        Number.isInteger(value) &&
        (value as number) >= MIN_OPPONENTS &&
        (value as number) <= MAX_OPPONENTS
    );
}

function isDifficulty(value: unknown): value is BotDifficulty {
    return DIFFICULTIES.includes(value as BotDifficulty);
}

function isUnoCallWindowMs(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0;
}

function sanitiseSettings(value: unknown): Settings {
    if (!isRecord(value)) return DEFAULT_SETTINGS;
    return {
        opponents: isOpponents(value.opponents) ? value.opponents : DEFAULT_SETTINGS.opponents,
        difficulty: isDifficulty(value.difficulty) ? value.difficulty : DEFAULT_SETTINGS.difficulty,
        unoCallWindowMs: isUnoCallWindowMs(value.unoCallWindowMs)
            ? value.unoCallWindowMs
            : DEFAULT_SETTINGS.unoCallWindowMs,
    };
}

function isCount(value: unknown): value is number {
    return Number.isInteger(value) && (value as number) >= 0;
}

function sanitiseStats(value: unknown): Stats {
    if (!isRecord(value)) return DEFAULT_STATS;
    return {
        gamesPlayed: isCount(value.gamesPlayed) ? value.gamesPlayed : DEFAULT_STATS.gamesPlayed,
        gamesWon: isCount(value.gamesWon) ? value.gamesWon : DEFAULT_STATS.gamesWon,
        roundsWon: isCount(value.roundsWon) ? value.roundsWon : DEFAULT_STATS.roundsWon,
    };
}

function write(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        /* storage unavailable — settings are per-session only */
    }
}

export const loadSettings = (): Settings => sanitiseSettings(readRaw(SETTINGS_KEY));
export const saveSettings = (s: Settings): void => write(SETTINGS_KEY, s);
export const loadStats = (): Stats => sanitiseStats(readRaw(STATS_KEY));
export const saveStats = (s: Stats): void => write(STATS_KEY, s);
