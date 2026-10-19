/**
 * TurnBanner.tsx — whose turn, with the play direction (design §2.4).
 */
import type { Direction, GameState, Phase } from '@uno/engine';

import { t } from '../i18n';
import { HUMAN_ID, playerName } from '../store/gameStore';

const CLOCKWISE: Direction = 1;
const CLOCKWISE_GLYPH = '⟳';
const COUNTER_GLYPH = '⟲';
const LIVE_PHASES: readonly Phase[] = ['playing', 'choosing_color', 'challenge_window'];

export function TurnBanner({ state }: { readonly state: GameState }) {
    if (!LIVE_PHASES.includes(state.phase)) return null;
    const mine = state.currentPlayer === HUMAN_ID;
    const clockwise = state.direction === CLOCKWISE;
    const directionLabel = clockwise ? t('hud.direction.clockwise') : t('hud.direction.counter');
    return (
        <div className={mine ? 'turnbanner mine' : 'turnbanner'} aria-live="polite">
            <span className="direction" role="img" aria-label={directionLabel}>
                {clockwise ? CLOCKWISE_GLYPH : COUNTER_GLYPH}
            </span>
            {mine
                ? t('hud.yourTurn')
                : t('hud.turnOf', { name: playerName(state, state.currentPlayer) })}
        </div>
    );
}
