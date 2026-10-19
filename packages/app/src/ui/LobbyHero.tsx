/**
 * LobbyHero.tsx — three CSS cards fanned above the wordmark (design §2.5).
 * Pure presentation: the cards are divs styled from the `--card-*` tokens.
 */
import { t } from '../i18n';

const SEVEN = '7';

export function LobbyHero() {
    return (
        <div className="lobby-hero">
            <div className="card-fan" aria-hidden="true">
                <div className="lobby-card red left">
                    <span className="oval" />
                    <span className="glyph">{SEVEN}</span>
                </div>
                <div className="lobby-card wild mid">
                    <span className="oval" />
                </div>
                <div className="lobby-card blue right">
                    <span className="oval" />
                    <span className="glyph">
                        <span className="glyph-skip" />
                    </span>
                </div>
            </div>
            <h1 className="wordmark">{t('app.title')}</h1>
            <p className="lobby-subtitle">{t('lobby.subtitle')}</p>
        </div>
    );
}
