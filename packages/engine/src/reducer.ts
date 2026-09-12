/**
 * reducer.ts — the engine. Pure: apply(state, action) → { state, events }.
 *
 * Turn-flow contract with plugins (see RulePlugin.onCardPlayed):
 *  - The reducer moves the card to the discard pile and sets activeColor for
 *    coloured cards BEFORE calling the plugin.
 *  - The plugin applies effects. To skip someone it sets currentPlayer to the
 *    skipped player; the reducer then advances one step from there.
 *  - If the plugin leaves phase as 'choosing_color' or 'challenge_window' the
 *    reducer does NOT advance; the follow-up action resumes the flow.
 *  - pendingDraw is owned by the plugin: the reducer never clears it while a
 *    card is being played, so onCardPlayed sees the amount in force (stacking).
 *    Only START_ROUND and the Draw Four resolution reset it.
 *  - UNO vulnerability is judged AFTER onCardPlayed, from the hand the effects
 *    left behind (Discard All can drop a player to one card). A player the
 *    effects eliminated is never marked — they are out of the round.
 *  - onTurnStart(state, player) runs each time the reducer hands the turn to a
 *    player: after TurnChanged in advanceTurn, after the dealer-first Reverse
 *    opening, and once the opening-Wild colour is chosen. Its events follow
 *    TurnChanged. The reducer does not advance again afterwards; a hook that
 *    ends the turn must move currentPlayer and emit TurnChanged itself.
 *  - finishPlay asks isRoundOver first; the empty-hand rule is the fallback.
 */
import { actionShapeReason, isSeatedPlayer, validRoster } from './actionGuard';
import {
    activeFace,
    bumpTick,
    cardFrom,
    drawCards,
    getCard,
    getPlayer,
    invariant,
    isEliminated,
    isUnoCallHandSize,
    isUnoCallPhase,
    merge,
    nextPlayerId,
    playerAt,
    takeFromDrawPile,
    topCard,
    updatePlayer,
} from './core';
import { rngForTick } from './rng';
import {
    INITIAL_HAND_SIZE,
    MIN_PLAYERS,
    NO_TRAITS,
    PENALTY,
    type Action,
    type ApplyResult,
    type Card,
    type CardColor,
    type CardFace,
    type CardId,
    type Draw4Challenge,
    type Engine,
    type GameEvent,
    type GameState,
    type LegalMove,
    type PlayerConfig,
    type PlayerId,
    type PublicDraw4Challenge,
    type PublicView,
    type RejectReason,
    type RuleConfig,
    type RulePlugin,
    type Seed,
    type VariantId,
} from './types';

const FIRST_ROUND = 1;
const UNO_HAND_SIZE = 1;
const SINGLE_DRAW = 1;

type Registry = Readonly<Partial<Record<VariantId, RulePlugin>>>;

/** Hands dealt for a round plus what remains of the draw pile afterwards. */
interface DealtHands {
    readonly hands: Record<PlayerId, CardId[]>;
    readonly drawPile: CardId[];
}

/** The opening card flipped from the draw pile; `state` carries any ticks spent on redraws. */
interface OpeningCard {
    readonly state: GameState;
    readonly drawPile: CardId[];
    readonly opening: CardId;
}

/** The hand `dealHands` seeded for this seat, before / after it was filled. */
function dealtHand(hands: Readonly<Record<PlayerId, CardId[]>>, id: PlayerId): CardId[] {
    return invariant(hands[id], `player ${id} was dealt a hand`);
}

/** Deal INITIAL_HAND_SIZE cards one at a time in seat `order`, from the top of `deck`. */
function dealHands(order: readonly PlayerId[], deck: readonly CardId[]): DealtHands {
    const drawPile = deck.slice();
    const hands: Record<PlayerId, CardId[]> = {};
    for (const id of order) hands[id] = [];
    for (let k = 0; k < INITIAL_HAND_SIZE; k++) {
        for (const id of order) dealtHand(hands, id).push(takeFromDrawPile(drawPile));
    }
    return { hands, drawPile };
}

