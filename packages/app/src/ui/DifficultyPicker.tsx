/**
 * DifficultyPicker.tsx — segmented Easy / Medium / Hard with one-line descriptions.
 */
import type { BotDifficulty } from '@uno/engine';

import { t } from '../i18n';
import { Segmented } from './Segmented';
import type { SegmentedOption } from './Segmented';

const DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'medium', 'hard'];

/** Translated per render, not at import, so setLocale() reaches these labels (W-083). */
function difficultyOptions(): readonly SegmentedOption<BotDifficulty>[] {
    return DIFFICULTIES.map((d) => ({
        value: d,
        label: t(`difficulty.${d}`),
        description: t(`difficulty.${d}.desc`),
    }));
}

interface DifficultyPickerProps {
    readonly value: BotDifficulty;
    readonly onChange: (difficulty: BotDifficulty) => void;
}

export function DifficultyPicker({ value, onChange }: DifficultyPickerProps) {
    return (
        <Segmented
            label={t('lobby.difficulty')}
            options={difficultyOptions()}
            value={value}
            onChange={onChange}
        />
    );
}
