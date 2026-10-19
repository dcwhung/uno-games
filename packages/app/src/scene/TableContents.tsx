/**
 * TableContents.tsx — every card on the table plus the opponent seats, driven
 * by store state. Split out of Scene.tsx so the environment (table, lights,
 * camera) and the card layer can evolve independently.
 */
import { useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';
import { core, elementAt } from '@uno/engine';
import type { CardId, GameState } from '@uno/engine';
import { HUMAN_ID, legalMovesForHuman, useGameStore } from '../store/gameStore';
import { CardMesh } from './CardMesh';
import { SEAT_COLORS } from './constants';
import { computeLayout, seatPositions, spawnPositionFor } from './layout';
import type { CardTarget, LayoutViewport } from './layout';
import { Opponent } from './Opponent';

// Invariant labels (W-009): `computeLayout` emits one target per card already in
// `state.cards`, `seatPositions` one seat per opponent, and the colour index is a
// modulo of the palette's own length.
const OPPONENT_SEAT = 'seat per opponent';
const SEAT_COLOR = 'seat colour';

interface TableLayout {
    readonly legal: ReadonlySet<CardId>;
    readonly targets: readonly CardTarget[];
    /** The canvas aspect the targets were laid out for; seats follow it too. */
    readonly viewport: LayoutViewport;
    /** Where new cards mount: above this viewport's draw pile. */
    readonly spawn: THREE.Vector3;
}

/** Legal moves and the card targets for this state, selection and canvas aspect. */
function useTableLayout(state: GameState, selected: CardId | null): TableLayout {
    // The fan spread adapts to the canvas aspect (polish-v0.3 §2.3); memoised on the
    // two numbers so a resize that keeps the aspect does not relayout.
    const { size } = useThree();
    const viewport = useMemo<LayoutViewport>(
        () => ({ aspect: size.width / size.height }),
        [size.width, size.height],
    );
    const legal = useMemo(() => new Set(legalMovesForHuman(state).map((m) => m.card)), [state]);
    const targets = useMemo(
        () => computeLayout(state, HUMAN_ID, selected, legal, viewport),
        [state, selected, legal, viewport],
    );
    const spawn = useMemo(() => spawnPositionFor(viewport), [viewport]);
    return { legal, targets, viewport, spawn };
}

export function TableContents({ state }: { state: GameState }) {
    const selected = useGameStore((s) => s.selectedCard) as CardId | null;
    const select = useGameStore((s) => s.select);
    const dispatch = useGameStore((s) => s.dispatch);
    const { legal, targets, viewport, spawn } = useTableLayout(state, selected);

    const playCard = (id: CardId) => {
        if (!legal.has(id)) {
            select(null);
            return;
        }
        dispatch({ type: 'PLAY_CARD', player: HUMAN_ID, card: id });
    };

    const opponents = state.players.filter((p) => p.id !== HUMAN_ID);
    const seats = seatPositions(opponents.length, viewport);

    return (
        <>
            {targets.map((t) => (
                <CardMesh
                    key={t.id}
                    face={core.getCard(state, t.id).front}
                    target={t}
                    spawn={spawn}
                    onTap={() => (selected === t.id ? playCard(t.id) : select(t.id))}
                    onSwipeUp={() => playCard(t.id)}
                />
            ))}
            {opponents.map((p, i) => (
                <Opponent
                    key={p.id}
                    seat={elementAt(seats, i, OPPONENT_SEAT)}
                    color={elementAt(SEAT_COLORS, i % SEAT_COLORS.length, SEAT_COLOR)}
                    active={
                        state.currentPlayer === p.id &&
                        state.phase !== 'round_over' &&
                        state.phase !== 'game_over'
                    }
                    catchable={state.unoVulnerable === p.id}
                    onCatch={() => dispatch({ type: 'CATCH_UNO', player: HUMAN_ID, target: p.id })}
                />
            ))}
        </>
    );
}
