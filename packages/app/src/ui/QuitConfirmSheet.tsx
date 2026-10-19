/**
 * QuitConfirmSheet.tsx — "Leave this game?" with Cancel as the safe default.
 */
import { t } from '../i18n';
import { Sheet } from './Sheet';

interface QuitConfirmSheetProps {
    readonly onCancel: () => void;
    readonly onQuit: () => void;
}

export function QuitConfirmSheet({ onCancel, onQuit }: QuitConfirmSheetProps) {
    return (
        <Sheet title={t('menu.quit')} className="menu" onClose={onCancel}>
            <p className="sheet-hint">{t('menu.quitConfirm')}</p>
            <div className="row">
                <button type="button" className="btn ghost" onClick={onCancel}>
                    {t('menu.cancel')}
                </button>
                <button type="button" className="btn primary" onClick={onQuit}>
                    {t('menu.quitYes')}
                </button>
            </div>
        </Sheet>
    );
}
