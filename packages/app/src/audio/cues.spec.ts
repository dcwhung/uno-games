import { describe, expect, it } from 'vitest';
import type { CardId, DrawReason, GameEvent, PlayerId } from '@uno/engine';

import { HUMAN_ID } from '../store/gameStore';
import { BOT_IDS } from '../test/fixtures';
import { CUES, CUE_PRIORITY, cueFor, pickCue } from './cues';

const [BOT_A] = BOT_IDS;
const CARD = 'c1' as CardId;

function drawn(reason: DrawReason, player: PlayerId = BOT_A): GameEvent {
    return { type: 'CardDrawn', player, cards: [CARD], reason };
}

describe('cueFor', () => {
    it('should swish when any seat plays a card', () => {
        expect(cueFor({ type: 'CardPlayed', player: BOT_A, card: CARD }, HUMAN_ID)).toBe('card');
    });

    it('should use the lower swish for an ordinary draw', () => {
        expect(cueFor(drawn('turn'), HUMAN_ID)).toBe('draw');
        expect(cueFor(drawn('penalty'), HUMAN_ID)).toBe('draw');
        expect(cueFor(drawn('uno_missed'), HUMAN_ID)).toBe('draw');
    });

    it('should thud for +2 and +4 draws', () => {
        expect(cueFor(drawn('draw2'), HUMAN_ID)).toBe('draw2');
        expect(cueFor(drawn('draw4'), HUMAN_ID)).toBe('draw4');
    });

    it('should blip for skip and reverse', () => {
        expect(cueFor({ type: 'TurnSkipped', player: BOT_A }, HUMAN_ID)).toBe('skip');
        expect(cueFor({ type: 'DirectionReversed', direction: -1 }, HUMAN_ID)).toBe('reverse');
    });

    it('should sting for UNO calls and catches', () => {
        expect(cueFor({ type: 'UnoCalled', player: BOT_A }, HUMAN_ID)).toBe('uno');
        expect(cueFor({ type: 'UnoCaught', player: BOT_A, by: HUMAN_ID }, HUMAN_ID)).toBe('uno');
    });

    it('should play the fanfare when the human wins the round and the minor dyad otherwise', () => {
        const base = { type: 'RoundEnded', points: 10, scores: {} } as const;

        expect(cueFor({ ...base, winner: HUMAN_ID }, HUMAN_ID)).toBe('win');
        expect(cueFor({ ...base, winner: BOT_A }, HUMAN_ID)).toBe('lose');
    });

    it('should stay silent on GameEnded because RoundEnded already played in the same batch', () => {
        expect(cueFor({ type: 'GameEnded', winner: HUMAN_ID }, HUMAN_ID)).toBeUndefined();
    });

    it('should tap when an action is rejected', () => {
        const event: GameEvent = {
            type: 'ActionRejected',
            action: { type: 'PASS', player: HUMAN_ID },
            reason: 'wrong_phase',
        };

        expect(cueFor(event, HUMAN_ID)).toBe('tap');
    });

    it('should stay silent for bookkeeping events', () => {
        expect(cueFor({ type: 'TurnChanged', player: BOT_A }, HUMAN_ID)).toBeUndefined();
        expect(cueFor({ type: 'GameStarted', players: [HUMAN_ID] }, HUMAN_ID)).toBeUndefined();
    });
});

describe('pickCue', () => {
    // S-093: a Draw Two batch is CardPlayed + TurnSkipped + CardDrawn:draw2; stacking
    // swish + blip + thud at the same instant is mud, so one cue wins per batch.
    it('should keep the heaviest cue of a Draw Two batch', () => {
        expect(pickCue(['card', 'skip', 'draw2'])).toBe('draw2');
    });

    it('should let the round fanfare beat everything played in the same batch', () => {
        expect(pickCue(['card', 'uno', 'win'])).toBe('win');
        expect(pickCue(['lose', 'card'])).toBe('lose');
    });

    it('should not depend on the order the events arrived in', () => {
        expect(pickCue(['draw4', 'card'])).toBe(pickCue(['card', 'draw4']));
    });

    it('should return the only cue when there is one and nothing for an empty batch', () => {
        expect(pickCue(['tap'])).toBe('tap');
        expect(pickCue([])).toBeUndefined();
    });

    it('should rank every cue exactly once so a new cue cannot be left unranked', () => {
        expect([...CUE_PRIORITY].sort()).toEqual([...CUES].sort());
    });
});
