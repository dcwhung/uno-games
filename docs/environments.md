# Environments

Hosting is **Vercel**. Production is deployed by GitHub Actions
(`.github/workflows/deploy.yml`) when a `v*` tag is pushed — not by Vercel's own Git
integration, which is deliberately switched off.

The app is a static SPA: `pnpm --filter @uno/app build` emits `packages/app/dist`, and that
directory is uploaded as a Vercel _prebuilt_ deployment. Vercel runs no build of its own, so
the artifact that passed CI is the artifact that goes live.

---

## Environment matrix

|              | Development                                         | Preview                                                                                                             | Production                                                                       |
| ------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Purpose      | Local coding, LAN testing on a phone                | Ad-hoc share / manual check of a branch                                                                             | Live site                                                                        |
| URL shape    | `http://localhost:5173` and `http://<LAN-IP>:5173`  | `https://<project>-<hash>-<scope>.vercel.app`                                                                       | `https://<project>.vercel.app` (plus any custom domain)                          |
| How to build | `pnpm --filter @uno/app dev` (Vite dev server, HMR) | `pnpm --filter @uno/app build` then `vercel deploy --prebuilt`                                                      | `pnpm --filter @uno/app build` then `vercel deploy --prebuilt --prod`, run by CI |
| Triggered by | A human running the dev server                      | A human running the Vercel CLI locally — **there is no automatic preview**, because Vercel Git deploys are disabled | Pushing a tag matching `v*` (e.g. `v0.2.0`), or a manual `workflow_dispatch` run |
| Branch / ref | Any working branch                                  | Any working branch                                                                                                  | The tagged commit (tags are cut from `main`)                                     |
| Secrets      | None — the app has no runtime env vars today        | None                                                                                                                | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` (GitHub repo secrets)       |

### Differences between environments

| Concern       | Development                                   | Preview                                                         | Production                         |
| ------------- | --------------------------------------------- | --------------------------------------------------------------- | ---------------------------------- |
| Bundler       | Vite dev server, unminified, source maps, HMR | Vite production build                                           | Vite production build              |
| Type checking | On demand (`pnpm typecheck`)                  | Enforced — `pnpm --filter @uno/app build` runs `tsc -p .` first | Same, enforced in CI before upload |
| SPA fallback  | Handled by the Vite dev server                | Vercel routing (see below)                                      | Vercel routing (see below)         |
| Indexing      | n/a                                           | Vercel marks preview deployments `noindex`                      | Indexable                          |

The app currently has **no runtime environment variables**. When the first one is added,
record it here, add it to a committed `.env.example`, and set it in every environment before
the code that reads it ships. Never commit a real value.

---

## One-time manual setup (do this before the first tag deploy)

The workflow fails on its first step with a named list of what is missing until all three
secrets exist. Work through this checklist once.

<!-- W-049: indentation in this checklist is load-bearing. A `- ` marker puts the item's content
     column at 2, so a nested list must start between 2 and 5 spaces (prettier normalises it to
     4); at 6+ it stops being a child of the item and collapses into the paragraph above it. A
     GFM table cannot be nested in a list item at all -- that is why the secrets table lives in
     its own section below. Verify the RENDERED page, not the source, after editing this list. -->

- [ ] **1. Create the Vercel project.** Sign in at <https://vercel.com>, then _Add New…_ →
      _Project_ → import `dcwhung/uno-games`.
- [ ] **2. Set the project's build settings** (Project → Settings → Build & Deployment).
      They only matter as a fallback, but keeping them right avoids surprises:
    - Framework Preset: **Vite**
    - Root Directory: **`.`** (the repo root — the pnpm workspace must install from there)
    - Build Command: `pnpm --filter @uno/app build`
    - Output Directory: `packages/app/dist`
    - Install Command: `pnpm install --frozen-lockfile`
- [ ] **3. Turn OFF Vercel's own Git deploys.** Project → Settings → Git → set both
      _Production Branch_ deploys and _Preview Deployments_ to disabled (in the Vercel UI this
      is "Ignored Build Step" / the Git integration toggle). `vercel.json` already declares
      `"github": { "enabled": false }`, which covers this too — but set the dashboard toggle as
      well so nobody re-enables it by deleting a config line. **If Git deploys stay on, every
      tag push deploys twice and the two deploys race each other.**
- [ ] **4. Get the org and project ids.** In a local clone, run `npx vercel@59 link` and pick
      the project. That writes `.vercel/project.json`, which contains `orgId` and `projectId`.
      (Same values appear under Vercel → Team Settings → General and Project → Settings →
      General.) Do not commit the `.vercel/` directory.
- [ ] **5. Create an access token.** Vercel → Account Settings → Tokens → _Create Token_.
      Scope it to the team/account that owns the project, give it the shortest expiry you can
      live with, and copy it once — Vercel will not show it again.
- [ ] **6. Add three GitHub repo secrets.** GitHub → repo → _Settings_ → _Secrets and
      variables_ → _Actions_ → _New repository secret_. The three names, and what to paste into
      each, are in [Repository secrets](#repository-secrets) below.
- [ ] **7. (Optional but recommended) Add a repo variable** on the same page, under
      _Variables_ → `PRODUCTION_URL`, set to the public production URL
      (e.g. `https://uno-games.vercel.app`). When set, the workflow also smoke-tests the live
      alias, which is the only check that proves the alias actually moved.
- [ ] **8. Check Deployment Protection.** Project → Settings → Deployment Protection. If
      _Vercel Authentication_ is enabled for production, the deployment URL answers `401` and
      the workflow's smoke test fails. Either leave production public, or configure a
      Protection Bypass for Automation and pass it to the smoke request.
