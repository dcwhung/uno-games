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

const SOUND_OPTIONS: readonly SegmentedOption<'on' | 'off'>[] = [
    { value: 'on', label: t('menu.soundOn') },
    { value: 'off', label: t('menu.soundOff') },
];

function unoWindowLabel(ms: number): string {
    return ms === 0 ? t('menu.unoWindowOff') : t('menu.unoWindowSeconds', { n: ms / MS_PER_S });
}

const UNO_WINDOW_OPTIONS: readonly SegmentedOption<number>[] = UNO_WINDOW_OPTIONS_MS.map((ms) => ({
    value: ms,
    label: unoWindowLabel(ms),
}));

interface SettingsSheetProps {
    readonly settings: Settings;
    readonly onChange: (settings: Settings) => void;
    readonly onBack: () => void;
}

export function SettingsSheet({ settings, onChange, onBack }: SettingsSheetProps) {
    return (
        <div className="settings">
            <p className="field-label">{t('menu.sound')}</p>
            <Segmented
                label={t('menu.sound')}
                options={SOUND_OPTIONS}
                value={settings.sound ? 'on' : 'off'}
                onChange={(v) => onChange({ ...settings, sound: v === 'on' })}
            />
            <p className="field-label">{t('menu.unoWindow')}</p>
            <Segmented
                label={t('menu.unoWindow')}
                options={UNO_WINDOW_OPTIONS}
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
