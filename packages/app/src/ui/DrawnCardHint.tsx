/**
 * DrawnCardHint.tsx — "Play it or pass" pill once a drawn card turns out playable.
 */
import type { GameState } from '@uno/engine';

import { t } from '../i18n';
import { HUMAN_ID, legalMovesForHuman } from '../store/gameStore';
import { isDrawnCardPlayable } from './drawnCard';

export function DrawnCardHint({ state }: { readonly state: GameState }) {
    const myTurn = state.phase === 'playing' && state.currentPlayer === HUMAN_ID;
    if (!myTurn || !isDrawnCardPlayable(state, legalMovesForHuman(state))) return null;
    return (
        <div className="hint-pill" role="status">
            {t('hud.playOrPass')}
        </div>
    );
}
