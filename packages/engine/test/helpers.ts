import { engine } from '../src';
import type {
  Action,
  ApplyResult,
  CardColor,
  CardId,
  CardKind,
  GameEvent,
  GameState,
  PlayerConfig,
  PlayerId,
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
  for (const a of [{ type: 'START_GAME', players: players(n) }, { type: 'START_ROUND' }] as Action[]) {
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
  const topFace = base.cards[top]!.front;

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

export function hand(state: GameState, id: PlayerId) {
  return state.players.find((p) => p.id === id)!.hand;
}

export function faceOf(state: GameState, id: CardId) {
  return state.cards[id]!.front;
}

export function firstCard(state: GameState, id: PlayerId): CardId {
  return hand(state, id)[0]!;
}

export function types(r: ApplyResult): string[] {
  return r.events.map((e) => e.type);
}

export function play(state: GameState, player: PlayerId, card: CardId, chosenColor?: CardColor): ApplyResult {
  return engine.apply(state, chosenColor ? { type: 'PLAY_CARD', player, card, chosenColor } : { type: 'PLAY_CARD', player, card });
}
