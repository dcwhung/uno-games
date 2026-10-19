/**
 * playerChips.ts — view model for the player strip (design §2.4).
 *
 * Pure so the badge rules (UNO called vs. catchable) and the seat → colour
 * mapping are tested without a DOM. `SEAT_COLORS` is Lane B's constant; only
 * its shape (one colour per bot, in seat order) is relied on here.
 */
import { elementAt } from '@uno/engine';
import type { GameState, PlayerId, PlayerState } from '@uno/engine';

import { SEAT_COLORS } from '../scene/constants';
import { HUMAN_ID, playerName } from '../store/gameStore';

/** CSS value, not a hex: the human's dot is the gold accent token. */
export const HUMAN_SEAT_COLOR = 'var(--gold)';
const UNO_HAND_SIZE = 1;

export type ChipBadge = 'uno' | 'catchable';

export interface PlayerChipModel {
    readonly id: PlayerId;
    readonly name: string;
    readonly color: string;
    readonly cardCount: number;
    readonly active: boolean;
    readonly badge?: ChipBadge;
}

export function seatColor(state: GameState, id: PlayerId): string {
    if (id === HUMAN_ID) return HUMAN_SEAT_COLOR;
    const bots = state.playerConfigs.filter((p) => p.kind === 'bot');
    const index = bots.findIndex((p) => p.id === id);
    return elementAt(SEAT_COLORS, index % SEAT_COLORS.length, 'seat colour');
}

function badgeFor(state: GameState, player: PlayerState): ChipBadge | undefined {
    if (player.hand.length !== UNO_HAND_SIZE) return undefined;
    if (player.calledUno) return 'uno';
    // The human's own vulnerability is the UNO button's job, not a chip to tap.
    if (state.unoVulnerable === player.id && player.id !== HUMAN_ID) return 'catchable';
    return undefined;
}

export function buildPlayerChips(state: GameState): readonly PlayerChipModel[] {
    return state.players.map((p) => {
        const badge = badgeFor(state, p);
        return {
            id: p.id,
            name: playerName(state, p.id),
            color: seatColor(state, p.id),
            cardCount: p.hand.length,
            active: state.currentPlayer === p.id,
            ...(badge === undefined ? {} : { badge }),
        };
    });
}
