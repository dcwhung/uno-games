import { beforeEach, describe, expect, it } from 'vitest';
import { engine, OFFICIAL_HOUSE_RULES, TARGET_SCORE } from '@uno/engine';
import type { GameState, PlayerConfig, PlayerId, RuleConfig } from '@uno/engine';

import en from '../i18n/en.json';
import { DEFAULT_SETTINGS } from '../persistence/settings';
import type { Settings } from '../persistence/settings';
import { HUMAN_ID, botName, playerName, useGameStore } from './gameStore';

// Expected copy is read from en.json rather than typed inline so the spec
// only fails when the name source is wrong, not when copy is edited.
const YOU_KEY = 'player.you';
const BOT_KEY_PREFIX = 'player.bot.';
const BOT_FALLBACK_KEY = 'player.botFallback';

const NAMED_BOT_COUNT = 3;
const UNNAMED_BOT_INDEX = NAMED_BOT_COUNT;
const UNKNOWN_ID = 'ghost' as PlayerId;

// Bypasses the Settings type on purpose: this is the shape a corrupt/legacy
// localStorage value could produce before validation existed (C-002).
const INVALID_OPPONENTS = 99;
const VALID_SETTINGS: Settings = { opponents: 2, difficulty: 'medium', unoCallWindowMs: 2000 };
const INVALID_SETTINGS = { ...VALID_SETTINGS, opponents: INVALID_OPPONENTS } as unknown as Settings;

const SEED = 42;
const UNO_WINDOW_MS = 2000;
const BOT_ID = 'bot0' as PlayerId;

const CONFIG: RuleConfig = {
    variant: 'classic',
    houseRules: OFFICIAL_HOUSE_RULES,
    targetScore: TARGET_SCORE,
    unoCallWindowMs: UNO_WINDOW_MS,
};

const PLAYERS: PlayerConfig[] = [
    { id: HUMAN_ID, name: 'You', kind: 'human' },
    { id: BOT_ID, name: 'Momo', kind: 'bot', difficulty: 'medium' },
];

function startedState() {
    useGameStore.getState().newGame({ ...DEFAULT_SETTINGS, opponents: NAMED_BOT_COUNT });
    const state = useGameStore.getState().state;
    if (!state) throw new Error('newGame() should produce a state');
    return state;
}

/** Lobby → round 1 in play, built through the engine so the position is real. */
function dealtState(): GameState {
    let s = engine.createInitialState(CONFIG, SEED);
    s = engine.apply(s, { type: 'START_GAME', players: PLAYERS }).state;
    return engine.apply(s, { type: 'START_ROUND' }).state;
}

function notCurrent(state: GameState): PlayerId {
    return state.currentPlayer === HUMAN_ID ? BOT_ID : HUMAN_ID;
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

describe('useGameStore.newGame', () => {
    beforeEach(() => {
        useGameStore.getState().reset();
    });

    it('should reach the playing phase with all seats filled when settings are valid', () => {
        useGameStore.getState().newGame(VALID_SETTINGS);

        const { state } = useGameStore.getState();
        expect(state?.phase).toBe('playing');
        expect(state?.players).toHaveLength(VALID_SETTINGS.opponents + 1);
    });

    it('should reset to the lobby (state null) when the engine rejects the player count', () => {
        useGameStore.getState().newGame(INVALID_SETTINGS);

        const { state, actionLog, events } = useGameStore.getState();
        expect(state).toBeNull();
        expect(actionLog).toEqual([]);
        expect(events).toEqual([]);
    });

    it('should let a valid game start after a rejected one', () => {
        useGameStore.getState().newGame(INVALID_SETTINGS);
        useGameStore.getState().newGame(VALID_SETTINGS);

        expect(useGameStore.getState().state?.phase).toBe('playing');
    });
});

describe('useGameStore.dispatch', () => {
    beforeEach(() => {
        // Seed the slice directly instead of through newGame() so the spec does not
        // depend on the random seed newGame picks.
        useGameStore.setState({ state: dealtState(), seed: SEED, actionLog: [], events: [], selectedCard: null });
    });

    it('should append the action to actionLog when the engine accepts it', () => {
        const before = useGameStore.getState().state;
        if (!before) throw new Error('state not seeded');

        useGameStore.getState().dispatch({ type: 'DRAW_CARD', player: before.currentPlayer });

        expect(useGameStore.getState().actionLog).toHaveLength(1);
        expect(useGameStore.getState().state).not.toBe(before);
    });

    it('should not append the action to actionLog when the engine rejects it', () => {
        const before = useGameStore.getState().state;
        if (!before) throw new Error('state not seeded');
        const outOfTurn = { type: 'DRAW_CARD', player: notCurrent(before) } as const;

        const events = useGameStore.getState().dispatch(outOfTurn);

        expect(events.some((e) => e.type === 'ActionRejected')).toBe(true);
        expect(useGameStore.getState().actionLog).toHaveLength(0);
        expect(useGameStore.getState().state).toBe(before);
    });

    it('should still surface the ActionRejected event to the events feed', () => {
        const before = useGameStore.getState().state;
        if (!before) throw new Error('state not seeded');

        useGameStore.getState().dispatch({ type: 'DRAW_CARD', player: notCurrent(before) });

        const feed = useGameStore.getState().events.map((s) => s.event.type);
        expect(feed).toContain('ActionRejected');
    });
});
