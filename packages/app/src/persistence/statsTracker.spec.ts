import { describe, expect, it } from 'vitest';
import type { GameEvent, PlayerId } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import { BOT_IDS } from '../test/fixtures';
import { applyEvent } from './statsTracker';
import type { Stats } from './settings';

const [BOT_A] = BOT_IDS;
const ZERO: Stats = { gamesPlayed: 0, gamesWon: 0, roundsWon: 0 };
const SOME: Stats = { gamesPlayed: 3, gamesWon: 1, roundsWon: 4 };
const ROUND_POINTS = 37;

function roundEnded(winner: PlayerId): GameEvent {
    return { type: 'RoundEnded', winner, points: ROUND_POINTS, scores: {} };
}

function gameEnded(winner: PlayerId): GameEvent {
    return { type: 'GameEnded', winner };
}

describe('applyEvent', () => {
    it('should count a round the human wins', () => {
        expect(applyEvent(SOME, roundEnded(HUMAN_ID), HUMAN_ID)).toEqual({
            ...SOME,
            roundsWon: SOME.roundsWon + 1,
        });
    });

    it('should leave rounds untouched when a bot wins the round', () => {
        expect(applyEvent(SOME, roundEnded(BOT_A), HUMAN_ID)).toEqual(SOME);
    });

    it('should count a finished game and the win when the human wins it', () => {
        expect(applyEvent(ZERO, gameEnded(HUMAN_ID), HUMAN_ID)).toEqual({
            gamesPlayed: 1,
            gamesWon: 1,
            roundsWon: 0,
        });
    });

    it('should count a finished game but not a win when a bot wins it', () => {
        expect(applyEvent(SOME, gameEnded(BOT_A), HUMAN_ID)).toEqual({
            ...SOME,
            gamesPlayed: SOME.gamesPlayed + 1,
        });
    });

    it('should return the same stats object for events that are not milestones', () => {
        const event: GameEvent = { type: 'DirectionReversed', direction: -1 };

        expect(applyEvent(SOME, event, HUMAN_ID)).toBe(SOME);
    });
});
