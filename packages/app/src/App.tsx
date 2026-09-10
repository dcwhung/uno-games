import { useState } from 'react';
import { useBotDriver } from './game/botDriver';
import { loadSettings, saveSettings, type Settings } from './persistence/settings';
import { Scene } from './scene/Scene';
import { useGameStore } from './store/gameStore';
import { HUD } from './ui/HUD';
import { Lobby } from './ui/Lobby';
import { Toasts } from './ui/Toasts';

export function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const inGame = useGameStore((s) => s.state !== null);
  const newGame = useGameStore((s) => s.newGame);
  const reset = useGameStore((s) => s.reset);
  useBotDriver();

  const updateSettings = (s: Settings) => { setSettings(s); saveSettings(s); };

  return (
    <div className="app">
      <Scene />
      {inGame ? <><HUD onNewGame={reset} /><Toasts /></> : <Lobby settings={settings} onChange={updateSettings} onPlay={() => newGame(settings)} />}
    </div>
  );
}
