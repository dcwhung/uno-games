export * from './types';
export { createRng, rngForTick } from './rng';
export { createEngine } from './reducer';
export { RULE_REGISTRY } from './rules';
export { classicRules, buildClassicDeck, CLASSIC_DECK_SIZE } from './rules/classic';
export { createBot } from './bots';
export * as core from './core';
export { canCallUno, isUnoCallHandSize, isUnoCallPhase, UNO_CALL_MAX_HAND } from './core';
export type { UnoCallCandidate } from './core';

import { createEngine } from './reducer';
import { RULE_REGISTRY } from './rules';
/** Engine with every built-in variant registered. */
export const engine = createEngine(RULE_REGISTRY);
