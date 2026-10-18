import { describe, expect, it } from 'vitest';
import type { CardId, GameEvent } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import { BOT_IDS } from '../test/fixtures';
import { HAPTIC_CARD, HAPTIC_CAUGHT, HAPTIC_UNO, hapticFor } from './haptics';

const [BOT_A] = BOT_IDS;
const CARD = 'c1' as CardId;

describe('hapticFor', () => {
    it('should buzz briefly when the human plays a card, but not for bots', () => {
        expect(hapticFor({ type: 'CardPlayed', player: HUMAN_ID, card: CARD }, HUMAN_ID)).toBe(
            HAPTIC_CARD,
        );
        expect(
            hapticFor({ type: 'CardPlayed', player: BOT_A, card: CARD }, HUMAN_ID),
        ).toBeUndefined();
    });

    it('should buzz on the human calling UNO', () => {
        expect(hapticFor({ type: 'UnoCalled', player: HUMAN_ID }, HUMAN_ID)).toBe(HAPTIC_UNO);
        expect(hapticFor({ type: 'UnoCalled', player: BOT_A }, HUMAN_ID)).toBeUndefined();
    });

    it('should triple-buzz when the human is caught', () => {
        expect(hapticFor({ type: 'UnoCaught', player: HUMAN_ID, by: BOT_A }, HUMAN_ID)).toBe(
            HAPTIC_CAUGHT,
        );
        expect(
            hapticFor({ type: 'UnoCaught', player: BOT_A, by: HUMAN_ID }, HUMAN_ID),
        ).toBeUndefined();
    });

    it('should stay still for other events', () => {
        const event: GameEvent = { type: 'DirectionReversed', direction: 1 };

        expect(hapticFor(event, HUMAN_ID)).toBeUndefined();
    });
});
