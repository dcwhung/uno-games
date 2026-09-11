import { defineConfig } from 'vitest/config';

// Root-level Vitest project for the repo's build / deploy tooling (W-050).
//
// WHY THIS EXISTS
// `pnpm -r test` only recurses into the workspace packages, so everything under scripts/ sat
// outside the test runner's field of view. That is how W-050 shipped: scripts/vercel-build-output.mjs
// was the only new branching logic in its batch and the only code in it with no spec, and a
// malformed rewrite produced a structurally valid but semantically wrong config.json at exit 0.
//
// Node environment and plain .mjs specs: these files exercise Node scripts, not app modules.
// There is no tsconfig at the repo root, so a .ts spec here would sit outside `pnpm typecheck` --
// a gate wired to nothing, which is the exact defect S-069 is about.
const SPEC_GLOBS = ['scripts/**/*.spec.mjs'];

export default defineConfig({
    test: {
        environment: 'node',
        include: SPEC_GLOBS,
    },
});