/** Flip the opening card. A Wild Draw Four goes back into the deck and we reshuffle and redraw. */
function pickOpeningCard(
    state: GameState,
    pile: readonly CardId[],
    cardMap: Record<CardId, Card>,
): OpeningCard {
    let s = state;
    let drawPile = pile.slice();
    let opening = takeFromDrawPile(drawPile);
    while (activeFace(s, cardFrom(cardMap, opening)).kind === 'wild_draw4') {
        s = bumpTick(s);
        const { items } = rngForTick(s.seed, s.tick).shuffle([...drawPile, opening]);
        drawPile = items.slice();
        opening = takeFromDrawPile(drawPile);
    }
    return { state: s, drawPile, opening };
}

/** Assemble the in-play round state: hands, piles, dealer on turn, and a clean slate for per-round flags. */
function enterPlaying(
    flipped: OpeningCard,
    dealt: DealtHands,
    cardMap: Record<CardId, Card>,
    dealer: PlayerId,
): GameState {
    const s = flipped.state;
    const openingFace = activeFace(s, cardFrom(cardMap, flipped.opening));
    return {
        ...s,
        phase: 'playing',
        cards: cardMap,
        drawPile: flipped.drawPile,
        discardPile: [flipped.opening],
        players: s.players.map((p) => ({
            ...p,
            hand: dealtHand(dealt.hands, p.id),
            calledUno: false,
            eliminated: false,
        })),
        currentPlayer: dealer,
        activeColor: openingFace.color === 'wild' ? s.activeColor : openingFace.color,
        pendingDraw: undefined,
        draw4Challenge: undefined,
        unoVulnerable: undefined,
        drawnCard: undefined,
        roundWinner: undefined,
        openingWild: false,
    };
}

/**
 * No missed UNO call is on offer for this CATCH_UNO: the target names no seat,
 * is not the exposed player, is the catcher themselves, or is already out of
 * the round.
 *
 * The seat check has to come first, and not only so the eliminated lookup sees
 * a real id: `unoVulnerable` is undefined for most of a round, so a malformed
 * action whose `target` is also undefined would compare *equal* to it and fall
 * straight through to that lookup (CUI-0405). The entry guard covers `player`;
 * `target` is this handler's own to vet, and it answers 'no_uno_to_catch'
 * because from here a target that is not a seat is simply nobody to catch.
 */
function nothingToCatch(state: GameState, action: Extract<Action, { type: 'CATCH_UNO' }>): boolean {
    if (!isSeatedPlayer(state, action.target)) return true;
    if (state.unoVulnerable !== action.target) return true;
    return action.player === action.target || isEliminated(state, action.target);
}

