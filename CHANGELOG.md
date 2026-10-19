# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.

## [Unreleased]

### Changed

- DEP-001: production now deploys from `main` through Vercel's Git integration, and every pull
  request gets a Vercel preview deployment. `vercel.json` no longer carries
  `"github": { "enabled": false }` — that line was the reason Vercel had never built this repo,
  while the only other route (`deploy.yml` on a `v*` tag) failed on its first step for want of
  `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID`, which were never created. Vercel
  builds `main` with the install / build commands already declared in `vercel.json` — the same
  `pnpm install --frozen-lockfile` and `pnpm --filter @uno/app build` CI runs — so no secret is
  needed anywhere. The tag-driven prebuilt workflow stays in the repo as an optional path,
  dormant until those secrets exist; `docs/environments.md` and the workflow header now say
  that running both paths at once deploys the same commit twice, and how to roll back a Git
  deploy (Vercel → Deployments → Promote to Production / Instant Rollback).

## [0.3.0] - 2026-10-19

Visual and game-flow polish of the Classic table — the "Lounge" direction in
`docs/design/polish-v0.3.md` (before / after screenshots in `docs/design/baseline/` and
`docs/design/v0.3/`). No rules change: `packages/engine` has zero diff since 0.2.2 and its 127
specs are untouched. App specs 135 → 343; the repo smoke script and a headless Playwright
flow at 390×844 and 844×390 run clean with no page errors.

### Added

- Lounge table: felt with a seeded, seam-free procedural grain, wooden rim with a gold inlay,
  warm spot / cool hemisphere / rim lighting, ACES tone mapping, transparent canvas over a CSS
  gradient backdrop. Opponents are procedural figures (capsule, head, eyes, cap in the seat
  colour) with a breathing gold ring on the active seat and a pulsing blue ring plus lean when
  they can be caught; the DOM nameplates are gone.
- Card art drawn as shapes on one 13×5 atlas (256×398 per cell, 3328×1990, uploaded once:
  ~35 MB with mips instead of ~117 MB for 54 separate 512×796 faces): paper frame, tilted oval,
  heavy numerals, drawn Skip / Reverse / Draw Two / Wild / Wild Draw Four glyphs, corner indices,
  hatched ink back. Cards have real rounded corners (shape geometry, no black corners).
- Hand states: legal cards lifted and bright, illegal cards sunk and dimmed, the selected card
  raised with an additive gold glow; cards fly along an eased arc and settle on landing; deals
  stagger 45 ms per card. The fan adapts to the viewport (portrait and landscape), never covers
  the piles, and leaves the bottom strip clear.
- Orientation-aware camera, seat ring and pile positions so all three opponents, the rim arc
  and both piles fit a 390 px portrait view, with chest-high opponent fans that leave faces
  visible.
- HUD: player strip (seat-colour avatar dot, name, card count, gold turn ring, `UNO` badge,
  pulsing catch badge — tap to catch), active-colour chip, turn banner with direction glyph,
  right-edge action column (round Draw with pile count, Pass, pulsing UNO!), "Play it or pass"
  hint for a playable drawn card, large coloured callouts for Skip / Reverse / +2 / +4 / UNO! /
  Caught! / Challenge won / lost, bottom toasts for minor events.
- Sheets: pause menu (Resume, How to play, Settings, Quit with confirm) that really pauses the
  table (`paused` in the store; the bot driver schedules nothing while set), rules sheet,
  settings (sound, UNO window 0 / 2 / 4 s), Wild Draw Four challenge, round-over / game-over with
  per-seat cards-left, round points and totals, winner glow and confetti for a human win. All
  sheets are `role="dialog"` with focus trap, Esc, `aria-labelledby`, and `inert` siblings.
- Lobby: card-fan hero, wordmark, avatar seat cards, segmented difficulty with descriptions
  (radiogroup with arrow keys), games / wins line, full-width Play, How to play link.
- Synthesised Web Audio cues (card, draw, UNO, skip, reverse, +2, +4, win, lose, tap; one cue
  per event batch by priority), `navigator.vibrate` haptics, a `sound` setting, and persisted
  stats (`gamesPlayed`, `gamesWon`, `roundsWon`) counted once per `RoundEnded` / `GameEnded`.
- Design tokens on `:root` (colours, type scale, radii, motion); no hex, font size or radius
  literal outside `:root`; `prefers-reduced-motion` honoured; inline SVG favicon.

### Changed

- `@react-three/drei` removed (its only use, the `Html` nameplate, is gone).
- `scripts/smoke.mjs` selectors follow the new markup (`.player-strip` / `.player-chip`,
  exact `Play`, `Draw a card…`); its JSON output reports `cardCounts`.
- Seat palette is the design one (`#f28ba8 / #5fd1b2 / #f3c76b`); card palette
  `#e5322d / #f7c500 / #2fa84f / #1f78d1`.
- Test runner moved to the vitest 4 line: `vitest` and `@vitest/coverage-v8` 3.2.7 → 4.1.12 in
  root, `packages/app` and `packages/engine`, with no config change — the app's `?raw` CSS specs
  and the engine's 99% line-coverage threshold run as before (engine reports 99.79% lines on
  vitest 4's `ast-v8-to-istanbul` remap, 99.81% before; stricter remap, same code). `vite`
  stays at 6.4.3, inside vitest 4's peer range (AU-017).
