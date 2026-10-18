/**
 * RoundOverSheet.tsx — winner in display size, breakdown, confetti for you.
 */
import type { GameState } from '@uno/engine';

import { t } from '../i18n';
import { HUMAN_ID, playerName, useGameStore } from '../store/gameStore';
import { Confetti } from './Confetti';
import { RoundTable } from './RoundTable';
import { Sheet } from './Sheet';
import { seatColor } from './playerChips';
import { buildRoundRows, lastRoundEnded } from './roundSummary';

const NO_POINTS = 0;

interface RoundOverSheetProps {
    readonly state: GameState;
    readonly onNewGame: () => void;
    readonly onQuit: () => void;
}

export function RoundOverSheet({ state, onNewGame, onQuit }: RoundOverSheetProps) {
    const dispatch = useGameStore((s) => s.dispatch);
    const events = useGameStore((s) => s.events);
    if (state.phase !== 'round_over' && state.phase !== 'game_over') return null;
    const winner = state.gameWinner ?? state.roundWinner;
    // Same guard as C-002: a winner id with no seat means the state is
    // inconsistent, so render nothing rather than crash the whole scene.
    if (!winner || !state.players.some((p) => p.id === winner)) return null;

    const gameOver = state.phase === 'game_over';
    const points = lastRoundEnded(events.map((e) => e.event))?.points ?? NO_POINTS;
    const nameOf = (id: typeof winner) => playerName(state, id);
    const rows = buildRoundRows(state, points, nameOf, (id) => seatColor(state, id));
    const primaryLabel = gameOver ? t('hud.newGame') : t('hud.nextRound');
    const onPrimary = gameOver ? onNewGame : () => dispatch({ type: 'START_ROUND' });

    return (
        <Sheet title={gameOver ? t('hud.gameOver') : t('hud.roundOver')} className="round-over">
            {winner === HUMAN_ID && <Confetti />}
            <p className="display-name">{nameOf(winner)}</p>
            <p className="sheet-hint">{gameOver ? t('hud.gameWinner') : t('hud.roundWinner')}</p>
            <RoundTable rows={rows} />
            <div className="row">
                <button type="button" className="btn ghost" onClick={onQuit}>
                    {t('hud.quit')}
                </button>
                <button type="button" className="btn primary" onClick={onPrimary}>
                    {primaryLabel}
                </button>
            </div>
        </Sheet>
    );
}
