/**
 * callouts.ts — which events deserve the big centred word, and in what colour
 * (design §2.4 "Callouts"). Pure; <Callouts /> only animates what this returns.
 */
import type { CardColor, GameEvent } from '@uno/engine';

export const CALLOUT_POP_MS = 350;
export const CALLOUT_HOLD_MS = 700;
export const CALLOUT_FADE_MS = 300;
export const CALLOUT_TOTAL_MS = CALLOUT_POP_MS + CALLOUT_HOLD_MS + CALLOUT_FADE_MS;

export interface Callout {
    /** i18n key of the word to show. */
    readonly key: string;
    /** Card colour the word is tinted with. */
    readonly color: CardColor;
}

const UNO_COLOR: CardColor = 'red';
const CAUGHT_COLOR: CardColor = 'blue';
const CHALLENGE_WON_COLOR: CardColor = 'green';
const CHALLENGE_LOST_COLOR: CardColor = 'red';

/**
 * Loudest first. A Draw Two also skips, so the engine emits both `CardDrawn`
 * and `TurnSkipped` in one batch; the penalty is the news, the skip is implied.
 */
const PRIORITY: readonly string[] = [
    'callout.draw4',
    'callout.draw2',
    'callout.caught',
    'callout.challengeWon',
    'callout.challengeLost',
    'callout.uno',
    'callout.reverse',
    'callout.skip',
];

function priorityOf(callout: Callout): number {
    const index = PRIORITY.indexOf(callout.key);
    return index === -1 ? PRIORITY.length : index;
}

export function calloutFor(event: GameEvent, activeColor: CardColor): Callout | undefined {
    switch (event.type) {
        case 'TurnSkipped':
            return { key: 'callout.skip', color: activeColor };
        case 'DirectionReversed':
            return { key: 'callout.reverse', color: activeColor };
        case 'CardDrawn':
            if (event.reason === 'draw2') return { key: 'callout.draw2', color: activeColor };
            if (event.reason === 'draw4') return { key: 'callout.draw4', color: activeColor };
            return undefined;
        case 'UnoCalled':
            return { key: 'callout.uno', color: UNO_COLOR };
        case 'UnoCaught':
            return { key: 'callout.caught', color: CAUGHT_COLOR };
        case 'Draw4Challenged':
            return event.succeeded
                ? { key: 'callout.challengeWon', color: CHALLENGE_WON_COLOR }
                : { key: 'callout.challengeLost', color: CHALLENGE_LOST_COLOR };
        default:
            return undefined;
    }
}

/** One word per batch: the highest-priority callout, newest on ties. */
export function pickCallout(batch: readonly Callout[]): Callout | undefined {
    let best: Callout | undefined;
    for (const callout of batch) {
        if (best === undefined || priorityOf(callout) <= priorityOf(best)) best = callout;
    }
    return best;
}