- The `pnpm.auditConfig.ignoreGhsas` allowlist is empty. Its only entry,
  `GHSA-82fw-gwwq-j7x9` (`@vitest/mocker`, patched ≥ 4.1.11), carried "delete this entry when
  vitest 4 is adopted" as its exit condition, so it is deleted; the W-044 policy note beside it
  stays, now describing the shape the next entry must take. `scripts/check-audit-allowlist.mjs`
  reports "empty -- nothing to review" and the spec that pinned the committed `package.json` to
  a dated allowlist now only rejects an allowlist that has lost its date (AU-017).

### Security

- Full-tree `pnpm audit --audit-level=moderate` exits 0 again with nothing ignored. Twelve
  upstream advisories had turned the gate red, all in devDependency transitives that never
  reach the shipped bundle (`pnpm audit --prod` stayed clean throughout): `tinypool` 1.1.1
  (2 critical, GHSA-5gmw-xhrv-c9v3 / GHSA-85c8-ppgw-ccpr) is gone because vitest 4 no longer
  depends on it; `brace-expansion` 5.0.9 → 5.0.12 under `eslint > minimatch` (GHSA-qhr7-859c-m2p7,
  GHSA-6j4f-fj2g-mc7p, GHSA-q2hr-2g5m-vwhr); `source-map-js` 1.2.1 → 1.2.2 (GHSA-68fv-2mgg-jv7q);
  `fast-uri` 3.1.7 → 3.1.8 under `ajv` (GHSA-hrr3-gc8f-f4qj). The `brace-expansion` 2.x copy
  under `@vitest/coverage-v8 > test-exclude` left the tree with vitest 3 (AU-017).

### Known issues (non-blocking; tracked for the next polish round)

- CUI-0501 Swipe-up to play is dropped when the finger releases outside the card (no pointer
  capture in `CardMesh`); tap-tap always works. Pre-existing since 0.1.0.
- CUI-0502 A colour picker opened by a touch tap leaves `document.activeElement` on `<body>`;
  the HUD behind is still `inert`, so this is screen-reader focus only.
- CUI-0503 With 18+ cards in hand, fully dimmed illegal cards can be completely hidden under
  lifted neighbours.
- CUI-0504 At 844×390 the player strip and turn banner overlap the far opponents' heads.

## [0.2.2] - 2026-09-12

Engine input-validation hardening and code-quality cleanup. No change to how a legal
game plays: 1,400-game lockstep A/B against 0.2.1 compared 1,058,176 state+event hashes
with zero mismatches, and `engine.replay()` reproduced every game.

### Fixed

- `engine.apply()` no longer throws on a malformed action. Action shape is validated once
  at the boundary and answered with `ActionRejected`. Previously `CATCH_UNO` never checked
  `action.player` at all, so an actor that does not exist was accepted and made a real
  player draw two cards; 18 malformed actor forms (`null`, numbers, objects, `__proto__`,
  empty string, case variants) were all accepted this way. A `player` field that was
  missing or `undefined` threw instead — reachable through `engine.replay()` on any
  persisted log, because `JSON.stringify` drops `undefined` values (CUI-0101, CUI-0405).
- An illegal colour on `CHOOSE_COLOR` / `PLAY_CARD` was written straight into
  `activeColor`, leaving `getLegalMoves()` empty for the rest of the round and leaking the
  corrupt value to bots through `getPublicView` (CUI-0409).
- Eliminated players can no longer `CALL_UNO` or `CATCH_UNO`, are no longer marked
  `unoVulnerable`, and cannot be caught. `TIMEOUT`, `CHOOSE_COLOR`, `CHALLENGE_DRAW4` and
  `ACCEPT_DRAW4` stay open to them so a variant that eliminates a player mid-phase cannot
  deadlock the round. Unreachable in Classic; required before No Mercy (CUI-0201).
- `unoCallWindowMs` values that `setTimeout` cannot honour — negative, `NaN`, `Infinity`,
  above the signed 32-bit range — were treated as a real window and clamped to 1 ms, which
  is the W-008 symptom the zero-window path exists to avoid. They now disable the window
  (S-025). An action refused inside the UNO window is surfaced instead of silently
  dropped (S-027).
- Seed-42 opening-card comments in the app test fixtures described the wrong cards, and
  are now pinned by assertions on all three table sizes (CUI-0301, W-052).

### Changed

- `no-non-null-assertion` is an error. All 76 assertions are gone: real invariants now go
  through named throwing helpers in `packages/engine/src/invariant.ts` that name the broken
  invariant, and the two sites that genuinely could be undefined have real handling (W-009).
- New `RejectReason` values `unknown_player`, `eliminated` and `unknown_action`. An
  unrecognised action type now returns `ActionRejected` rather than `undefined`.
- `DEFAULT_BOT_DIFFICULTY` has one definition instead of three (S-024).

### Added

- Fuzz spec covering ~4,800 malformed actions across eight game positions, seeded through
  `rngForTick` so it is reproducible, asserting that `apply()` never throws and that the
  state it returns is still readable.
- `CARRIES_ACTOR` is derived from the `Action` union, so classifying an action wrongly —
  not merely forgetting one — fails the build (W-054).

## [0.2.1] - 2026-09-12

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
