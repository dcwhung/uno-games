# CLAUDE.md — uno-games

Web app to play UNO variants vs AI bots. Low-poly 3D, first-person view (own hands holding cards), Animal Crossing–style chibi opponents. Rules follow the official Mattel rulebook by default.

## Stack

pnpm monorepo. `packages/engine` = pure TypeScript rules engine, **zero runtime deps, no React, no DOM, no timers**. `packages/app` = Vite + React 18 + React Three Fiber + drei + Zustand. Vitest for tests. TypeScript strict with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`.

```bash
pnpm install
pnpm test                          # engine specs (must stay green)
pnpm --filter @uno/engine test:cov # keep engine line coverage ≥ 99%
pnpm --filter @uno/app dev         # http://localhost:5173, open on phone via LAN IP
pnpm --filter @uno/app build       # tsc + vite build
node scripts/smoke.mjs             # headless Chromium smoke test (needs `npm i -g playwright`, preview on :4173)
```

## Architecture rules (do not break)

1. **Engine is event-sourced and pure.** `engine.apply(state, action) → { state, events }`. All randomness comes from `rngForTick(seed, tick)`; `engine.replay(config, seed, actions)` must reproduce state byte-for-byte. Never add `Date`, `Math.random`, or timers to `packages/engine`.
2. **Reducer ↔ RulePlugin turn-flow contract** (`packages/engine/src/reducer.ts` header):
   - Reducer moves the played card to discard and sets `activeColor` for coloured cards BEFORE calling `plugin.onCardPlayed`.
   - Plugin applies effects. To skip someone it sets `currentPlayer` to the skipped player and emits `TurnSkipped`; reducer then advances one step.
   - If the plugin leaves phase as `choosing_color` or `challenge_window`, the reducer does not advance; the follow-up action resumes via `finishPlay(player)`, which ends the round if that player's hand is empty.
   - Opening card is treated as if the dealer played it.
3. **Bots see only `PublicView`** (`engine.getPublicView`). Never pass `GameState` to a bot.
4. **All timing lives in `packages/app/src/game/botDriver.ts`** (bot delays, human UNO window, bot catch rolls). Bot randomness uses `rngForTick(seed, tick)` so the action log replays identically.
5. **3D layer is a pure projection of state.** `scene/layout.ts` maps `GameState → CardTarget[]`; `CardMesh` lerps toward its target. No game logic in the scene. UI reads state; toasts read events.
6. **Theme is isolated for the IP swap.** Card faces, backs, palette and variant display names live in `app/src/theme/` + `public/assets/cards/manifest.json` (validated by `manifest.schema.json`). Engine never imports theme.
7. **New variant = new `rules/<variant>.ts` plugin + new `theme/<variant>.ts` mapping + specs.** Do not special-case variants inside `reducer.ts`. Extend card kinds via `CardKindExt`. DOS and O'NO 99 are separate engines, not plugins.

## Roadmap order

Classic (done) → No Mercy → Flex → Zero → Teams → Liar → All Wild → Flip (double-sided cards; use `Card.back` + `activeSide`) → DOS → O'NO 99. House Rules toggles (`RuleConfig.houseRules`) exist but are not yet wired into the reducer.

## Conventions

- Named constants only — no magic numbers. Put them at the top of the file.
- Functions do one job. Prefer small pure helpers in `core.ts` over logic inside handlers.
- Every reducer / plugin change needs a Vitest spec. Use `test/helpers.ts` `rig()` to build exact positions.
- Conventional commits: `feat:` / `fix:` / `refactor:` / `chore:` / `test:`.
- When editing a file, output the full file, not a partial snippet.
- i18n: all UI strings go through `t('key')` in `app/src/i18n/en.json`. No hard-coded user-facing text.
- Mobile first, portrait must be playable. Keep draw calls and poly counts low (characters ≤ 3k tris, single texture atlas per variant).