export function createEngine(registry: Registry): Engine {
    function plugin(state: GameState): RulePlugin {
        const p = registry[state.config.variant];
        if (!p) throw new Error(`No rule plugin registered for ${state.config.variant}`);
        return p;
    }

    // -------------------------------------------------------------------------
    // Initial state
    // -------------------------------------------------------------------------

    function createInitialState(config: RuleConfig, seed: Seed): GameState {
        return {
            config,
            seed,
            tick: 0,
            phase: 'lobby',
            players: [],
            playerConfigs: [],
            currentPlayer: '' as PlayerId,
            direction: 1,
            cards: {},
            drawPile: [],
            discardPile: [],
            activeSide: 'front',
            activeColor: 'red',
            round: 0,
        };
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    function reject(state: GameState, action: Action, reason: RejectReason): ApplyResult {
        return { state, events: [{ type: 'ActionRejected', action, reason }] };
    }

    function requireTurn(state: GameState, player: PlayerId): RejectReason | undefined {
        if (state.phase !== 'playing') return 'wrong_phase';
        if (state.currentPlayer !== player) return 'not_your_turn';
        return undefined;
    }

    /** Give the plugin its turn-start hook for `player`; no-op when the plugin has none. */
    function startTurn(state: GameState, player: PlayerId): ApplyResult {
        return plugin(state).onTurnStart?.(state, player) ?? { state, events: [] };
    }

    function advanceTurn(state: GameState): ApplyResult {
        const next = nextPlayerId(state, state.currentPlayer);
        const changed: ApplyResult = {
            state: { ...state, currentPlayer: next, drawnCard: undefined },
            events: [{ type: 'TurnChanged', player: next }],
        };
        return merge(changed, startTurn(changed.state, next));
    }

    /** Default round-over rule: the player who just acted has emptied their hand. */
    function emptyHandWinner(state: GameState, player: PlayerId): PlayerId | undefined {
        return getPlayer(state, player).hand.length === 0 ? player : undefined;
    }

    /** Called once a card's effects are fully resolved. The plugin's isRoundOver wins over the default. */
    function finishPlay(state: GameState, player: PlayerId): ApplyResult {
        const winner = plugin(state).isRoundOver?.(state) ?? emptyHandWinner(state, player);
        if (winner !== undefined) return endRound(state, winner);
        return advanceTurn(state);
    }

    function endRound(state: GameState, winner: PlayerId): ApplyResult {
        const rules = plugin(state);
        let points = 0;
        for (const p of state.players) {
            // An eliminated player's cards left the round with them; the plugin decides where they went.
            if (p.id === winner || p.eliminated) continue;
            for (const id of p.hand)
                points += rules.cardPoints(getCard(state, id), state.activeSide);
        }
        let next = updatePlayer(state, winner, { score: getPlayer(state, winner).score + points });
        const scores = Object.fromEntries(next.players.map((p) => [p.id, p.score])) as Record<
            PlayerId,
            number
        >;
        const events: GameEvent[] = [{ type: 'RoundEnded', winner, points, scores }];
        next = {
            ...next,
            phase: 'round_over',
            roundWinner: winner,
            unoVulnerable: undefined,
            drawnCard: undefined,
        };

        // Read back off the state rather than out of `scores`: same number, no lookup to assert.
        if (getPlayer(next, winner).score >= state.config.targetScore) {
            next = { ...next, phase: 'game_over', gameWinner: winner };
            events.push({ type: 'GameEnded', winner });
        }
        return { state: next, events };
    }

    /**
     * Judged from the hand the card effects left behind, so plugin discards /
     * draws count. A player the effects eliminated is out of the round, so
     * there is nothing left to catch them for.
     */
    function markUnoVulnerable(state: GameState, player: PlayerId): GameState {
        const me = getPlayer(state, player);
        if (me.hand.length === UNO_HAND_SIZE && !me.calledUno && !me.eliminated)
            return { ...state, unoVulnerable: player };
        return state;
    }

    function clearUnoVulnerabilityFor(state: GameState, actor: PlayerId): GameState {
        // Once the next player acts, the window to catch a missed UNO has closed.
        if (state.unoVulnerable && state.unoVulnerable !== actor) {
            return { ...state, unoVulnerable: undefined };
        }
        return state;
    }

    // -------------------------------------------------------------------------
    // Action handlers
    // -------------------------------------------------------------------------

    function startGame(
        state: GameState,
        action: Extract<Action, { type: 'START_GAME' }>,
    ): ApplyResult {
        if (state.phase !== 'lobby') return reject(state, action, 'wrong_phase');
        // The roster is the one actor-shaped field the entry guard cannot check,
        // because the table it would check against is the one being created here.
        // validRoster covers both halves: a seatable size, and seats that are
        // objects with a string id rather than whatever a corrupted log held.
        const roster = validRoster(action.players);
        if (roster === undefined) return reject(state, action, 'variant_rule');
        const players = roster.players.map((p: PlayerConfig) => ({
            id: p.id,
            hand: [],
            calledUno: false,
            score: 0,
        }));
        const next: GameState = {
            ...state,
            phase: 'round_over',
            players,
            playerConfigs: roster.players,
            currentPlayer: roster.dealer.id,
            round: 0,
        };
        return {
            state: next,
            events: [{ type: 'GameStarted', players: players.map((p) => p.id) }],
        };
    }

    function startRound(state: GameState, action: Action): ApplyResult {
        if (state.phase !== 'round_over') return reject(state, action, 'wrong_phase');
        const rules = plugin(state);
        const round = state.round + 1;
        const dealerIdx = (round - FIRST_ROUND) % state.players.length;
        const dealer = playerAt(state, dealerIdx).id;

        const fresh: GameState = bumpTick({ ...state, round, direction: 1, activeSide: 'front' });
        const { cards } = rules.buildDeck(rngForTick(fresh.seed, fresh.tick));
        const cardMap: Record<CardId, Card> = {};
        for (const c of cards) cardMap[c.id] = c;

        // Deal clockwise from dealer's left.
        const order = state.players.map(
            (_, i) => playerAt(state, (dealerIdx + 1 + i) % state.players.length).id,
        );
        const dealt = dealHands(
            order,
            cards.map((c) => c.id),
        );
        const flipped = pickOpeningCard(fresh, dealt.drawPile, cardMap);
        const events: GameEvent[] = [
            { type: 'RoundStarted', round, dealer },
            ...order.map((id): GameEvent => ({
                type: 'CardsDealt',
                player: id,
                cards: dealtHand(dealt.hands, id),
            })),
            { type: 'DiscardStarted', card: flipped.opening },
        ];

        // Treat the opening card as if the dealer played it.
        const s = enterPlaying(flipped, dealt, cardMap, dealer);
        const effect = rules.onCardPlayed(s, dealer, flipped.opening);
        const played: ApplyResult = { state: effect.state, events: [...events, ...effect.events] };
        return openingHandOver(played, activeFace(s, cardFrom(cardMap, flipped.opening)), dealer);
    }

    /** Hand the first turn over after the opening card's effects; an opening Wild waits for a colour first. */
    function openingHandOver(
        out: ApplyResult,
        openingFace: CardFace,
        dealer: PlayerId,
    ): ApplyResult {
        if (out.state.phase === 'choosing_color') {
            const first = nextPlayerId(out.state, dealer);
            return {
                state: { ...out.state, currentPlayer: first, openingWild: true },
                events: out.events,
            };
        }
        if (openingFace.kind === 'reverse' && out.state.players.length > MIN_PLAYERS) {
            // Dealer plays first when the opening card is a Reverse (with two players the plugin already skipped).
            const dealerFirst: ApplyResult = {
                state: out.state,
                events: [...out.events, { type: 'TurnChanged', player: dealer }],
            };
            return merge(dealerFirst, startTurn(dealerFirst.state, dealer));
        }
        return merge(out, advanceTurn(out.state));
    }

    function playCard(
        state: GameState,
        action: Extract<Action, { type: 'PLAY_CARD' }>,
    ): ApplyResult {
        const bad = requireTurn(state, action.player);
        if (bad) return reject(state, action, bad);
        const me = getPlayer(state, action.player);
        if (!me.hand.includes(action.card)) return reject(state, action, 'card_not_in_hand');
        if (state.drawnCard !== undefined && state.drawnCard !== action.card)
            return reject(state, action, 'illegal_card');
        const rules = plugin(state);
        if (!rules.isLegal(state, action.player, action.card))
            return reject(state, action, 'illegal_card');

        const face = activeFace(state, getCard(state, action.card));
        let s = clearUnoVulnerabilityFor(state, action.player);
        s = bumpTick(s);
        s = updatePlayer(s, action.player, { hand: me.hand.filter((id) => id !== action.card) });
        s = {
            ...s,
            discardPile: [...s.discardPile, action.card],
            activeColor: face.color === 'wild' ? s.activeColor : face.color,
            drawnCard: undefined,
            draw4Challenge: undefined,
        };

        const played: ApplyResult = {
            state: s,
            events: [{ type: 'CardPlayed', player: action.player, card: action.card }],
        };
        const effect = rules.onCardPlayed(s, action.player, action.card, action.chosenColor);
        const out: ApplyResult = {
            state: markUnoVulnerable(effect.state, action.player),
            events: [...played.events, ...effect.events],
        };
        if (out.state.phase !== 'playing') return out;
        return merge(out, finishPlay(out.state, action.player));
    }

    function drawCard(
        state: GameState,
        action: Extract<Action, { type: 'DRAW_CARD' }>,
    ): ApplyResult {
        const bad = requireTurn(state, action.player);
        if (bad) return reject(state, action, bad);
        if (state.drawnCard !== undefined) return reject(state, action, 'wrong_phase');

        let s = clearUnoVulnerabilityFor(state, action.player);
        s = bumpTick(s);
        const drawn = drawCards(s, action.player, SINGLE_DRAW, 'turn');
        const drawnEvent = drawn.events.find((e) => e.type === 'CardDrawn');
        const card = drawnEvent?.type === 'CardDrawn' ? drawnEvent.cards[0] : undefined;
        const withDrawn: GameState = { ...drawn.state, drawnCard: card };

        // Official: if the drawn card is unplayable the turn ends immediately.
        if (card === undefined || !plugin(s).isLegal(withDrawn, action.player, card)) {
            return merge({ state: withDrawn, events: drawn.events }, advanceTurn(withDrawn));
        }
        return { state: withDrawn, events: drawn.events };
    }

    function pass(state: GameState, action: Extract<Action, { type: 'PASS' }>): ApplyResult {
        const bad = requireTurn(state, action.player);
        if (bad) return reject(state, action, bad);
        if (state.drawnCard === undefined) return reject(state, action, 'wrong_phase');
        return advanceTurn(bumpTick(state));
    }

    function chooseColor(
        state: GameState,
        action: Extract<Action, { type: 'CHOOSE_COLOR' }>,
    ): ApplyResult {
        if (state.phase !== 'choosing_color') return reject(state, action, 'wrong_phase');
        if (state.currentPlayer !== action.player) return reject(state, action, 'not_your_turn');

        const colored: GameState = bumpTick({ ...state, activeColor: action.color });
        const ev: GameEvent = { type: 'ColorChosen', player: action.player, color: action.color };

        if (state.openingWild) {
            // First player chose the colour for an opening Wild and now plays.
            const ready: GameState = { ...colored, phase: 'playing', openingWild: false };
            return merge({ state: ready, events: [ev] }, startTurn(ready, action.player));
        }
        if (state.draw4Challenge) {
            return { state: { ...colored, phase: 'challenge_window' }, events: [ev] };
        }
        return merge(
            { state: { ...colored, phase: 'playing' }, events: [ev] },
            finishPlay({ ...colored, phase: 'playing' }, action.player),
        );
    }

    function resolveDraw4(
        state: GameState,
        action: Extract<Action, { type: 'CHALLENGE_DRAW4' | 'ACCEPT_DRAW4' }>,
        challenge: boolean,
    ): ApplyResult {
        if (state.phase !== 'challenge_window' || !state.draw4Challenge)
            return reject(state, action, 'wrong_phase');
        const ctx = state.draw4Challenge;
        if (action.player !== ctx.target) return reject(state, action, 'not_your_turn');

        const s: GameState = bumpTick({
            ...state,
            phase: 'playing',
            draw4Challenge: undefined,
            pendingDraw: undefined,
        });
        let out: ApplyResult = { state: s, events: [] };

        if (!challenge) {
            out = merge(out, drawCards(s, ctx.target, PENALTY.SUCCESSFUL_CHALLENGE, 'draw4'));
            out = merge(out, {
                state: { ...out.state, currentPlayer: ctx.target },
                events: [{ type: 'TurnSkipped', player: ctx.target }],
            });
            return merge(out, finishPlay(out.state, ctx.player));
        }

        const succeeded = ctx.wasBluff;
        out = merge(out, {
            state: s,
            events: [{ type: 'Draw4Challenged', by: ctx.target, against: ctx.player, succeeded }],
        });
        if (succeeded) {
            // Bluffer draws 4; challenger then plays normally.
            out = merge(
                out,
                drawCards(out.state, ctx.player, PENALTY.SUCCESSFUL_CHALLENGE, 'challenge'),
            );
            return merge(out, finishPlay(out.state, ctx.player));
        }
        // Challenger loses: draws 6 and is skipped.
        out = merge(out, drawCards(out.state, ctx.target, PENALTY.FAILED_CHALLENGE, 'challenge'));
        out = merge(out, {
            state: { ...out.state, currentPlayer: ctx.target },
            events: [{ type: 'TurnSkipped', player: ctx.target }],
        });
        return merge(out, finishPlay(out.state, ctx.player));
    }

    function callUno(state: GameState, action: Extract<Action, { type: 'CALL_UNO' }>): ApplyResult {
        if (!isUnoCallPhase(state.phase)) return reject(state, action, 'wrong_phase');
        if (isEliminated(state, action.player)) return reject(state, action, 'eliminated');
        const me = getPlayer(state, action.player);
        if (me.calledUno) return reject(state, action, 'already_called');
        if (!isUnoCallHandSize(me.hand.length)) return reject(state, action, 'variant_rule');
        let s = updatePlayer(bumpTick(state), action.player, { calledUno: true });
        if (s.unoVulnerable === action.player) s = { ...s, unoVulnerable: undefined };
        return { state: s, events: [{ type: 'UnoCalled', player: action.player }] };
    }

    function catchUno(
        state: GameState,
        action: Extract<Action, { type: 'CATCH_UNO' }>,
    ): ApplyResult {
        if (isEliminated(state, action.player)) return reject(state, action, 'eliminated');
        if (nothingToCatch(state, action)) return reject(state, action, 'no_uno_to_catch');
        const s = bumpTick({ ...state, unoVulnerable: undefined });
        const drawn = drawCards(s, action.target, PENALTY.MISSED_UNO_CALL, 'uno_missed');
        return {
            state: drawn.state,
            events: [
                { type: 'UnoCaught', player: action.target, by: action.player },
                ...drawn.events,
            ],
        };
    }

    function timeout(state: GameState, action: Extract<Action, { type: 'TIMEOUT' }>): ApplyResult {
        if (state.unoVulnerable !== action.player) return reject(state, action, 'no_uno_to_catch');
        return { state: bumpTick({ ...state, unoVulnerable: undefined }), events: [] };
    }

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    function apply(state: GameState, action: Action): ApplyResult {
        // `Action` is a compile-time union; the values that arrive here need not
        // honour it. A replay log that has been through JSON, a remote client or
        // a plain-JS caller can send an unknown `type`, a `player` that names no
        // seat, or no `player` at all — and getPlayer throws on an id it cannot
        // find. So the shape is checked once here, before any handler reads a
        // field, and apply answers with ActionRejected instead of throwing.
        //
        // Whether an action has an actor is decided by its *type* (actionGuard's
        // CARRIES_ACTOR), never by whether the value has a `player` key: a
        // START_ROUND has no actor by design, and confusing that with a
        // CATCH_UNO whose actor went missing is what CUI-0405 was.
        //
        // What this does NOT promise: apply still throws on a corrupt *state* —
        // an unregistered variant, a hand holding a card id that is not in the
        // round's deck. Those are engine invariants (see invariant.ts), and
        // failing loudly is the point. Input is what must never throw.
        const reason = actionShapeReason(state, action);
        if (reason !== undefined) return reject(state, action, reason);

        // Exhaustive: every type outside the union was rejected above.

        switch (action.type) {
            case 'START_GAME':
                return startGame(state, action);
            case 'START_ROUND':
                return startRound(state, action);
            case 'PLAY_CARD':
                return playCard(state, action);
            case 'DRAW_CARD':
                return drawCard(state, action);
            case 'PASS':
                return pass(state, action);
            case 'CHOOSE_COLOR':
                return chooseColor(state, action);
            case 'CHALLENGE_DRAW4':
                return resolveDraw4(state, action, true);
            case 'ACCEPT_DRAW4':
                return resolveDraw4(state, action, false);
            case 'CALL_UNO':
                return callUno(state, action);
            case 'CATCH_UNO':
                return catchUno(state, action);
            case 'TIMEOUT':
                return timeout(state, action);
            case 'VARIANT': {
                const handler = plugin(state).onVariantAction;
                return handler ? handler(state, action) : reject(state, action, 'variant_rule');
            }
        }
    }

    /** Colour rule and traits come from the plugin; defaults are "active face is wild" and NO_TRAITS. */
    function legalMove(state: GameState, rules: RulePlugin, id: CardId): LegalMove {
        const face = activeFace(state, getCard(state, id));
        return {
            card: id,
            requiresColor: rules.needsColorChoice?.(state, id) ?? face.color === 'wild',
            traits: rules.cardTraits?.(face.kind) ?? NO_TRAITS,
        };
    }

    function getLegalMoves(state: GameState, player: PlayerId): readonly LegalMove[] {
        if (state.phase !== 'playing' || state.currentPlayer !== player) return [];
        const rules = plugin(state);
        const hand = getPlayer(state, player).hand;
        const candidates =
            state.drawnCard !== undefined ? hand.filter((id) => id === state.drawnCard) : hand;
        return candidates
            .filter((id) => rules.isLegal(state, player, id))
            .map((id) => legalMove(state, rules, id));
    }

    function getPublicView(state: GameState, me: PlayerId): PublicView {
        const view: PublicView = {
            me,
            myHand: getPlayer(state, me).hand.map((id) => getCard(state, id)),
            players: state.players.map((p) => ({
                id: p.id,
                handCount: p.hand.length,
                calledUno: p.calledUno,
                score: p.score,
                eliminated: p.eliminated ?? false,
            })),
            currentPlayer: state.currentPlayer,
            direction: state.direction,
            topCard: state.discardPile.length > 0 ? topCard(state) : undefined,
            activeColor: state.activeColor as CardColor,
            activeSide: state.activeSide,
            drawPileCount: state.drawPile.length,
            discardHistory: state.discardPile.map((id) => getCard(state, id)),
            phase: state.phase,
            houseRules: state.config.houseRules,
        };
        return {
            ...view,
            ...(state.pendingDraw ? { pendingDraw: state.pendingDraw } : {}),
            ...(state.unoVulnerable ? { unoVulnerable: state.unoVulnerable } : {}),
            ...(state.drawnCard ? { drawnCard: state.drawnCard } : {}),
            ...(state.draw4Challenge
                ? { draw4Challenge: publicDraw4Challenge(state.draw4Challenge) }
                : {}),
        };
    }

    /** Explicit field-by-field copy so a future field on Draw4Challenge cannot leak by accident. */
    function publicDraw4Challenge(challenge: Draw4Challenge): PublicDraw4Challenge {
        return {
            player: challenge.player,
            target: challenge.target,
            priorColor: challenge.priorColor,
        };
    }

    function replay(config: RuleConfig, seed: Seed, actions: readonly Action[]): GameState {
        let s = createInitialState(config, seed);
        for (const a of actions) s = apply(s, a).state;
        return s;
    }

    return { createInitialState, apply, getLegalMoves, getPublicView, replay };
}
