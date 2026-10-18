/**
 * ActiveColorChip.tsx — swatch + colour name at the right end of the strip.
 * The swatch colour comes from the `--card-*` tokens via the colour class.
 */
import type { CardColor } from '@uno/engine';

import { t } from '../i18n';

export function ActiveColorChip({ color }: { readonly color: CardColor }) {
    const name = t(`color.${color}`);
    return (
        <div className="color-chip" aria-label={t('hud.activeColor', { color: name })}>
            <span className={`color-swatch ${color}`} aria-hidden="true" />
            <span className="name">{name}</span>
        </div>
    );
}
