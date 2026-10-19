/**
 * RulesSheet.tsx — short Classic rules; opened from the lobby and the pause menu.
 */
import { t } from '../i18n';
import { Sheet } from './Sheet';

const RULE_KEYS = [
    'rules.goal',
    'rules.match',
    'rules.draw',
    'rules.actions',
    'rules.uno',
] as const;

export function RulesSheet({ onClose }: { readonly onClose: () => void }) {
    return (
        <Sheet title={t('rules.title')} className="rules" onClose={onClose}>
            <ol className="rules-list">
                {RULE_KEYS.map((key) => (
                    <li key={key}>{t(key)}</li>
                ))}
            </ol>
            <button type="button" className="btn primary" onClick={onClose}>
                {t('rules.close')}
            </button>
        </Sheet>
    );
}
