/**
 * Lobby.tsx — the pre-game screen (design §2.5). Keeps the `.lobby` root and
 * the `Play` label so the smoke script still finds its way in.
 */
import { useState } from 'react';

import { t } from '../i18n';
import { loadStats } from '../persistence/settings';
import type { Settings } from '../persistence/settings';
import { DifficultyPicker } from './DifficultyPicker';
import { LobbyHero } from './LobbyHero';
import { OpponentPicker } from './OpponentPicker';
import { RulesSheet } from './RulesSheet';

interface LobbyProps {
    readonly settings: Settings;
    readonly onChange: (settings: Settings) => void;
    readonly onPlay: () => void;
}

export function Lobby({ settings, onChange, onPlay }: LobbyProps) {
    const [showRules, setShowRules] = useState(false);
    const [stats] = useState(loadStats);

    return (
        <div className="lobby">
            <LobbyHero />
            <div className="lobby-controls">
                <p className="field-label">{t('lobby.opponents')}</p>
                <OpponentPicker
                    value={settings.opponents}
                    onChange={(opponents) => onChange({ ...settings, opponents })}
                />
                <p className="field-label">{t('lobby.difficulty')}</p>
                <DifficultyPicker
                    value={settings.difficulty}
                    onChange={(difficulty) => onChange({ ...settings, difficulty })}
                />
                <p className="lobby-stats">
                    {t('lobby.stats', { games: stats.gamesPlayed, wins: stats.gamesWon })}
                </p>
                <button type="button" className="btn primary big" onClick={onPlay}>
                    {t('lobby.play')}
                </button>
                <button type="button" className="btn link" onClick={() => setShowRules(true)}>
                    {t('lobby.howToPlay')}
                </button>
            </div>
            {showRules && <RulesSheet onClose={() => setShowRules(false)} />}
        </div>
    );
}
