/**
 * PlayerChip.tsx — one seat in the player strip (design §2.4).
 * A catchable seat renders as a button so the chip itself is the Catch action.
 *
 * Below the compact breakpoint (styles.css `.player-chip:not(.me) .name` in
 * the 520 px query) a bot chip shows only its dot and card count; the name
 * stays in the accessible label and the `title`, and the human chip keeps
 * "You" via the `me` class.
 */
import { t } from '../i18n';
import { HUMAN_ID } from '../store/gameStore';
import type { PlayerChipModel } from './playerChips';

interface PlayerChipProps {
    readonly chip: PlayerChipModel;
    readonly onCatch: () => void;
}

function chipClass(chip: PlayerChipModel): string {
    const classes = ['player-chip'];
    if (chip.id === HUMAN_ID) classes.push('me');
    if (chip.active) classes.push('active');
    if (chip.badge) classes.push(chip.badge);
    return classes.join(' ');
}

function ChipBody({ chip }: { readonly chip: PlayerChipModel }) {
    return (
        <>
            <span className="seat-dot" style={{ background: chip.color }} aria-hidden="true" />
            <span className="name">{chip.name}</span>
            <span className="count">{chip.cardCount}</span>
            {chip.badge === 'uno' && <span className="badge-uno">{t('hud.unoBadge')}</span>}
            {chip.badge === 'catchable' && (
                <span className="badge-catch" aria-hidden="true">
                    {t('hud.catchBadge')}
                </span>
            )}
        </>
    );
}

export function PlayerChip({ chip, onCatch }: PlayerChipProps) {
    const held = t('hud.cardsHeld', { name: chip.name, n: chip.cardCount });
    if (chip.badge === 'catchable') {
        const label = `${held}. ${t('hud.catch', { name: chip.name })}`;
        return (
            <button
                type="button"
                className={chipClass(chip)}
                aria-label={label}
                title={label}
                onClick={onCatch}
            >
                <ChipBody chip={chip} />
            </button>
        );
    }
    return (
        <div className={chipClass(chip)} role="group" aria-label={held} title={held}>
            <ChipBody chip={chip} />
        </div>
    );
}
