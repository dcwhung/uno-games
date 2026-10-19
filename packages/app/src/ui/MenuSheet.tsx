/**
 * MenuSheet.tsx — the pause menu's top level: Resume, How to play, Settings, Quit.
 */
import { t } from '../i18n';
import { Sheet } from './Sheet';

interface MenuSheetProps {
    readonly onResume: () => void;
    readonly onRules: () => void;
    readonly onSettings: () => void;
    readonly onQuit: () => void;
}

export function MenuSheet({ onResume, onRules, onSettings, onQuit }: MenuSheetProps) {
    return (
        <Sheet title={t('menu.title')} className="menu" onClose={onResume}>
            <div className="menu-list">
                <button type="button" className="btn primary" onClick={onResume}>
                    {t('menu.resume')}
                </button>
                <button type="button" className="btn ghost" onClick={onRules}>
                    {t('menu.howToPlay')}
                </button>
                <button type="button" className="btn ghost" onClick={onSettings}>
                    {t('menu.settings')}
                </button>
                <button type="button" className="btn ghost danger" onClick={onQuit}>
                    {t('menu.quit')}
                </button>
            </div>
        </Sheet>
    );
}
