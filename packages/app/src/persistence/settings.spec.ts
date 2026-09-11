import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS, MAX_OPPONENTS, loadSettings } from './settings';

const SETTINGS_KEY = 'uno.settings.v1';

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

function persistRaw(raw: string): void {
    globalThis.localStorage.setItem(SETTINGS_KEY, raw);
}

function persist(value: unknown): void {
    persistRaw(JSON.stringify(value));
}

const VALID_SETTINGS = { opponents: 2, difficulty: 'hard', unoCallWindowMs: 1500 } as const;
const OUT_OF_RANGE_OPPONENTS = 99;
const UNKNOWN_DIFFICULTY = 'god';
const NEGATIVE_WINDOW_MS = -1;
const NON_INTEGER_WINDOW_MS = 12.5;

describe('loadSettings', () => {
    let original: Storage | undefined;

    beforeEach(() => {
        original = globalThis.localStorage;
        Object.defineProperty(globalThis, 'localStorage', { value: createFakeStorage(), configurable: true, writable: true });
    });

    afterEach(() => {
        Object.defineProperty(globalThis, 'localStorage', { value: original, configurable: true, writable: true });
    });

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

        expect(loadSettings()).toEqual({ ...DEFAULT_SETTINGS, difficulty: VALID_SETTINGS.difficulty });
    });

    it('should fall back opponents when it exceeds the engine player cap', () => {
        persist({ ...VALID_SETTINGS, opponents: OUT_OF_RANGE_OPPONENTS });

        expect(loadSettings()).toEqual({ ...VALID_SETTINGS, opponents: DEFAULT_SETTINGS.opponents });
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

        expect(loadSettings()).toEqual({ ...VALID_SETTINGS, difficulty: DEFAULT_SETTINGS.difficulty });
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
