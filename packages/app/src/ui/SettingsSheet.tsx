/**
 * SettingsSheet.tsx — sound on/off and the UNO call window (design §2.4 "Menu").
 * The window is frozen into the running game's RuleConfig, so it applies next game.
 */
import { t } from '../i18n';
import type { Settings } from '../persistence/settings';
import { Segmented } from './Segmented';
import type { SegmentedOption } from './Segmented';

const MS_PER_S = 1000;
const UNO_WINDOW_OPTIONS_MS = [0, 2000, 4000] as const;

type SoundValue = 'on' | 'off';
/** Only the keys live at module scope; labels are translated in render (W-083). */
const SOUND_LABEL_KEYS: Readonly<Record<SoundValue, string>> = {
    on: 'menu.soundOn',
    off: 'menu.soundOff',
};
const SOUND_VALUES: readonly SoundValue[] = ['on', 'off'];

function unoWindowLabel(ms: number): string {
    return ms === 0 ? t('menu.unoWindowOff') : t('menu.unoWindowSeconds', { n: ms / MS_PER_S });
}

function soundOptions(): readonly SegmentedOption<SoundValue>[] {
    return SOUND_VALUES.map((value) => ({ value, label: t(SOUND_LABEL_KEYS[value]) }));
}

function unoWindowOptions(): readonly SegmentedOption<number>[] {
    return UNO_WINDOW_OPTIONS_MS.map((ms) => ({ value: ms, label: unoWindowLabel(ms) }));
}

interface SettingsSheetProps {
    readonly settings: Settings;
    readonly onChange: (settings: Settings) => void;
    readonly onBack: () => void;
}

export function SettingsSheet({ settings, onChange, onBack }: SettingsSheetProps) {
    // Built per render so a later setLocale() reaches these labels like every other string.
    return (
        <div className="settings">
            <p className="field-label">{t('menu.sound')}</p>
            <Segmented
                label={t('menu.sound')}
                options={soundOptions()}
                value={settings.sound ? 'on' : 'off'}
                onChange={(v) => onChange({ ...settings, sound: v === 'on' })}
            />
            <p className="field-label">{t('menu.unoWindow')}</p>
            <Segmented
                label={t('menu.unoWindow')}
                options={unoWindowOptions()}
                value={settings.unoCallWindowMs}
                onChange={(ms) => onChange({ ...settings, unoCallWindowMs: ms })}
            />
            <p className="sheet-hint">{t('menu.unoWindowNote')}</p>
            <button type="button" className="btn ghost" onClick={onBack}>
                {t('menu.back')}
            </button>
        </div>
    );
}
