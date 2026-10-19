/**
 * ChallengeSheet.tsx — accept the +4 or call the bluff.
 */
import type { GameState } from '@uno/engine';

import { t } from '../i18n';
import { HUMAN_ID, playerName, useGameStore } from '../store/gameStore';
import { Sheet } from './Sheet';

export function ChallengeSheet({ state }: { readonly state: GameState }) {
    const dispatch = useGameStore((s) => s.dispatch);
    if (state.phase !== 'challenge_window' || state.draw4Challenge?.target !== HUMAN_ID)
        return null;
    const by = playerName(state, state.draw4Challenge.player);
    return (
        <Sheet title={t('hud.challengePrompt', { name: by })} className="challenge">
            <p className="sheet-hint">{t('hud.challengeHint')}</p>
            <div className="row">
                <button
                    type="button"
                    className="btn ghost"
                    onClick={() => dispatch({ type: 'ACCEPT_DRAW4', player: HUMAN_ID })}
                >
                    {t('hud.accept')}
                </button>
                <button
                    type="button"
                    className="btn primary"
                    onClick={() => dispatch({ type: 'CHALLENGE_DRAW4', player: HUMAN_ID })}
                >
                    {t('hud.challenge')}
                </button>
            </div>
        </Sheet>
    );
}
