# Environments

Hosting is **Vercel**. Production is deployed by **Vercel's Git integration**: every push or
merge to `main` is built by Vercel from `vercel.json` and promoted to the production URL.
Every pull request gets a preview deployment, with the URL posted on the PR. No GitHub secret
is involved (DEP-001).

The app is a static SPA: `pnpm install --frozen-lockfile` then `pnpm --filter @uno/app build`
emits `packages/app/dist`, and Vercel serves that directory. Those are the same commands
`ci.yml` runs on every PR, so what Vercel builds is what CI tested.

A second, **optional** path exists: `.github/workflows/deploy.yml` builds in GitHub Actions on
a `v*` tag and uploads the artifact as a _prebuilt_ deployment. It is dormant until three repo
secrets exist (none do today) and must not be used while Git deploys are on — see
[Deploying](#deploying).

---

## Environment matrix

|              | Development                                         | Preview                                                                                                        | Production                                                                                        |
| ------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Purpose      | Local coding, LAN testing on a phone                | Review a branch / PR before merge                                                                              | Live site                                                                                         |
| URL shape    | `http://localhost:5173` and `http://<LAN-IP>:5173`  | `https://<project>-<hash>-<scope>.vercel.app`, posted as a PR comment and commit status                        | `https://<project>.vercel.app` (plus any custom domain)                                           |
| How to build | `pnpm --filter @uno/app dev` (Vite dev server, HMR) | Vercel runs `vercel.json`'s `installCommand` + `buildCommand`, serves `outputDirectory`                        | Same as Preview — Vercel builds from `vercel.json`                                                |
| Triggered by | A human running the dev server                      | **Automatically** — every push to a branch other than `main`; a PR shows the URL in a Vercel bot comment       | **Automatically** — every push / merge to `main` (optional: `v*` tag via `deploy.yml`, see below) |
| Branch / ref | Any working branch                                  | The pushed branch                                                                                              | `main` (the Vercel project's _Production Branch_)                                                 |
| Runtime      | `.nvmrc` → Node 22, pnpm from `packageManager`      | Node per `engines.node` (`>=22`) / the project's Node.js Version setting; pnpm `10.33.4` from `packageManager` | Same as Preview                                                                                   |
| Secrets      | None — the app has no runtime env vars today        | None                                                                                                           | None for Git deploys. Tag path only: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`         |

### Differences between environments

| Concern       | Development                                   | Preview                                                         | Production                                                      |
| ------------- | --------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------- |
| Bundler       | Vite dev server, unminified, source maps, HMR | Vite production build                                           | Vite production build                                           |
| Type checking | On demand (`pnpm typecheck`)                  | Enforced — `pnpm --filter @uno/app build` runs `tsc -p .` first | Same; also enforced by `ci.yml` on the PR that landed on `main` |
| SPA fallback  | Handled by the Vite dev server                | Vercel routing (see below)                                      | Vercel routing (see below)                                      |
| Indexing      | n/a                                           | Vercel marks preview deployments `noindex`                      | Indexable                                                       |

The app currently has **no runtime environment variables**. When the first one is added,
record it here, add it to a committed `.env.example`, and set it in every environment before
the code that reads it ships — for Git deploys that means Vercel → Project → Settings →
Environment Variables, scoped to Production / Preview as appropriate. Never commit a real
value.

S-070: also re-read the _Link project and pull production settings_ step in `deploy.yml` on that
day. `vercel pull` writes the project's environment variables to `.vercel/.env.production.local`,
and that step deletes them immediately because a prebuilt static deploy never reads them. A build
that genuinely needs a value must take it from an explicit `env:` on the build step, not from a
file left lying in the workspace while `pnpm install` runs the dependency tree's lifecycle
scripts.

---

## One-time manual setup

Steps 1–3 and 8 are what Git deploys need. Steps 4–7 and 9 only matter for the optional tag
path and can stay undone indefinitely.

<!-- W-049: indentation in this checklist is load-bearing. A `- ` marker puts the item's content
     column at 2, so a nested list must start between 2 and 5 spaces (prettier normalises it to
     4); at 6+ it stops being a child of the item and collapses into the paragraph above it. A
     GFM table cannot be nested in a list item at all -- that is why the secrets table lives in
     its own section below. Verify the RENDERED page, not the source, after editing this list.
     deploy.yml's ::error:: strings cite "step 7" (PRODUCTION_URL) and "step 8" (Deployment
     Protection) by number -- keep those two items at those positions. -->

- [x] **1. Create the Vercel project.** Sign in at <https://vercel.com>, then _Add New…_ →
      _Project_ → import `dcwhung/uno-games`. Done: project `uno-games-app`, team
      `dcwhungs-projects`, connected to the repo.
- [ ] **2. Confirm the project's build settings** (Project → Settings → Build & Deployment).
      `vercel.json` at the repo root declares all of these and wins over the dashboard, but the
      dashboard values are what Vercel falls back to if that file is ever removed:
    - Framework Preset: **Vite**
    - Root Directory: **`.`** (the repo root — the pnpm workspace must install from there)
    - Install Command: `pnpm install --frozen-lockfile`
    - Build Command: `pnpm --filter @uno/app build`
    - Output Directory: `packages/app/dist`
    - Node.js Version: **22.x** (matches `.nvmrc` and `engines.node`)
    - pnpm: Vercel reads `"packageManager": "pnpm@10.33.4"` from the root `package.json` via
      corepack. Check the first build log says `pnpm 10.x`; if it picked an older pnpm, set the
      project environment variable `ENABLE_EXPERIMENTAL_COREPACK=1`.
- [ ] **3. Git settings** (Project → Settings → Git). _Production Branch_ = **`main`**. Leave
      the GitHub integration **on**, with _Commit Status_, _deployment_status Events_ and
      _Pull Request Comments_ enabled — that is how a PR gets its preview URL. `vercel.json`
      no longer carries `"github": { "enabled": false }`; do not add it back unless you are
      switching to the tag path (step 6).
- [ ] **4. (Tag path only) Get the org and project ids.** In a local clone, run
      `npx vercel@59 link` and pick the project. That writes `.vercel/project.json`, which
      contains `orgId` and `projectId`. (Same values appear under Vercel → Team Settings →
      General and Project → Settings → General.) Do not commit the `.vercel/` directory.
- [ ] **5. (Tag path only) Create an access token.** Vercel → Account Settings → Tokens →
      _Create Token_. Scope it to the team/account that owns the project, give it the shortest
      expiry you can live with, and copy it once — Vercel will not show it again.
- [ ] **6. (Tag path only) Add three GitHub repo secrets.** GitHub → repo → _Settings_ →
      _Secrets and variables_ → _Actions_ → _New repository secret_. The three names, and what
      to paste into each, are in [Repository secrets](#repository-secrets) below. **Before you
      do this, read the double-deploy warning under [Deploying](#deploying)** — with these
      secrets set and Git deploys on, a tag deploys the same commit twice.
- [ ] **7. (Tag path only, recommended if used) Add a repo variable** on the same page, under
      _Variables_ → `PRODUCTION_URL`, set to the public production URL
      (e.g. `https://uno-games-app.vercel.app`). When set, the workflow also smoke-tests the
      live alias, which is the only check that proves the alias actually moved.
- [ ] **8. Deployment Protection off for production.** Project → Settings → Deployment
      Protection. The game is public, so _Vercel Authentication_ must be **off** for
      production; with it on, the production URL answers `401` to everyone, and the tag path's
      smoke test fails the same way. Protecting _preview_ deployments is fine.
- [ ] **9. (Tag path only, optional) Add a manual approval gate.** The job declares
      `environment: production`. GitHub → _Settings_ → _Environments_ → `production` → add
      _Required reviewers_ if tag deploys should need a human click.

### Repository secrets

Referenced by step 6 above — **tag path only; none exist today, and none are needed for Git
deploys.** A GFM table cannot be nested inside a list item, so it lives in its own section
rather than under the checklist item that needs it.

| Secret name         | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| `VERCEL_TOKEN`      | the token created in step 5                                        |
| `VERCEL_ORG_ID`     | `orgId` from `.vercel/project.json` (written by `vercel link`)     |
| `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` (written by `vercel link`) |

`.vercel/` is git-ignored and must stay that way — it can also hold pulled `.env.*.local`
files containing real tokens.

### Token rotation

If `VERCEL_TOKEN` is ever created, rotate it at least every 90 days: create a new token, update
the GitHub secret, then delete the old token in Vercel. No code change is needed.

---

## Deploying

### Production — merge to `main` (the normal path)

```bash
# on a green PR into main: merge it. That is the deploy.
```

Vercel picks up the push, runs `pnpm install --frozen-lockfile` → `pnpm --filter @uno/app build`
(which runs `tsc -p .` first), serves `packages/app/dist` with the SPA rewrite from
`vercel.json`, and moves the production alias to the new deployment once the build succeeds. A
failed build never reaches production — the previous deployment keeps serving. The commit on
GitHub shows a Vercel commit status with the deployment URL.

Quality gates live in `ci.yml`, which blocks the PR before it can reach `main`: lint, typecheck,
tests, engine coverage, asset manifest, format and both audits. Vercel does not re-run them —
merging something that bypassed CI deploys it. Branch protection on `main` is the guard.

After a production deploy, check that
`curl -fsS -o /dev/null -w '%{http_code}\n' https://<production-url>` returns `200` and that a
deep link (e.g. `/settings`) also returns `200` rather than `404` — that is the SPA rewrite
working.

### Preview — open a pull request

Every push to a non-`main` branch gets its own immutable preview URL; on a PR the Vercel bot
posts it as a comment and updates it on each push. Previews are `noindex` and can stay
protected by Deployment Protection if that is turned on for previews.

### Optional — tag-driven prebuilt deploy (`deploy.yml`)

```bash
# from an up-to-date main, after CI is green -- ONLY with the secrets set (see warning)
git tag v0.3.0
git push origin v0.3.0
```

This path exists for the case where you want the artifact built and gated in GitHub Actions
and uploaded as-is, with no build on Vercel's side. It stays dormant until the three secrets
in step 6 exist: the `deploy` job fails on its first step with a named list of what is missing.
Pushing a tag today therefore runs the `quality` job and then stops, deploying nothing.

**Double-deploy warning.** A `v*` tag sits on a commit that is on `main`, so with the secrets
set **and** Git deploys on, that commit is deployed twice — once by Vercel on the push to
`main`, once by this workflow — and the two race for the production alias. Pick one:

- keep the three secrets **unset** (today's state), so the tag path stays dormant; or
- before cutting a tag, disable the Git integration for the project (Vercel → Settings → Git
  → disconnect, or add `"github": { "enabled": false }` back to `vercel.json`) and accept that
  `main` no longer auto-deploys and PRs no longer get previews.

When it does run: **`quality`** runs first and blocks the second job: `pnpm lint` →
`pnpm typecheck` → `pnpm test` → `pnpm --filter @uno/engine test:cov` → `validate:assets` →
`pnpm audit --prod`. A tag can be pushed onto any commit, including one that never went through
CI, so these gates are re-run rather than assumed. `deploy.yml` documents which `ci.yml` gates
are deliberately not repeated (`format:check`, the all-dependency audit and a second build) and
why. **`deploy`** then: verifies secrets → checks out → installs pnpm/Node from `.nvmrc` →
`vercel pull` (validates credentials early) → `pnpm install --frozen-lockfile` →
`pnpm --filter @uno/app build` → uploads `packages/app/dist` as a prebuilt deployment →
smoke-tests the deployment URL (and the production alias, if `PRODUCTION_URL` is set) →
writes a summary with the deployment URL. Any failing step aborts before or during the deploy;
a failing smoke test **after** a successful deploy means production is already serving the bad
build — roll back. To re-run a failed tag deploy without cutting a new tag, use _Actions_ →
_Deploy_ → _Run workflow_ (`workflow_dispatch`).

---

## Routing config — `vercel.json` is the single source of truth

Git deploys read `vercel.json` directly: `framework`, `installCommand`, `buildCommand`,
`outputDirectory` and the single SPA `rewrites` entry. Edit that file only.

The optional prebuilt tag path is different: Vercel never reads `vercel.json` during a prebuilt
deploy, it reads `.vercel/output/config.json` (Build Output API v3). That file is **generated**
from `vercel.json` by `scripts/vercel-build-output.mjs`, which `deploy.yml` runs just before
uploading — so even on that path there is no second copy to keep in sync.

| File                                                                     | Used by                                                                              | Form                                                                                             |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `vercel.json` (repo root)                                                | Vercel's Git integration (production + preview), local `vercel build`, the generator | `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`                              |
| `.vercel/output/config.json` (generated, git-ignored, never hand-edited) | The optional tag-path prebuilt deploy only                                           | `"routes": [{ "handle": "filesystem" }, { "src": "/.*", "status": 200, "dest": "/index.html" }]` |

The generator translates only the SPA catch-all rewrite. If `vercel.json` ever grows
`redirects`, `headers`, `routes`, `cleanUrls` or `trailingSlash`, or a rewrite that is not the
catch-all, the script **fails the tag deploy** with a message naming the key rather than quietly
shipping routing that differs from what Vercel's own build would produce. Teach
`scripts/vercel-build-output.mjs` about the new key in the same commit that adds it. Non-routing
keys (`framework`, the commands, `outputDirectory`) are ignored by the generator — Vercel reads
them itself on the Git path, and the tag path builds with pnpm before Vercel is involved.

W-050: that check reaches **inside** the rewrite object too, because that object is the part
people edit. A rewrite may carry only `source` and `destination`; anything else (`has`,
`missing`, …) fails the tag deploy, and `destination` must be a non-empty string. An absent
`destination` used to produce a route with no `dest`, which disables the SPA fallback while `/`
keeps answering `200` through the filesystem handler — a green pipeline over a site whose every
deep link 404s. `scripts/vercel-build-output.spec.mjs` covers each of these.

`vercel.json` lives at the **repo root**, not in `packages/app/`, because Vercel reads it from
the project's Root Directory and the Root Directory must be the repo root for the pnpm
workspace to install and link `@uno/engine`.

---

## Rollback

Pick whichever is faster. Option A is near-instant, needs no build, and is the right answer
for a bad Git deploy.

### Option A — promote the previous deployment (preferred)

1. Vercel → project → _Deployments_, filter to Production.
2. Find the last known-good production deployment (each row shows the commit SHA and message).
3. _⋯_ menu → **Promote to Production** (newer Vercel UIs offer **Instant Rollback** on the
   project overview, which does the same thing in one click).
4. Confirm: `curl -fsS -o /dev/null -w '%{http_code}\n' https://<production-url>` returns
   `200`, and the app loads.

The bad commit is still on `main`, so the **next** push to `main` would deploy on top of the
rollback. Land the fix (or a `git revert`) through a normal PR before anything else merges.

CLI equivalent, from a linked clone:

```bash
npx vercel@59 ls            # list deployments, copy the good one's URL
npx vercel@59 promote <deployment-url>
```

### Option B — revert on `main`

Use this when the bad change should also disappear from `main`'s history going forward.

```bash
git revert <bad-merge-commit> -m 1     # or revert the squash commit
```

Open that as a PR and merge it; Vercel deploys the reverted state like any other push to
`main`. Slower than Option A (one full build), but leaves an auditable commit.

### Option C — re-deploy the previous tag (tag path only)

Only meaningful if the tag path is in use. _Actions_ → _Deploy_ → _Run workflow_, and select
the previous good tag as the ref; or cut a new patch tag on the last good commit — never
force-push or delete a published tag.

### After any rollback

- Record what happened and the deployment URLs involved in `CHANGELOG.md` or the session log.
- Open a fix on a normal branch. Do not hotfix straight into `main` or a tag.

---

## Local Vercel notes

- `vercel link` creates a `.vercel/` directory containing `project.json` and possibly pulled
  env files. It is machine-local — **do not commit it**.
- To reproduce exactly what Vercel builds:

```bash
pnpm install --frozen-lockfile
pnpm --filter @uno/app build
pnpm --filter @uno/app preview   # serves packages/app/dist on http://localhost:4173
```
