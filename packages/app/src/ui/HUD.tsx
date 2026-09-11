import { canCallUno } from '@uno/engine';
import type { CardColor, GameState } from '@uno/engine';
import { t } from '../i18n';
import { PALETTE } from '../scene/constants';
import { HUMAN_ID, playerName, useGameStore } from '../store/gameStore';

const COLORS: readonly CardColor[] = ['red', 'yellow', 'green', 'blue'];

function ScoreBar({ state }: { state: GameState }) {
    return (
        <div className="scorebar">
            {state.players.map((p) => (
                <div key={p.id} className={`score${state.currentPlayer === p.id ? ' active' : ''}`}>
                    <span className="name">{playerName(state, p.id)}</span>
                    <span className="pts">{p.score}</span>
                </div>
            ))}
            <div
                className="activecolor"
                style={{ background: PALETTE[state.activeColor] }}
                title={t(`color.${state.activeColor}`)}
            />
        </div>
    );
}

function TurnBanner({ state }: { state: GameState }) {
    if (
        state.phase !== 'playing' &&
        state.phase !== 'choosing_color' &&
        state.phase !== 'challenge_window'
    )
        return null;
    const mine = state.currentPlayer === HUMAN_ID;
    return (
        <div className={`turnbanner${mine ? ' mine' : ''}`}>
            {mine
                ? t('hud.yourTurn')
                : t('hud.turnOf', { name: playerName(state, state.currentPlayer) })}
        </div>
    );
}

function ActionBar({ state }: { state: GameState }) {
    const dispatch = useGameStore((s) => s.dispatch);
    const me = state.players.find((p) => p.id === HUMAN_ID);
    // C-002: no human seat means setup was rejected — render nothing rather than crash.
    if (!me) return null;
    const myTurn = state.phase === 'playing' && state.currentPlayer === HUMAN_ID;
    const showUnoButton = canCallUno(
        { handCount: me.hand.length, calledUno: me.calledUno },
        state.phase,
    );
    const urgent = state.unoVulnerable === HUMAN_ID;

    return (
        <div className="actionbar">
            {myTurn && state.drawnCard === undefined && (
                <button
                    className="btn"
                    onClick={() => dispatch({ type: 'DRAW_CARD', player: HUMAN_ID })}
                >
                    {t('hud.draw')}
                </button>
            )}
            {myTurn && state.drawnCard !== undefined && (
                <button
                    className="btn"
                    onClick={() => dispatch({ type: 'PASS', player: HUMAN_ID })}
                >
                    {t('hud.pass')}
                </button>
            )}
            {showUnoButton && (
                <button
                    className={`btn uno${urgent ? ' urgent' : ''}`}
                    onClick={() => dispatch({ type: 'CALL_UNO', player: HUMAN_ID })}
                >
                    {t('hud.uno')}
                </button>
            )}
            {state.unoVulnerable && state.unoVulnerable !== HUMAN_ID && (
                <button
                    className="btn catch"
                    onClick={() =>
                        dispatch({
                            type: 'CATCH_UNO',
                            player: HUMAN_ID,
                            target: state.unoVulnerable!,
                        })
                    }
                >
                    {t('hud.catch', { name: playerName(state, state.unoVulnerable) })}
                </button>
            )}
        </div>
    );
}

function ColorPicker({ state }: { state: GameState }) {
    const dispatch = useGameStore((s) => s.dispatch);
    if (state.phase !== 'choosing_color' || state.currentPlayer !== HUMAN_ID) return null;
    return (
        <div className="modal">
            <h2>{t('hud.chooseColor')}</h2>
            <div className="colors">
                {COLORS.map((c) => (
                    <button
                        key={c}
                        className="swatch"
                        style={{ background: PALETTE[c] }}
                        aria-label={t(`color.${c}`)}
                        onClick={() =>
                            dispatch({ type: 'CHOOSE_COLOR', player: HUMAN_ID, color: c })
                        }
                    />
                ))}
            </div>
        </div>
    );
}

function ChallengePrompt({ state }: { state: GameState }) {
    const dispatch = useGameStore((s) => s.dispatch);
    if (state.phase !== 'challenge_window' || state.draw4Challenge?.target !== HUMAN_ID)
        return null;
    return (
        <div className="modal">
            <h2>
                {t('hud.challengePrompt', { name: playerName(state, state.draw4Challenge.player) })}
            </h2>
            <div className="row">
                <button
                    className="btn"
                    onClick={() => dispatch({ type: 'ACCEPT_DRAW4', player: HUMAN_ID })}
                >
                    {t('hud.accept')}
                </button>
                <button
                    className="btn primary"
                    onClick={() => dispatch({ type: 'CHALLENGE_DRAW4', player: HUMAN_ID })}
                >
                    {t('hud.challenge')}
                </button>
            </div>
        </div>
    );
}

function RoundOver({ state, onNewGame }: { state: GameState; onNewGame: () => void }) {
    const dispatch = useGameStore((s) => s.dispatch);
    if (state.phase !== 'round_over' && state.phase !== 'game_over') return null;
    const winner = state.gameWinner ?? state.roundWinner;
    if (!winner) return null;
    const gameOver = state.phase === 'game_over';
    return (
        <div className="modal">
            <h2>{gameOver ? t('hud.gameOver') : t('hud.roundOver')}</h2>
            <p>
                {gameOver
                    ? t('hud.gameWinner', { name: playerName(state, winner) })
                    : t('hud.roundWinner', {
                          name: playerName(state, winner),
                          points: state.players.find((p) => p.id === winner)!.score,
                      })}
            </p>
            <table className="scores">
                <tbody>
                    {state.players.map((p) => (
                        <tr key={p.id}>
                            <td>{playerName(state, p.id)}</td>
                            <td>{p.score}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {gameOver ? (
                <button className="btn primary" onClick={onNewGame}>
                    {t('hud.newGame')}
                </button>
            ) : (
                <button className="btn primary" onClick={() => dispatch({ type: 'START_ROUND' })}>
                    {t('hud.nextRound')}
                </button>
            )}
        </div>
    );
}

export function HUD({ onNewGame }: { onNewGame: () => void }) {
    const state = useGameStore((s) => s.state);
    if (!state) return null;
    return (
        <div className="hud">
            <ScoreBar state={state} />
            <div className="bottom">
                <TurnBanner state={state} />
                <ActionBar state={state} />
            </div>
            <ColorPicker state={state} />
            <ChallengePrompt state={state} />
            <RoundOver state={state} onNewGame={onNewGame} />
        </div>
    );
}
