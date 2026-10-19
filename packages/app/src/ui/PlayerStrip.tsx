/**
 * PlayerStrip.tsx — one chip per seat along the top (design §2.4).
 * Scores are deliberately absent here; they live in the round-over sheet.
 */
import type { GameState } from '@uno/engine';

import { HUMAN_ID, useGameStore } from '../store/gameStore';
import { PlayerChip } from './PlayerChip';
import { buildPlayerChips } from './playerChips';

export function PlayerStrip({ state }: { readonly state: GameState }) {
    const dispatch = useGameStore((s) => s.dispatch);
    const chips = buildPlayerChips(state);
    return (
        <div className="player-strip">
            {chips.map((chip) => (
                <PlayerChip
                    key={chip.id}
                    chip={chip}
                    onCatch={() =>
                        dispatch({ type: 'CATCH_UNO', player: HUMAN_ID, target: chip.id })
                    }
                />
            ))}
        </div>
    );
}
