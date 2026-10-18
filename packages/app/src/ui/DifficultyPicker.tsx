/**
 * DifficultyPicker.tsx — segmented Easy / Medium / Hard with one-line descriptions.
 */
import type { BotDifficulty } from '@uno/engine';

import { t } from '../i18n';
import { Segmented } from './Segmented';
import type { SegmentedOption } from './Segmented';

const DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'medium', 'hard'];

const OPTIONS: readonly SegmentedOption<BotDifficulty>[] = DIFFICULTIES.map((d) => ({
    value: d,
    label: t(`difficulty.${d}`),
    description: t(`difficulty.${d}.desc`),
}));

interface DifficultyPickerProps {
    readonly value: BotDifficulty;
    readonly onChange: (difficulty: BotDifficulty) => void;
}

export function DifficultyPicker({ value, onChange }: DifficultyPickerProps) {
    return (
        <Segmented
            label={t('lobby.difficulty')}
            options={OPTIONS}
            value={value}
            onChange={onChange}
        />
    );
}
