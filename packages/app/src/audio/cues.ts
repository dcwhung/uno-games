/**
 * cues.ts — pure mapping from engine events to sound cues (design §2.6).
 *
 * No audio here: `sfx.ts` owns the synthesis, `useSfx` the wiring. Keeping the
 * mapping pure means the "which event makes which noise" table is unit-tested.
 */
import type { DrawReason, GameEvent, PlayerId } from '@uno/engine';

export const CUES = [
    'card',
    'draw',
    'uno',
    'skip',
    'reverse',
    'draw2',
    'draw4',
    'win',
    'lose',
    'tap',
] as const;

export type Cue = (typeof CUES)[number];

const DRAW_CUE_BY_REASON: Partial<Record<DrawReason, Cue>> = {
    draw2: 'draw2',
    draw4: 'draw4',
};
const DEFAULT_DRAW_CUE: Cue = 'draw';

export function cueFor(event: GameEvent, humanId: PlayerId): Cue | undefined {
    switch (event.type) {
        case 'CardPlayed':
            return 'card';
        case 'CardDrawn':
            return DRAW_CUE_BY_REASON[event.reason] ?? DEFAULT_DRAW_CUE;
        case 'UnoCalled':
        case 'UnoCaught':
            return 'uno';
        case 'TurnSkipped':
            return 'skip';
        case 'DirectionReversed':
            return 'reverse';
        case 'RoundEnded':
            return event.winner === humanId ? 'win' : 'lose';
        case 'ActionRejected':
            return 'tap';
        // GameEnded always arrives in the same batch as the RoundEnded that
        // decided it, so a second fanfare would only double the first.
        default:
            return undefined;
    }
}
