/**
 * OpponentPicker.tsx — three avatar cards that light up as the count rises.
 * Tapping the n-th card plays against n opponents.
 */
import { t } from '../i18n';
import type { Settings } from '../persistence/settings';
import { SEAT_COLORS } from '../scene/constants';
import { botName } from '../store/gameStore';
import { seatLabel } from './opponentSeats';

type OpponentCount = Settings['opponents'];
const OPPONENT_OPTIONS: readonly OpponentCount[] = [1, 2, 3];
const INITIAL_LETTERS = 1;

interface OpponentPickerProps {
    readonly value: OpponentCount;
    readonly onChange: (count: OpponentCount) => void;
}

export function OpponentPicker({ value, onChange }: OpponentPickerProps) {
    return (
        <div className="seats" role="group" aria-label={t('lobby.opponents')}>
            {OPPONENT_OPTIONS.map((count, seat) => {
                const name = botName(seat);
                return (
                    <button
                        key={count}
                        type="button"
                        className={seat < value ? 'seat-card on' : 'seat-card'}
                        aria-pressed={count === value}
                        aria-label={seatLabel(count)}
                        onClick={() => onChange(count)}
                    >
                        <span
                            className="seat-avatar"
                            style={{ background: SEAT_COLORS[seat] }}
                            aria-hidden="true"
                        >
                            {name.slice(0, INITIAL_LETTERS)}
                        </span>
                        <span className="seat-name">{name}</span>
                    </button>
                );
            })}
        </div>
    );
}
