import type { BotDifficulty } from '@uno/engine';
import { t } from '../i18n';
import type { Settings } from '../persistence/settings';

const OPPONENT_OPTIONS = [1, 2, 3] as const;
const DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'medium', 'hard'];

interface Props {
    readonly settings: Settings;
    readonly onChange: (s: Settings) => void;
    readonly onPlay: () => void;
}

export function Lobby({ settings, onChange, onPlay }: Props) {
    return (
        <div className="lobby">
            <h1>{t('app.title')}</h1>
            <p className="variant">{t('variant.classic')}</p>
            <label>{t('lobby.opponents')}</label>
            <div className="row">
                {OPPONENT_OPTIONS.map((n) => (
                    <button
                        key={n}
                        className={`chip${settings.opponents === n ? ' on' : ''}`}
                        onClick={() => onChange({ ...settings, opponents: n })}
                    >
                        {n}
                    </button>
                ))}
            </div>
            <label>{t('lobby.difficulty')}</label>
            <div className="row">
                {DIFFICULTIES.map((d) => (
                    <button
                        key={d}
                        className={`chip${settings.difficulty === d ? ' on' : ''}`}
                        onClick={() => onChange({ ...settings, difficulty: d })}
                    >
                        {t(`difficulty.${d}`)}
                    </button>
                ))}
            </div>
            <button className="btn primary big" onClick={onPlay}>
                {t('lobby.play')}
            </button>
        </div>
    );
}
