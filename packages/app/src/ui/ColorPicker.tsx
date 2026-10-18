/**
 * ColorPicker.tsx — the four swatches after the human plays a Wild.
 */
import { CARD_COLORS } from '@uno/engine';
import type { GameState } from '@uno/engine';

import { t } from '../i18n';
import { HUMAN_ID, useGameStore } from '../store/gameStore';
import { Sheet } from './Sheet';

export function ColorPicker({ state }: { readonly state: GameState }) {
    const dispatch = useGameStore((s) => s.dispatch);
    if (state.phase !== 'choosing_color' || state.currentPlayer !== HUMAN_ID) return null;
    return (
        <Sheet title={t('hud.chooseColor')} className="color-picker">
            <div className="colors">
                {CARD_COLORS.map((color) => (
                    <button
                        key={color}
                        type="button"
                        className={`swatch ${color}`}
                        aria-label={t(`color.${color}`)}
                        onClick={() => dispatch({ type: 'CHOOSE_COLOR', player: HUMAN_ID, color })}
                    />
                ))}
            </div>
        </Sheet>
    );
}
