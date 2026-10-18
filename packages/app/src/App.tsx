import { useState } from 'react';

import { play } from './audio/sfx';
import { useSfx } from './audio/useSfx';
import { useBotDriver } from './game/botDriver';
import { loadSettings, saveSettings } from './persistence/settings';
import type { Settings } from './persistence/settings';
import { useStatsTracker } from './persistence/useStatsTracker';
import { Scene } from './scene/Scene';
import { useGameStore } from './store/gameStore';
import { HUD } from './ui/HUD';
import { Lobby } from './ui/Lobby';

export function App() {
    const [settings, setSettings] = useState<Settings>(loadSettings);
    const inGame = useGameStore((s) => s.state !== null);
    const newGame = useGameStore((s) => s.newGame);
    const reset = useGameStore((s) => s.reset);
    useBotDriver();
    useSfx(settings.sound);
    useStatsTracker();

    const updateSettings = (s: Settings) => {
        setSettings(s);
        saveSettings(s);
    };
    const startGame = () => {
        play('tap');
        newGame(settings);
    };

    return (
        <div className="app">
            <Scene />
            {inGame ? (
                <HUD
                    settings={settings}
                    onSettingsChange={updateSettings}
                    onNewGame={startGame}
                    onQuit={reset}
                />
            ) : (
                <Lobby settings={settings} onChange={updateSettings} onPlay={startGame} />
            )}
        </div>
    );
}
