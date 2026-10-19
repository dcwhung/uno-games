/**
 * ActiveColorChip.tsx — swatch + colour name at the right end of the strip.
 * The swatch colour comes from the `--card-*` tokens via the colour class.
 * Below the compact breakpoint only the swatch shows; the colour name stays
 * in the accessible label and the `title`.
 */
import type { CardColor } from '@uno/engine';

import { t } from '../i18n';

export function ActiveColorChip({ color }: { readonly color: CardColor }) {
    const name = t(`color.${color}`);
    const label = t('hud.activeColor', { color: name });
    return (
        <div className="color-chip" role="status" aria-label={label} title={label}>
            <span className={`color-swatch ${color}`} aria-hidden="true" />
            <span className="name">{name}</span>
        </div>
    );
}
