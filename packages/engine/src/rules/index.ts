import type { RulePlugin, VariantId } from '../types';
import { classicRules } from './classic';

export const RULE_REGISTRY: Readonly<Partial<Record<VariantId, RulePlugin>>> = {
  classic: classicRules,
};
