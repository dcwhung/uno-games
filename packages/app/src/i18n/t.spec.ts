import { describe, expect, it } from 'vitest';

import en from './en.json';
import { t } from './index';

// Keys are read from en.json rather than hard-coded strings so the spec breaks
// only when t() misbehaves, not when copy is edited.
const KNOWN_KEY = 'hud.draw';
const NAME_PARAM_KEY = 'hud.turnOf';
const MULTI_PARAM_KEY = 'toast.drew';
const UNKNOWN_KEY = 'spec.doesNotExist';

const PLAYER_NAME = 'Bob';
const DRAW_COUNT = 2;

describe('t', () => {
    it('should return the en.json string when the key is known', () => {
        expect(t(KNOWN_KEY)).toBe(en[KNOWN_KEY]);
    });

    it('should interpolate a {name} param when the template contains one', () => {
        const expected = en[NAME_PARAM_KEY].replace('{name}', PLAYER_NAME);

        expect(t(NAME_PARAM_KEY, { name: PLAYER_NAME })).toBe(expected);
    });

    it('should interpolate string and number params together', () => {
        const expected = en[MULTI_PARAM_KEY].replace('{name}', PLAYER_NAME).replace(
            '{n}',
            String(DRAW_COUNT),
        );

        expect(t(MULTI_PARAM_KEY, { name: PLAYER_NAME, n: DRAW_COUNT })).toBe(expected);
    });

    it('should leave the placeholder intact when a param is missing', () => {
        // Actual fallback in index.ts: `params[k] ?? \`{${k}}\`` — the raw token stays visible
        // so a missing param is obvious in the UI instead of rendering "undefined".
        expect(t(NAME_PARAM_KEY)).toBe(en[NAME_PARAM_KEY]);
    });

    it('should return the key itself when the key is unknown', () => {
        // Actual fallback in index.ts: `dictionaries[current]?.[key] ?? key`.
        expect(t(UNKNOWN_KEY)).toBe(UNKNOWN_KEY);
    });
});
