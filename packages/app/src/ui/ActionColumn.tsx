/**
 * ActionColumn.tsx — Draw / Pass / UNO! stacked at the right edge above the fan
 * (design §2.4). Catching a bot is on its chip, not here.
 */
import { canCallUno } from '@uno/engine';
import type { GameState } from '@uno/engine';

import { t } from '../i18n';
import { HUMAN_ID, useGameStore } from '../store/gameStore';

function DrawButton({ count, onDraw }: { readonly count: number; readonly onDraw: () => void }) {
    return (
        <button
            type="button"
            className="btn-round draw"
            aria-label={t('hud.drawAria', { n: count })}
            onClick={onDraw}
        >
            <span className="btn-round-label">{t('hud.draw')}</span>
            <span className="btn-round-count" aria-hidden="true">
                {count}
            </span>
        </button>
    );
}

export function ActionColumn({ state }: { readonly state: GameState }) {
    const dispatch = useGameStore((s) => s.dispatch);
    const me = state.players.find((p) => p.id === HUMAN_ID);
    // C-002: no human seat means setup was rejected — render nothing rather than crash.
    if (!me) return null;
    const myTurn = state.phase === 'playing' && state.currentPlayer === HUMAN_ID;
    const hasDrawn = state.drawnCard !== undefined;
    const showUno = canCallUno({ handCount: me.hand.length, calledUno: me.calledUno }, state.phase);
    const urgent = state.unoVulnerable === HUMAN_ID;

    return (
        <div className="action-column">
            {showUno && (
                <button
                    type="button"
                    className={urgent ? 'btn-round uno urgent' : 'btn-round uno'}
                    onClick={() => dispatch({ type: 'CALL_UNO', player: HUMAN_ID })}
                >
                    {t('hud.uno')}
                </button>
            )}
            {myTurn && !hasDrawn && (
                <DrawButton
                    count={state.drawPile.length}
                    onDraw={() => dispatch({ type: 'DRAW_CARD', player: HUMAN_ID })}
                />
            )}
            {myTurn && hasDrawn && (
                <button
                    type="button"
                    className="btn-round pass"
                    onClick={() => dispatch({ type: 'PASS', player: HUMAN_ID })}
                >
                    {t('hud.pass')}
                </button>
            )}
        </div>
    );
}
