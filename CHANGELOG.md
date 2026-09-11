# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.

## [Unreleased]

Tooling and delivery only — no engine or app behaviour changes. Nothing here has been
deployed: the production pipeline has never run, because it fails on its first step until
the three Vercel repository secrets exist (`docs/environments.md`).

### Added

- Production deploy pipeline: `.github/workflows/deploy.yml`, triggered by a `v*` tag or
  `workflow_dispatch`. The app is built in CI and shipped to Vercel as a _prebuilt_
  deployment, so the artifact that passed the gates is the artifact that goes live.
  `docs/environments.md` carries the environment matrix, the one-time setup checklist and
  the rollback procedure.
- `quality` job in `deploy.yml` (lint / typecheck / test / engine coverage / prod-dependency
  audit), with `deploy` gated on `needs: quality`. A tag can sit on a commit that never went
  through `ci.yml`; before this, the only thing between a tag and production was the
  `tsc -p .` inside `vite build` (W-047).
- `scripts/vercel-build-output.mjs` — generates `.vercel/output/config.json` (Build Output
  API v3) from `vercel.json`, so the SPA fallback has one source of truth instead of a
  hand-written heredoc kept in sync by comments. Routing it cannot translate fails the
  deploy rather than being dropped silently (S-067, W-050).
- `scripts/check-audit-allowlist.mjs` — non-blocking `::warning::` in `ci.yml` when the
  audit allowlist passes the review date recorded beside it (S-072).
- Root Vitest project covering `scripts/**`, wired into `pnpm test`. `pnpm -r test` only
  recurses into the workspace packages, which is how the build-output generator shipped as
  the batch's only new logic and its only untested code (W-050).
- `pnpm --filter @uno/app validate:assets` now runs in both pipelines. The card-manifest
  validator had existed since AU-016 and was called by nothing (S-069).
- `pnpm format:check` as a blocking CI gate, now that the repo is actually formatted.

### Changed

- Security gates tightened from `--audit-level=high` to `--audit-level=moderate` on both the
  prod-dependency and full-tree audits, with the one unfixable advisory
  (`GHSA-82fw-gwwq-j7x9`, vitest 3) named in `pnpm.auditConfig.ignoreGhsas` alongside its
  reason, review date and exit condition. A loose threshold hid every moderate; a strict
  threshold plus a dated allowlist means a red audit is always both real and actionable
  (W-044).
- devDependencies upgraded: vite 6, vitest 3, `ajv-cli` replaced by `ajv`. This cleared the
  1 critical + 2 high advisories that had kept the full-tree audit advisory-only (AU-016).
- Whole repo formatted with Prettier at `tabWidth: 4` (AU-014). Formatting only — verified
  against the previous output by TS AST and esbuild byte comparison.
- The three Vercel secrets moved from workflow-level `env` to the individual steps that talk
  to Vercel. A workflow-level `env` reaches every step, so `pnpm install` (any dependency's
  postinstall) and the build (any Vite plugin) could read the production deploy token
  (W-045).
- `vercel pull` no longer leaves the pulled `.vercel/.env.*.local` files in the workspace
  while `pnpm install` runs (S-070).
- Deployment smoke tests replaced curl's `--retry-all-errors` with an explicit retry loop.
  Without `-f`, curl stopped treating a 4xx as an error and so stopped retrying it —
  measured: a 404 retried twice with `-f`, zero times without. A 404 is what an alias still
  propagating returns. 401/403 still fail on the first response, because Deployment
  Protection will not resolve itself (S-063, S-073).

### Fixed

- `scripts/vercel-build-output.mjs` validated `vercel.json`'s top-level keys but never the
  fields inside a rewrite. A rewrite with no `destination`, an empty `destination`, or a
  `has[]` condition all exited 0 and produced a config that was structurally valid and
  semantically wrong — a missing `dest` disables the SPA fallback while `/` keeps answering
  200 through the filesystem handler, so both smoke gates stay green over a site whose every
  deep link 404s. Validation is now an allowlist down to the field level (W-050).
- `docs/environments.md` setup checklist rendered wrong under GFM: step 2's build settings
  ran together as one paragraph and step 6's secret table did not render, because a GFM
  table cannot be nested inside a list item (W-049).
- Wildcard asterisks in this file's own preamble rendered as emphasis rather than as literal
  `*`, so `AU-*`, `C/W/S-*` and `CUI-*` lost their stars. They are backticked now.
  **Attribution:** this bug shipped in 0.2.0 and was not introduced by the formatting pass.
  Prettier only normalised `*…*` to `_…_`, which made an already-broken render conspicuous
  in the source. The commit message on `74ae3bf` blames Prettier; it is wrong (S-068).

## [0.2.0] - 2026-09-11

Post-audit hardening release. Every item traces to the 2026-09-10 architecture
audit (`AU-*`), a Code Review item (`C/W/S-*`) or a QA ticket (`CUI-*`).

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
