# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.

## [0.2.0] - 2026-09-11

Post-audit hardening release. Every item traces to the 2026-09-10 architecture
audit (AU-*), a Code Review item (C/W/S-*) or a QA ticket (CUI-*).

### Added
- Engine `RulePlugin` hooks for upcoming variants: `onTurnStart`, `needsColorChoice`,
  `cardTraits` (exposed to bots via `LegalMove.traits`); `isRoundOver` is now honoured
  by the reducer (AU-001, AU-002).
- `PlayerState.eliminated` — skipped in turn order, excluded from round scoring,
  visible in `PublicView` (AU-001b).
- `core.canCallUno` + `UNO_CALL_MAX_HAND` exported from `@uno/engine`; HUD and bots
  consume the engine rule instead of duplicating it (W-006).
- `gameStore.newGame(settings, seed?)` optional seed for deterministic tests and
  future replay (W-032).
- Bot driver watchdog: a rejected bot action falls back to a legal move instead of
  freezing the game; rejected actions are no longer appended to the replay log (AU-003).
- `unoCallWindowMs = 0` now auto-calls UNO for the human (no instant catch roll) (W-008).
- Vitest for `@uno/app` (111 specs: settings, store, bot fallback, UNO window,
  toast queue, layout, theme helpers) with `test:cov` (W-011, W-012, W-020, S-008, W-043).
- ESLint 10 flat config with architecture guards (engine may not import React /
  three / app code, nor use `Date`, `Math.random`, timers or runtime globals),
  Prettier config (`tabWidth: 4`, not yet applied), `engines` / `.nvmrc`,
  engine line-coverage threshold 99%, GitHub Actions CI (lint → typecheck → test →
  coverage → build → prod-deps audit) (W-010, W-040, W-041, W-042).

### Changed
- Reducer no longer clears `pendingDraw` before calling the plugin, and judges UNO
  vulnerability after plugin effects; reducer reads `core.activeFace` instead of
  hard-coding `.front` (AU-001a, AU-002). Turn-flow contract in `reducer.ts` header
  updated accordingly.
- `startRound` split into `dealHands` / `pickOpeningCard` / `enterPlaying` /
  `openingHandOver` (67 → 28 lines), behaviour verified identical over 600 openings
  and 225 full bot games (W-031).
- `classicRules.supportedHouseRules` is now `[]` until house rules are actually
  wired (AU-005).
- `PublicView.draw4Challenge` no longer leaks `wasBluff` (AU-006).
- All user-visible strings (player / bot names, nameplate tags) go through `t()` (C-001).

### Fixed
- Corrupt or out-of-range `localStorage` settings no longer blank the HUD; invalid
  fields fall back per-field and a rejected `START_GAME` returns to the Lobby (C-002).
- Toast expiry timer was cancelled by its own effect; toasts now leave the DOM after
  `TOAST_MS` (W-007).
- `rng.ts` `prefer-const` one-liner (W-040).

### Known issues (non-blocking, tracked in `.tickets/`)
- CUI-0101 `callUno` throws instead of rejecting for an unknown player id.
- CUI-0201 Eliminated players can still `CALL_UNO` / `CATCH_UNO` (unreachable in Classic).
- CUI-0202 UNO catch window stays open through the next player's `ACCEPT_DRAW4`
  (rules ruling pending).
- CUI-0301 Test fixture comment misdescribes the seed-42 opening card.
- Repo is still 2-space indented; `pnpm format` chore pending before enabling
  `format:check` in CI. Dev-dependency audit findings tracked under AU-016.

## [0.1.0] - 2026-09-10

- Milestone 1: Classic rules engine (event-sourced, deterministic replay),
  heuristic bots, React Three Fiber placeholder table.
