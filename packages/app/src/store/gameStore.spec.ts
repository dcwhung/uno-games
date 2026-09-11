import { beforeEach, describe, expect, it } from 'vitest';
import type { PlayerId } from '@uno/engine';

import en from '../i18n/en.json';
import { DEFAULT_SETTINGS } from '../persistence/settings';
import { HUMAN_ID, botName, playerName, useGameStore } from './gameStore';

// Expected copy is read from en.json rather than typed inline so the spec
// only fails when the name source is wrong, not when copy is edited.
const YOU_KEY = 'player.you';
const BOT_KEY_PREFIX = 'player.bot.';
const BOT_FALLBACK_KEY = 'player.botFallback';

const NAMED_BOT_COUNT = 3;
const UNNAMED_BOT_INDEX = NAMED_BOT_COUNT;
const UNKNOWN_ID = 'ghost' as PlayerId;

function startedState() {
    useGameStore.getState().newGame({ ...DEFAULT_SETTINGS, opponents: NAMED_BOT_COUNT });
    const state = useGameStore.getState().state;
    if (!state) throw new Error('newGame() should produce a state');
    return state;
}

describe('playerName', () => {
    beforeEach(() => {
        useGameStore.getState().reset();
    });

    it('should resolve the human to the i18n "you" string', () => {
        const state = startedState();

        expect(playerName(state, HUMAN_ID)).toBe(en[YOU_KEY]);
    });

    it('should resolve each bot to its i18n name in seat order', () => {
        const state = startedState();

        for (let i = 0; i < NAMED_BOT_COUNT; i += 1) {
            const expected = en[`${BOT_KEY_PREFIX}${i}` as keyof typeof en];

            expect(playerName(state, `bot${i}` as PlayerId)).toBe(expected);
        }
    });

    it('should fall back to the id when the player is unknown', () => {
        const state = startedState();

        expect(playerName(state, UNKNOWN_ID)).toBe(UNKNOWN_ID);
    });
});

describe('botName', () => {
    it('should use the numbered fallback when the seat has no named bot', () => {
        const expected = en[BOT_FALLBACK_KEY].replace('{n}', String(UNNAMED_BOT_INDEX));

        expect(botName(UNNAMED_BOT_INDEX)).toBe(expected);
    });
});
