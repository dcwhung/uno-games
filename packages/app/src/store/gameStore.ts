/**
 * gameStore.ts — Zustand slice wrapping the pure engine.
 *
 * Both the React UI and the R3F scene subscribe here. `dispatch` is the only
 * way state changes; every action is appended to `actionLog` so the game can
 * be saved / replayed from (seed + actionLog).
 */
import { create } from 'zustand';
import { engine, OFFICIAL_HOUSE_RULES, TARGET_SCORE } from '@uno/engine';
import type { Action, GameEvent, GameState, PlayerConfig, PlayerId, RuleConfig, Seed } from '@uno/engine';
import type { Settings } from '../persistence/settings';

export const HUMAN_ID = 'human' as PlayerId;
const BOT_NAMES = ['Momo', 'Kiki', 'Taro'] as const;

/** Events are numbered so the scene / toast layer can consume them idempotently. */
export interface StampedEvent {
  readonly seq: number;
  readonly event: GameEvent;
}

export interface GameSlice {
  readonly state: GameState | null;
  readonly seed: Seed;
  readonly actionLog: readonly Action[];
  readonly events: readonly StampedEvent[];
  readonly selectedCard: string | null;

  newGame(settings: Settings): void;
  dispatch(action: Action): readonly GameEvent[];
  select(cardId: string | null): void;
  reset(): void;
}

const MAX_RETAINED_EVENTS = 200;
let eventSeq = 0;

function buildPlayers(settings: Settings): PlayerConfig[] {
  const bots: PlayerConfig[] = Array.from({ length: settings.opponents }, (_, i) => ({
    id: `bot${i}` as PlayerId,
    name: BOT_NAMES[i] ?? `Bot ${i}`,
    kind: 'bot',
    difficulty: settings.difficulty,
  }));
  return [{ id: HUMAN_ID, name: 'You', kind: 'human' }, ...bots];
}

export const useGameStore = create<GameSlice>((set, get) => ({
  state: null,
  seed: 0,
  actionLog: [],
  events: [],
  selectedCard: null,

  newGame(settings) {
    const seed = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    const config: RuleConfig = {
      variant: 'classic',
      houseRules: OFFICIAL_HOUSE_RULES,
      targetScore: TARGET_SCORE,
      unoCallWindowMs: settings.unoCallWindowMs,
    };
    set({ state: engine.createInitialState(config, seed), seed, actionLog: [], events: [], selectedCard: null });
    get().dispatch({ type: 'START_GAME', players: buildPlayers(settings) });
    get().dispatch({ type: 'START_ROUND' });
  },

  dispatch(action) {
    const current = get().state;
    if (!current) return [];
    const { state, events } = engine.apply(current, action);
    const stamped = events.map((event) => ({ seq: ++eventSeq, event }));
    set((s) => ({
      state,
      actionLog: [...s.actionLog, action],
      events: [...s.events, ...stamped].slice(-MAX_RETAINED_EVENTS),
      selectedCard: null,
    }));
    return events;
  },

  select(cardId) {
    set({ selectedCard: cardId });
  },

  reset() {
    set({ state: null, actionLog: [], events: [], selectedCard: null });
  },
}));

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectState = (s: GameSlice) => s.state;
export const selectIsHumanTurn = (s: GameSlice) =>
  s.state?.phase === 'playing' && s.state.currentPlayer === HUMAN_ID;

export function playerName(state: GameState, id: PlayerId): string {
  return state.playerConfigs.find((p) => p.id === id)?.name ?? id;
}

export function legalMovesForHuman(state: GameState) {
  return engine.getLegalMoves(state, HUMAN_ID);
}
