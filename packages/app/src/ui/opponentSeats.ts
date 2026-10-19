/**
 * opponentSeats.ts — accessible name of a lobby seat card (design §2.5).
 *
 * Pure so the copy is pinned by a spec: the label must not start with "Play",
 * or scripts/smoke.mjs's `getByRole('button', { name: 'Play' })` resolves to
 * the seat cards as well as the primary CTA.
 */
import { t } from '../i18n';

const SINGLE_OPPONENT = 1;

export function seatLabel(count: number): string {
    return count === SINGLE_OPPONENT
        ? t('lobby.seatAria.one')
        : t('lobby.seatAria.other', { n: count });
}
