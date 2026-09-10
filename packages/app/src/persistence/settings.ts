import type { BotDifficulty } from '@uno/engine';

const SETTINGS_KEY = 'uno.settings.v1';
const STATS_KEY = 'uno.stats.v1';

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

export const DEFAULT_SETTINGS: Settings = { opponents: 3, difficulty: 'medium', unoCallWindowMs: 2000 };
const DEFAULT_STATS: Stats = { gamesPlayed: 0, gamesWon: 0, roundsWon: 0 };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — settings are per-session only */
  }
}

export const loadSettings = (): Settings => read(SETTINGS_KEY, DEFAULT_SETTINGS);
export const saveSettings = (s: Settings): void => write(SETTINGS_KEY, s);
export const loadStats = (): Stats => read(STATS_KEY, DEFAULT_STATS);
export const saveStats = (s: Stats): void => write(STATS_KEY, s);
