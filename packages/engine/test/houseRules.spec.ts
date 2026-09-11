import { describe, expect, it } from 'vitest';
import { classicRules, engine, OFFICIAL_HOUSE_RULES } from '../src';
import type { Action, GameState, HouseRules, RuleConfig } from '../src';
import { CONFIG, DEFAULT_SEED, firstCard, hand, P, play, players, rig, types } from './helpers';

// ---------------------------------------------------------------------------
// AU-005: House Rules are declared on RuleConfig but not yet wired into the
// reducer / plugin. The plugin must not advertise support for them until the
// read points exist, otherwise the lobby could expose toggles that do nothing.
// ---------------------------------------------------------------------------

const PLAYER_COUNT = 3;
const DRAW_TWO_PENALTY = 2;
const STACKING_ON: HouseRules = { ...OFFICIAL_HOUSE_RULES, stacking: true };

/** Lobby → round 1 with an explicit RuleConfig (helpers.newGame pins CONFIG). */
function newGameWith(config: RuleConfig): GameState {
  let s = engine.createInitialState(config, DEFAULT_SEED);
  const actions: Action[] = [{ type: 'START_GAME', players: players(PLAYER_COUNT) }, { type: 'START_ROUND' }];
  for (const a of actions) s = engine.apply(s, a).state;
  return s;
}

/** P(0) plays Draw Two while P(1) also holds a Draw Two (the stacking scenario). */
function draw2OnDraw2(config: RuleConfig): GameState {
  return rig(newGameWith(config), {
    top: { color: 'red', kind: 'number', value: 1 },
    hands: {
      [P(0)]: [{ color: 'red', kind: 'draw2' }, { color: 'blue', kind: 'number', value: 3 }],
      [P(1)]: [{ color: 'green', kind: 'draw2' }, { color: 'blue', kind: 'number', value: 4 }],
      [P(2)]: [{ color: 'yellow', kind: 'number', value: 5 }],
    },
  });
}

describe('classicRules.supportedHouseRules', () => {
  it('advertises no house rules while none are implemented', () => {
    expect(classicRules.supportedHouseRules).toEqual([]);
  });

  it('behaves identically to official rules when stacking is toggled on', () => {
    const official = draw2OnDraw2(CONFIG);
    const stacking = draw2OnDraw2({ ...CONFIG, houseRules: STACKING_ON });

    const officialResult = play(official, P(0), firstCard(official, P(0)));
    const stackingResult = play(stacking, P(0), firstCard(stacking, P(0)));

    // Official: the target draws 2 and is skipped immediately; no stacking window opens.
    expect(types(officialResult)).toEqual(['CardPlayed', 'CardDrawn', 'TurnSkipped', 'TurnChanged']);
    expect(stackingResult.events).toEqual(officialResult.events);
    expect(hand(stackingResult.state, P(1))).toHaveLength(DRAW_TWO_PENALTY + DRAW_TWO_PENALTY);
    expect(stackingResult.state.currentPlayer).toBe(P(2));
    expect(engine.getLegalMoves(stackingResult.state, P(1))).toEqual([]);

    // Only the config differs; every other piece of state must match byte-for-byte.
    const { config: _officialConfig, ...officialRest } = officialResult.state;
    const { config: _stackingConfig, ...stackingRest } = stackingResult.state;
    expect(stackingRest).toEqual(officialRest);
  });
});
