import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, MAX_OPPONENTS, loadSettings, loadStats } from './settings';
import type { Stats } from './settings';

const SETTINGS_KEY = 'uno.settings.v1';
const STATS_KEY = 'uno.stats.v1';

// Minimal in-memory Storage: vitest runs app specs in the node environment,
// so there is no real localStorage to stub — we install one on globalThis.
function createFakeStorage(): Storage {
    const data = new Map<string, string>();
    return {
        get length() {
            return data.size;
        },
        clear: () => data.clear(),
        getItem: (key) => data.get(key) ?? null,
        key: (index) => [...data.keys()][index] ?? null,
        removeItem: (key) => {
            data.delete(key);
        },
        setItem: (key, value) => {
            data.set(key, value);
        },
    };
}

function persistRaw(raw: string, key = SETTINGS_KEY): void {
    globalThis.localStorage.setItem(key, raw);
}

function persist(value: unknown, key = SETTINGS_KEY): void {
    persistRaw(JSON.stringify(value), key);
}

// Both loaders read the same localStorage, so the fake is installed once for
// every describe block in this file.
let originalStorage: Storage | undefined;

beforeEach(() => {
    originalStorage = globalThis.localStorage;
    Object.defineProperty(globalThis, 'localStorage', {
        value: createFakeStorage(),
        configurable: true,
        writable: true,
    });
});

afterEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
        value: originalStorage,
        configurable: true,
        writable: true,
    });
});

const VALID_SETTINGS = { opponents: 2, difficulty: 'hard', unoCallWindowMs: 1500 } as const;
const OUT_OF_RANGE_OPPONENTS = 99;
const UNKNOWN_DIFFICULTY = 'god';
const NEGATIVE_WINDOW_MS = -1;
const NON_INTEGER_WINDOW_MS = 12.5;

