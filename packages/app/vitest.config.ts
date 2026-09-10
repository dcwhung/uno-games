import { defineConfig } from 'vitest/config';

// Node environment is enough for now: app specs cover pure modules (i18n, layout, store).
// Switch to jsdom + the React plugin only when component specs are added.
const SPEC_GLOBS = ['src/**/*.spec.ts', 'src/**/*.spec.tsx'];

export default defineConfig({
    test: {
        environment: 'node',
        include: SPEC_GLOBS,
    },
});
