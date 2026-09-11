import { defineConfig } from 'vitest/config';

// CLAUDE.md: keep engine line coverage >= 99%. CI runs `test:cov`; vitest exits non-zero below this.
const MIN_LINE_COVERAGE_PERCENT = 99;

export default defineConfig({
    test: {
        globals: true,
        include: ['test/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/**'],
            reporter: ['text'],
            thresholds: { lines: MIN_LINE_COVERAGE_PERCENT },
        },
    },
});
