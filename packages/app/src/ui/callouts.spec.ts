/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import type { CardColor, CardId, DrawReason, GameEvent } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
// Vite's ?raw loader: the app tsconfig has no Node types, so no fs here.
import css from '../styles.css?raw';
import { BOT_IDS } from '../test/fixtures';
import {
    CALLOUT_HOLD_MS,
    CALLOUT_POP_MS,
    CALLOUT_TOTAL_MS,
    calloutFor,
    pickCallout,
} from './callouts';
import type { Callout } from './callouts';

const [BOT_A] = BOT_IDS;
const CARD = 'c1' as CardId;
const ACTIVE: CardColor = 'yellow';
const POP_PLUS_HOLD_MS = 1050;

function drawn(reason: DrawReason): GameEvent {
    return { type: 'CardDrawn', player: BOT_A, cards: [CARD], reason };
}

function challenged(succeeded: boolean): GameEvent {
    return { type: 'Draw4Challenged', by: HUMAN_ID, against: BOT_A, succeeded };
}

describe('calloutFor', () => {
    it('should call Skip and Reverse in the active colour', () => {
        expect(calloutFor({ type: 'TurnSkipped', player: BOT_A }, ACTIVE)).toEqual({
            key: 'callout.skip',
            color: ACTIVE,
        });
        expect(calloutFor({ type: 'DirectionReversed', direction: -1 }, ACTIVE)).toEqual({
            key: 'callout.reverse',
            color: ACTIVE,
        });
    });

    it('should call +2 and +4 in the active colour, but not ordinary draws', () => {
        expect(calloutFor(drawn('draw2'), ACTIVE)).toEqual({ key: 'callout.draw2', color: ACTIVE });
        expect(calloutFor(drawn('draw4'), ACTIVE)).toEqual({ key: 'callout.draw4', color: ACTIVE });
        expect(calloutFor(drawn('turn'), ACTIVE)).toBeUndefined();
        expect(calloutFor(drawn('penalty'), ACTIVE)).toBeUndefined();
    });

    it('should call UNO in red and Caught in blue regardless of the active colour', () => {
        expect(calloutFor({ type: 'UnoCalled', player: BOT_A }, ACTIVE)).toEqual({
            key: 'callout.uno',
            color: 'red',
        });
        expect(calloutFor({ type: 'UnoCaught', player: BOT_A, by: HUMAN_ID }, ACTIVE)).toEqual({
            key: 'callout.caught',
            color: 'blue',
        });
    });

    it('should call a won challenge in green and a lost one in red', () => {
        expect(calloutFor(challenged(true), ACTIVE)).toEqual({
            key: 'callout.challengeWon',
            color: 'green',
        });
        expect(calloutFor(challenged(false), ACTIVE)).toEqual({
            key: 'callout.challengeLost',
            color: 'red',
        });
    });

    it('should stay silent for minor and bookkeeping events', () => {
        expect(calloutFor({ type: 'DrawPileReshuffled', count: 40 }, ACTIVE)).toBeUndefined();
        expect(calloutFor({ type: 'TurnChanged', player: BOT_A }, ACTIVE)).toBeUndefined();
    });
});

describe('pickCallout', () => {
    const skip: Callout = { key: 'callout.skip', color: ACTIVE };
    const draw2: Callout = { key: 'callout.draw2', color: ACTIVE };
    const draw4: Callout = { key: 'callout.draw4', color: ACTIVE };

    it('should return undefined for an empty batch', () => {
        expect(pickCallout([])).toBeUndefined();
    });

    it('should prefer the penalty over the skip it implies, whatever the order', () => {
        expect(pickCallout([draw2, skip])).toBe(draw2);
        expect(pickCallout([skip, draw2])).toBe(draw2);
        expect(pickCallout([skip, draw4])).toBe(draw4);
    });

    it('should keep the newest callout when the batch has equal priority', () => {
        const older: Callout = { key: 'callout.skip', color: 'red' };

        expect(pickCallout([older, skip])).toBe(skip);
    });
});

describe('CALLOUT_TOTAL_MS', () => {
    it('should cover the pop, the hold and the fade', () => {
        expect(CALLOUT_TOTAL_MS).toBeGreaterThan(POP_PLUS_HOLD_MS);
    });
});

describe('styles.css callout timeline', () => {
    // styles.css promises its ms values mirror this module; the keyframe stops
    // must land at the end of the pop and at the end of the hold, both at full
    // opacity, or the word fades while the timer still thinks it is on hold.
    const PERCENT = 100;
    const popEnd = Math.round((CALLOUT_POP_MS / CALLOUT_TOTAL_MS) * PERCENT);
    const holdEnd = Math.round(((CALLOUT_POP_MS + CALLOUT_HOLD_MS) / CALLOUT_TOTAL_MS) * PERCENT);

    /** Any property order inside the stop, so prettier's layout cannot break it. */
    function stopAtFullOpacity(pct: number): RegExp {
        return new RegExp(`${pct}%\\s*\\{[^}]*opacity:\\s*1\\b`);
    }

    /** `slice(-1)` on a missed marker would silently test the wrong text (S-091). */
    function section(start: string, end?: string): string {
        const from = css.indexOf(start);
        expect(from).toBeGreaterThanOrEqual(0);
        const to = end === undefined ? css.length : css.indexOf(end, from);
        expect(to).toBeGreaterThan(from);
        return css.slice(from, to);
    }

    it('should declare --callout-total equal to CALLOUT_TOTAL_MS', () => {
        expect(css).toContain(`--callout-total: ${CALLOUT_TOTAL_MS}ms;`);
    });

    it('should hold the word at full opacity from the end of the pop to the end of the hold', () => {
        const keyframes = section('@keyframes callout');

        expect(keyframes).toMatch(stopAtFullOpacity(popEnd));
        expect(keyframes).toMatch(stopAtFullOpacity(holdEnd));
    });

    it('should keep the callout layer above the sheets', () => {
        const layer = section('.callouts {', '.callout {');

        expect(layer).toMatch(/z-index:\s*3;/);
    });
});
