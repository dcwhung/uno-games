import { defineConfig } from 'vitest/config';

// Node environment is enough for now: app specs cover pure modules (i18n, layout, store).
// Switch to jsdom + the React plugin only when component specs are added.
const SPEC_GLOBS = ['src/**/*.spec.ts', 'src/**/*.spec.tsx'];

// Coverage tracks pure .ts modules only: React / R3F components (.tsx) have no
// jsdom harness yet, so counting them would only report a misleading zero.
// No threshold until the app has a baseline (S-008).
const COVERAGE_INCLUDE = ['src/**/*.ts'];
// `src/test/**` holds shared spec fixtures (W-043): test scaffolding, not app code.
const COVERAGE_EXCLUDE = [
    'src/**/*.spec.ts',
    'src/**/*.spec.tsx',
    'src/**/*.tsx',
    'src/main.tsx',
    'src/**/*.d.ts',
    'src/test/**',
];

// Vitest blanks every CSS import, `?raw` included; let specs that pin styles.css
// values against their TS constants (ui/callouts.spec.ts) read the real source.
const RAW_CSS_IMPORTS = [/\.css\?raw$/];

export default defineConfig({
    test: {
        environment: 'node',
        include: SPEC_GLOBS,
        css: { include: RAW_CSS_IMPORTS },
        coverage: {
            provider: 'v8',
            include: COVERAGE_INCLUDE,
            exclude: COVERAGE_EXCLUDE,
            reporter: ['text', 'text-summary'],
        },
    },
});
