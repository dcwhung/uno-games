/**
 * TableContents.tsx — every card on the table plus the opponent seats, driven
 * by store state. Split out of Scene.tsx so the environment (table, lights,
 * camera) and the card layer can evolve independently.
 */
import { useMemo } from 'react';
import { core, elementAt } from '@uno/engine';
import type { CardId, GameState } from '@uno/engine';
import { HUMAN_ID, legalMovesForHuman, playerName, useGameStore } from '../store/gameStore';
import { CardMesh } from './CardMesh';
import { SEAT_COLORS } from './constants';
import { computeLayout, seatPositions } from './layout';
import { Opponent } from './Opponent';

// Invariant labels (W-009): `computeLayout` emits one target per card already in
// `state.cards`, `seatPositions` one seat per opponent, and the colour index is a
// modulo of the palette's own length.
const OPPONENT_SEAT = 'seat per opponent';
const SEAT_COLOR = 'seat colour';

export function TableContents({ state }: { state: GameState }) {
    const selected = useGameStore((s) => s.selectedCard) as CardId | null;
    const select = useGameStore((s) => s.select);
    const dispatch = useGameStore((s) => s.dispatch);

    const legal = useMemo(() => new Set(legalMovesForHuman(state).map((m) => m.card)), [state]);
    const targets = useMemo(
        () => computeLayout(state, HUMAN_ID, selected, legal),
        [state, selected, legal],
    );

    const playCard = (id: CardId) => {
        if (!legal.has(id)) {
            select(null);
            return;
        }
        dispatch({ type: 'PLAY_CARD', player: HUMAN_ID, card: id });
    };

    const opponents = state.players.filter((p) => p.id !== HUMAN_ID);
    const seats = seatPositions(opponents.length);

    return (
        <>
            {targets.map((t) => (
                <CardMesh
                    key={t.id}
                    face={core.getCard(state, t.id).front}
                    target={t}
                    onTap={() => (selected === t.id ? playCard(t.id) : select(t.id))}
                    onSwipeUp={() => playCard(t.id)}
                />
            ))}
            {opponents.map((p, i) => (
                <Opponent
                    key={p.id}
                    id={p.id}
                    seat={elementAt(seats, i, OPPONENT_SEAT)}
                    color={elementAt(SEAT_COLORS, i % SEAT_COLORS.length, SEAT_COLOR)}
                    active={
                        state.currentPlayer === p.id &&
                        state.phase !== 'round_over' &&
                        state.phase !== 'game_over'
                    }
                    catchable={state.unoVulnerable === p.id}
                    name={playerName(state, p.id)}
                    cards={p.hand.length}
                    calledUno={p.calledUno}
                    onCatch={() => dispatch({ type: 'CATCH_UNO', player: HUMAN_ID, target: p.id })}
                />
            ))}
        </>
    );
}
