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
import { t } from '../i18n';
import type { Settings } from '../persistence/settings';

export const HUMAN_ID = 'human' as PlayerId;
const BOT_NAME_KEYS = ['player.bot.0', 'player.bot.1', 'player.bot.2'] as const;
const BOT_FALLBACK_KEY = 'player.botFallback';
const HUMAN_NAME_KEY = 'player.you';

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

  /**
   * Start a fresh game. `seed` is optional: the lobby omits it and gets a
   * random seed; specs and (later, AU-009) save/replay pass an explicit one so
   * the same deal is reproduced.
   */
  newGame(settings: Settings, seed?: Seed): void;
  dispatch(action: Action): readonly GameEvent[];
  select(cardId: string | null): void;
  reset(): void;
}

const MAX_RETAINED_EVENTS = 200;
let eventSeq = 0;

const isRejection = (event: GameEvent): boolean => event.type === 'ActionRejected';

/** Seat index → display name; seats beyond the named roster get a numbered fallback. */
export function botName(index: number): string {
  const key = BOT_NAME_KEYS[index];
  return key ? t(key) : t(BOT_FALLBACK_KEY, { n: index });
}

function buildPlayers(settings: Settings): PlayerConfig[] {
  const bots: PlayerConfig[] = Array.from({ length: settings.opponents }, (_, i) => ({
    id: `bot${i}` as PlayerId,
    name: botName(i),
    kind: 'bot',
    difficulty: settings.difficulty,
  }));
  return [{ id: HUMAN_ID, name: t(HUMAN_NAME_KEY), kind: 'human' }, ...bots];
}

export const useGameStore = create<GameSlice>((set, get) => ({
  state: null,
  seed: 0,
  actionLog: [],
  events: [],
  selectedCard: null,

  newGame(settings, explicitSeed) {
    // W-032: `??` (not `||`) so an explicit seed of 0 is honoured.
    const seed = explicitSeed ?? ((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    const config: RuleConfig = {
      variant: 'classic',
      houseRules: OFFICIAL_HOUSE_RULES,
      targetScore: TARGET_SCORE,
      unoCallWindowMs: settings.unoCallWindowMs,
    };
    set({ state: engine.createInitialState(config, seed), seed, actionLog: [], events: [], selectedCard: null });
    // C-002: a rejected setup leaves a state with no players, which the HUD
    // cannot render. Drop back to the lobby (state null) instead of exposing it.
    const setup = [
      ...get().dispatch({ type: 'START_GAME', players: buildPlayers(settings) }),
      ...get().dispatch({ type: 'START_ROUND' }),
    ];
    if (setup.some(isRejection)) get().reset();
  },

  dispatch(action) {
    const current = get().state;
    if (!current) return [];
    const { state, events } = engine.apply(current, action);
    const stamped = events.map((event) => ({ seq: ++eventSeq, event }));
    // A rejected action leaves state untouched, so logging it would make the
    // replay log lie about what happened (AU-003 / AU-009).
    const rejected = events.some(isRejection);
    set((s) => ({
      state,
      actionLog: rejected ? s.actionLog : [...s.actionLog, action],
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
  // Config names are frozen at START_GAME; resolving the human here keeps the
  // label in sync if the locale changes mid-game.
  if (id === HUMAN_ID) return t(HUMAN_NAME_KEY);
  return state.playerConfigs.find((p) => p.id === id)?.name ?? id;
}

export function legalMovesForHuman(state: GameState) {
  return engine.getLegalMoves(state, HUMAN_ID);
}