- [ ] **9. (Optional) Add a manual approval gate.** The job declares
      `environment: production`. GitHub → _Settings_ → _Environments_ → `production` → add
      _Required reviewers_ if production deploys should need a human click.

### Repository secrets

Referenced by step 6 above. A GFM table cannot be nested inside a list item, so it lives in its
own section rather than under the checklist item that needs it.

| Secret name         | Value                                                              |
| ------------------- | ------------------------------------------------------------------ |
| `VERCEL_TOKEN`      | the token created in step 5                                        |
| `VERCEL_ORG_ID`     | `orgId` from `.vercel/project.json` (written by `vercel link`)     |
| `VERCEL_PROJECT_ID` | `projectId` from `.vercel/project.json` (written by `vercel link`) |

`.vercel/` is git-ignored and must stay that way — it can also hold pulled `.env.*.local`
files containing real tokens.

### Token rotation

Rotate `VERCEL_TOKEN` at least every 90 days: create a new token, update the GitHub secret,
then delete the old token in Vercel. No code change is needed.

---

## Deploying

```bash
# from an up-to-date main, after CI is green
git tag v0.3.0
git push origin v0.3.0
```

The workflow runs two jobs.

**`quality`** runs first and blocks the second one: `pnpm lint` → `pnpm typecheck` →
`pnpm test` → `pnpm --filter @uno/engine test:cov` → `pnpm audit --prod`. A tag can be pushed
onto any commit, including one that never went through CI, so these gates are re-run here
rather than assumed. `deploy.yml` documents which `ci.yml` gates are deliberately not
repeated (`format:check`, the all-dependency audit and a second build) and why.

**`deploy`** then: verifies secrets → checks out → installs pnpm/Node from `.nvmrc` →
`vercel pull` (validates credentials early) → `pnpm install --frozen-lockfile` →
`pnpm --filter @uno/app build` → uploads `packages/app/dist` as a prebuilt deployment →
smoke-tests the deployment URL (and the production alias, if `PRODUCTION_URL` is set) →
writes a summary with the deployment URL.

Any failing step aborts before or during the deploy; a failing **smoke test after** a
successful deploy means production is already serving the bad build — roll back.

To re-run a failed deploy without cutting a new tag, use _Actions_ → _Deploy_ → _Run
workflow_ (`workflow_dispatch`). This option only appears once `deploy.yml` is on the default
branch.

---

## Routing config — `vercel.json` is the single source of truth

Because the deploy is _prebuilt_, Vercel never reads `vercel.json` during the CI deploy; it
reads `.vercel/output/config.json` (Build Output API v3). That file is **generated** from
`vercel.json` by `scripts/vercel-build-output.mjs`, which `deploy.yml` runs just before
uploading. Edit `vercel.json` only — there is no second copy to keep in sync.

| File                                                                     | Used by                                                           | Form                                                                                             |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `vercel.json` (repo root)                                                | Vercel's Git integration, local `vercel build`, and the generator | `"rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]`                              |
| `.vercel/output/config.json` (generated, git-ignored, never hand-edited) | The CI production deploy                                          | `"routes": [{ "handle": "filesystem" }, { "src": "/.*", "status": 200, "dest": "/index.html" }]` |

The generator translates only the SPA catch-all rewrite. If `vercel.json` ever grows
`redirects`, `headers`, `routes`, `cleanUrls` or `trailingSlash`, or a rewrite that is not the
catch-all, the script **fails the deploy** with a message naming the key rather than quietly
shipping routing that differs from what a local `vercel build` would produce. Teach
`scripts/vercel-build-output.mjs` about the new key in the same commit that adds it.

`vercel.json` lives at the **repo root**, not in `packages/app/`, because Vercel reads it from
the project's Root Directory and the Root Directory must be the repo root for the pnpm
workspace to install and link `@uno/engine`.

---

## Rollback

Pick whichever is faster. Option A is near-instant and needs no build.

### Option A — promote the previous deployment (preferred)

1. Vercel → project → _Deployments_.
2. Find the last known-good production deployment (check the commit SHA in its metadata).
3. _⋯_ menu → **Promote to Production** (older Vercel UIs call this _Rollback_ or
   _Instant Rollback_).
4. Confirm: `curl -fsS -o /dev/null -w '%{http_code}\n' https://<production-url>` returns
   `200`, and the app loads.

CLI equivalent, from a linked clone:

```bash
npx vercel@59 ls            # list deployments, copy the good one's URL
npx vercel@59 promote <deployment-url>
```

### Option B — re-deploy the previous tag

Use this when the bad artifact must disappear from the deployment list too, or when Option A
is unavailable.

1. _Actions_ → _Deploy_ → _Run workflow_, and select the previous good tag as the ref.
2. If `workflow_dispatch` cannot target a tag in your setup, cut a new patch tag on the last
   good commit instead — never force-push or delete a published tag:

```bash
git tag v0.2.1 <last-good-commit-sha>
git push origin v0.2.1
```

### After any rollback

- Record what happened and the deployment URLs involved in `CHANGELOG.md` or the session log.
- Open a fix on a normal branch. Do not hotfix straight into a tag.

---

## Local Vercel notes

- `vercel link` creates a `.vercel/` directory containing `project.json` and possibly pulled
  env files. It is machine-local — **do not commit it**.
- To reproduce exactly what CI ships:

```bash
pnpm install --frozen-lockfile
pnpm --filter @uno/app build
pnpm --filter @uno/app preview   # serves packages/app/dist on http://localhost:4173
```
