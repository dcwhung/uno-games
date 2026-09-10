# UNO in web — Milestone 1

pnpm monorepo. `packages/engine` is the pure-TS rules engine (zero deps); `packages/app` is the Vite + React Three Fiber client.

```bash
pnpm install
pnpm test                 # engine: 48 Vitest specs
pnpm --filter @uno/app dev   # http://localhost:5173 — open on your phone via LAN IP
pnpm --filter @uno/app build && pnpm --filter @uno/app preview
```

Headless smoke test (needs `npm i -g playwright` and a running preview on :4173):

```bash
node scripts/smoke.mjs      # screenshots to /tmp/shots, exits non-zero on console errors
```

## Layout
- `packages/engine/src/types.ts` — state / action / event / RulePlugin contracts
- `packages/engine/src/reducer.ts` — `createEngine(registry)`; see header comment for the reducer ↔ plugin turn-flow contract
- `packages/engine/src/rules/classic.ts` — official Classic deck + card effects
- `packages/engine/src/bots/` — easy / medium / hard heuristic bots (see only `PublicView`)
- `packages/app/src/store/gameStore.ts` — Zustand slice wrapping `engine.apply`, keeps `actionLog` for save/replay
- `packages/app/src/game/botDriver.ts` — all timing: bot delays, human UNO timer, bot catch rolls
- `packages/app/src/scene/` — R3F scene; `layout.ts` maps state → card transforms, `CardMesh` lerps to them
- `packages/app/src/theme/` + `public/assets/cards/manifest.json` — card asset contract (KTX2 atlas, per-variant); placeholders are canvas-drawn in `scene/cardTextures.ts` until Blender assets land
- `packages/app/src/ui/` — DOM HUD: scores, turn banner, Draw / Pass / UNO / Catch, colour picker, +4 challenge, round-over