describe('loadSettings', () => {
    it('should return defaults when nothing is stored', () => {
        expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it('should return the stored settings when every field is valid', () => {
        persist(VALID_SETTINGS);

        expect(loadSettings()).toEqual(VALID_SETTINGS);
    });

    it('should return defaults when the stored value is not JSON', () => {
        persistRaw('{not json');

        expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it('should return defaults when the stored value is not an object', () => {
        persist([1, 2, 3]);

        expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it('should fall back only the missing fields when keys are absent', () => {
        persist({ difficulty: VALID_SETTINGS.difficulty });

        expect(loadSettings()).toEqual({
            ...DEFAULT_SETTINGS,
            difficulty: VALID_SETTINGS.difficulty,
        });
    });

    it('should fall back opponents when it exceeds the engine player cap', () => {
        persist({ ...VALID_SETTINGS, opponents: OUT_OF_RANGE_OPPONENTS });

        expect(loadSettings()).toEqual({
            ...VALID_SETTINGS,
            opponents: DEFAULT_SETTINGS.opponents,
        });
    });

    it('should fall back opponents when it is zero, fractional, or a string', () => {
        persist({ ...VALID_SETTINGS, opponents: 0 });
        expect(loadSettings().opponents).toBe(DEFAULT_SETTINGS.opponents);

        persist({ ...VALID_SETTINGS, opponents: 1.5 });
        expect(loadSettings().opponents).toBe(DEFAULT_SETTINGS.opponents);

        persist({ ...VALID_SETTINGS, opponents: '2' });
        expect(loadSettings().opponents).toBe(DEFAULT_SETTINGS.opponents);
    });

    it('should accept every opponent count up to MAX_OPPONENTS', () => {
        for (let n = 1; n <= MAX_OPPONENTS; n++) {
            persist({ ...VALID_SETTINGS, opponents: n });
            expect(loadSettings().opponents).toBe(n);
        }
    });

    it('should fall back difficulty when it is not a known level', () => {
        persist({ ...VALID_SETTINGS, difficulty: UNKNOWN_DIFFICULTY });

        expect(loadSettings()).toEqual({
            ...VALID_SETTINGS,
            difficulty: DEFAULT_SETTINGS.difficulty,
        });
    });

    it('should fall back unoCallWindowMs when it is negative, fractional, or not a number', () => {
        persist({ ...VALID_SETTINGS, unoCallWindowMs: NEGATIVE_WINDOW_MS });
        expect(loadSettings().unoCallWindowMs).toBe(DEFAULT_SETTINGS.unoCallWindowMs);

        persist({ ...VALID_SETTINGS, unoCallWindowMs: NON_INTEGER_WINDOW_MS });
        expect(loadSettings().unoCallWindowMs).toBe(DEFAULT_SETTINGS.unoCallWindowMs);

        // JSON has no Infinity/NaN literal, so a string is the realistic corrupt shape.
        persist({ ...VALID_SETTINGS, unoCallWindowMs: 'Infinity' });
        expect(loadSettings().unoCallWindowMs).toBe(DEFAULT_SETTINGS.unoCallWindowMs);
    });

    it('should accept a zero UNO window (instant catch)', () => {
        persist({ ...VALID_SETTINGS, unoCallWindowMs: 0 });

        expect(loadSettings().unoCallWindowMs).toBe(0);
    });

    it('should drop unknown keys instead of passing them through', () => {
        persist({ ...VALID_SETTINGS, extra: true });

        expect(loadSettings()).toEqual(VALID_SETTINGS);
    });
});

// ---------------------------------------------------------------------------
// W-012: stats sanitisation was added alongside C-002 but had no spec.
// ---------------------------------------------------------------------------

const DEFAULT_STATS: Stats = { gamesPlayed: 0, gamesWon: 0, roundsWon: 0 };
const VALID_STATS: Stats = { gamesPlayed: 12, gamesWon: 5, roundsWon: 17 };
const NEGATIVE_COUNT = -3;
const NON_INTEGER_COUNT = 2.5;
const STATS_KEYS = Object.keys(DEFAULT_STATS) as (keyof Stats)[];

function persistStats(value: unknown): void {
    persist(value, STATS_KEY);
}

describe('loadStats', () => {
    it('should return zeroed stats when nothing is stored', () => {
        expect(loadStats()).toEqual(DEFAULT_STATS);
    });

    it('should return the stored stats when every field is a non-negative integer', () => {
        persistStats(VALID_STATS);

        expect(loadStats()).toEqual(VALID_STATS);
    });

    it('should return zeroed stats when the stored value is not JSON', () => {
        persistRaw('{not json', STATS_KEY);

        expect(loadStats()).toEqual(DEFAULT_STATS);
    });

    it('should return zeroed stats when the stored value is not an object', () => {
        persistStats([1, 2, 3]);
        expect(loadStats()).toEqual(DEFAULT_STATS);

        persistStats(null);
        expect(loadStats()).toEqual(DEFAULT_STATS);
    });

    it('should fall back only the missing fields when keys are absent', () => {
        persistStats({ gamesWon: VALID_STATS.gamesWon });

        expect(loadStats()).toEqual({ ...DEFAULT_STATS, gamesWon: VALID_STATS.gamesWon });
    });

    it.each(STATS_KEYS)('should fall back %s when it is negative', (key) => {
        persistStats({ ...VALID_STATS, [key]: NEGATIVE_COUNT });

        expect(loadStats()).toEqual({ ...VALID_STATS, [key]: DEFAULT_STATS[key] });
    });

    it.each(STATS_KEYS)('should fall back %s when it is not an integer', (key) => {
        persistStats({ ...VALID_STATS, [key]: NON_INTEGER_COUNT });

        expect(loadStats()).toEqual({ ...VALID_STATS, [key]: DEFAULT_STATS[key] });
    });

    it.each(STATS_KEYS)('should fall back %s when it is a numeric string', (key) => {
        persistStats({ ...VALID_STATS, [key]: String(VALID_STATS[key]) });

        expect(loadStats()).toEqual({ ...VALID_STATS, [key]: DEFAULT_STATS[key] });
    });

    it('should accept zero counts', () => {
        persistStats(DEFAULT_STATS);

        expect(loadStats()).toEqual(DEFAULT_STATS);
    });

    it('should drop unknown keys instead of passing them through', () => {
        persistStats({ ...VALID_STATS, streak: 4 });

        expect(loadStats()).toEqual(VALID_STATS);
    });

    it('should read stats independently of the settings key', () => {
        persist(VALID_SETTINGS);

        expect(loadStats()).toEqual(DEFAULT_STATS);
    });
});
