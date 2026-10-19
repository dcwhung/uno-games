/**
 * PauseMenu.tsx — the `☰` button and the sheet behind it (design §2.4 "Menu").
 *
 * One sheet at a time, four views, so focus stays inside a single dialog while
 * the player moves between the menu, settings, rules and the quit confirmation.
 * While any view is open the store is paused (W-081): the bot driver schedules
 * nothing, so the table really does wait for the player.
 */
import { useEffect, useState } from 'react';

import { t } from '../i18n';
import type { Settings } from '../persistence/settings';
import { useGameStore } from '../store/gameStore';
import { MenuSheet } from './MenuSheet';
import { QuitConfirmSheet } from './QuitConfirmSheet';
import { RulesSheet } from './RulesSheet';
import { SettingsSheet } from './SettingsSheet';
import { Sheet } from './Sheet';

const MENU_ICON = '☰';
const VIEW = {
    CLOSED: 'closed',
    MENU: 'menu',
    SETTINGS: 'settings',
    RULES: 'rules',
    QUIT: 'quit',
} as const;
type View = (typeof VIEW)[keyof typeof VIEW];

interface PauseMenuProps {
    readonly settings: Settings;
    readonly onSettingsChange: (settings: Settings) => void;
    readonly onQuit: () => void;
}

export function PauseMenu({ settings, onSettingsChange, onQuit }: PauseMenuProps) {
    const [view, setView] = useState<View>(VIEW.CLOSED);
    const setPaused = useGameStore((s) => s.setPaused);
    const close = () => setView(VIEW.CLOSED);
    const backToMenu = () => setView(VIEW.MENU);
    const open = view !== VIEW.CLOSED;

    useEffect(() => {
        setPaused(open);
        // Unmounting mid-menu (quit → lobby) must not leave the next game paused.
        return () => setPaused(false);
    }, [open, setPaused]);

    return (
        <>
            <button
                type="button"
                className="menu-button"
                aria-label={t('menu.open')}
                aria-haspopup="dialog"
                onClick={backToMenu}
            >
                {MENU_ICON}
            </button>
            {view === VIEW.MENU && (
                <MenuSheet
                    onResume={close}
                    onRules={() => setView(VIEW.RULES)}
                    onSettings={() => setView(VIEW.SETTINGS)}
                    onQuit={() => setView(VIEW.QUIT)}
                />
            )}
            {view === VIEW.SETTINGS && (
                <Sheet title={t('menu.settings')} className="menu" onClose={backToMenu}>
                    <SettingsSheet
                        settings={settings}
                        onChange={onSettingsChange}
                        onBack={backToMenu}
                    />
                </Sheet>
            )}
            {view === VIEW.RULES && <RulesSheet onClose={backToMenu} />}
            {view === VIEW.QUIT && <QuitConfirmSheet onCancel={backToMenu} onQuit={onQuit} />}
        </>
    );
}
