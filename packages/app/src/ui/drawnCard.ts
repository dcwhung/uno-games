/**
 * drawnCard.ts — "Play it or pass" hint rule (design §2.4 "Drawn card").
 */
import type { GameState, LegalMove } from '@uno/engine';

export function isDrawnCardPlayable(state: GameState, legal: readonly LegalMove[]): boolean {
    const drawn = state.drawnCard;
    return drawn !== undefined && legal.some((move) => move.card === drawn);
}
