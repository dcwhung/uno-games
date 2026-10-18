/**
 * HUD.tsx — composes the in-game DOM layer (design §2.4). Every piece is its
 * own component; this file only decides where they sit.
 */
import type { Settings } from '../persistence/settings';
import { useGameStore } from '../store/gameStore';
import { ActionColumn } from './ActionColumn';
import { ActiveColorChip } from './ActiveColorChip';
import { Callouts } from './Callouts';
import { ChallengeSheet } from './ChallengeSheet';
import { ColorPicker } from './ColorPicker';
import { DrawnCardHint } from './DrawnCardHint';
import { PauseMenu } from './PauseMenu';
import { PlayerStrip } from './PlayerStrip';
import { RoundOverSheet } from './RoundOverSheet';
import { Toasts } from './Toasts';
import { TurnBanner } from './TurnBanner';

interface HUDProps {
    readonly settings: Settings;
    readonly onSettingsChange: (settings: Settings) => void;
    readonly onNewGame: () => void;
    readonly onQuit: () => void;
}

export function HUD({ settings, onSettingsChange, onNewGame, onQuit }: HUDProps) {
    const state = useGameStore((s) => s.state);
    if (!state) return null;
    return (
        <div className="hud">
            <div className="hud-top">
                <PauseMenu
                    settings={settings}
                    onSettingsChange={onSettingsChange}
                    onQuit={onQuit}
                />
                <PlayerStrip state={state} />
                <ActiveColorChip color={state.activeColor} />
            </div>
            <TurnBanner state={state} />
            <Callouts />
            <div className="hud-bottom-centre">
                <DrawnCardHint state={state} />
                <Toasts />
            </div>
            <ActionColumn state={state} />
            <ColorPicker state={state} />
            <ChallengeSheet state={state} />
            <RoundOverSheet state={state} onNewGame={onNewGame} onQuit={onQuit} />
        </div>
    );
}
