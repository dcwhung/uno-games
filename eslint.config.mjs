// ESLint flat config for the uno-games monorepo (W-010 / AU-014).
// Rule targets follow skills/sw-coding-style-ts; architecture guards follow CLAUDE.md R1 / R3 / R6.
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const IGNORED_PATHS = [
    '**/dist/**',
    '**/coverage/**',
    '**/node_modules/**',
    '.claude/**',
    '.proj-docs/**',
    // Playwright smoke script: runs against a preview server, not part of the lint gate (separate task).
    'scripts/smoke.mjs',
];

const TS_FILES = ['**/*.ts', '**/*.tsx'];
const ENGINE_SRC = ['packages/engine/src/**/*.ts'];
const ENGINE_ALL = ['packages/engine/**/*.ts'];
const APP_FILES = ['packages/app/src/**/*.ts', 'packages/app/src/**/*.tsx'];

// CLAUDE.md R1 / R6: engine is pure TS — no React, no DOM, no timers, no theme imports.
const ENGINE_FORBIDDEN_IMPORT_PATTERNS = [
    {
        group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
        message: 'Engine must not import React (CLAUDE.md R1).',
    },
    {
        group: ['three', 'three/*', '@react-three/*'],
        message: 'Engine must not import three / R3F (CLAUDE.md R1).',
    },
    {
        group: ['zustand', 'zustand/*'],
        message: 'Engine must not import zustand (CLAUDE.md R1).',
    },
    {
        group: ['**/app/**', '@uno/app', '@uno/app/*'],
        message: 'Engine must not import from packages/app (CLAUDE.md R6).',
    },
];

// CLAUDE.md R1: all randomness via rngForTick; no Date / Math.random / timers in the engine.
// W-041: closes every wall-clock / timer / runtime entry point, not just the four most common.
const R1_NO_WALL_CLOCK = 'No wall-clock time in the engine (CLAUDE.md R1).';
const R1_NO_TIMERS = 'No timers in the engine (CLAUDE.md R1).';
const R1_NO_RUNTIME = 'No host-runtime access in the engine (CLAUDE.md R1).';
const R1_USE_RNG_FOR_TICK = 'Use rngForTick(seed, tick) instead (CLAUDE.md R1).';
// Member access (`globalThis.Date`, `window.setTimeout`, `globalThis['Date']`) is invisible to
// no-restricted-globals for the *property*, so the global-object aliases themselves are banned:
// the engine never needs them, and this catches every bypass in one identifier check.
const R1_NO_GLOBAL_OBJECT =
    'Do not reach the global object from the engine; it bypasses the R1 guards (CLAUDE.md R1).';
const ENGINE_FORBIDDEN_GLOBALS = [
    { name: 'Date', message: R1_NO_WALL_CLOCK },
    { name: 'performance', message: R1_NO_WALL_CLOCK },
    { name: 'setTimeout', message: R1_NO_TIMERS },
    { name: 'setInterval', message: R1_NO_TIMERS },
    { name: 'setImmediate', message: R1_NO_TIMERS },
    { name: 'queueMicrotask', message: R1_NO_TIMERS },
    { name: 'requestAnimationFrame', message: R1_NO_TIMERS },
    { name: 'requestIdleCallback', message: R1_NO_TIMERS },
    { name: 'process', message: R1_NO_RUNTIME },
    { name: 'crypto', message: R1_USE_RNG_FOR_TICK },
    { name: 'globalThis', message: R1_NO_GLOBAL_OBJECT },
    { name: 'window', message: R1_NO_GLOBAL_OBJECT },
    { name: 'self', message: R1_NO_GLOBAL_OBJECT },
    { name: 'global', message: R1_NO_GLOBAL_OBJECT },
];
const ENGINE_FORBIDDEN_PROPERTIES = [
    { object: 'Math', property: 'random', message: R1_USE_RNG_FOR_TICK },
];

export default tseslint.config(
    { ignores: IGNORED_PATHS },

    js.configs.recommended,
    ...tseslint.configs.recommended,

    // ---- Shared TS / TSX rules (sw-coding-style-ts) ----
    {
        files: TS_FILES,
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            // W-009 cleared every existing `!`; `error` keeps it that way. With
            // `noUncheckedIndexedAccess` on, the replacement for an indexed read is a
            // named invariant helper (engine `invariant` / `elementAt`, or a local
            // throwing helper in specs) — never `as` or `?? fallback`, which only move
            // the failure to runtime and make it silent.
            '@typescript-eslint/no-non-null-assertion': 'error',
            // AU-003 uses a single console.error for the bot-fallback path; all else forbidden.
            'no-console': ['error', { allow: ['error'] }],
            // The engine's Rng is an immutable value type; `let rng: Rng = this` followed by
            // reassignment to `next().rng` is the intended chaining pattern, not a `self = this`
            // closure alias. Allow that one name; every other alias is still an error.
            '@typescript-eslint/no-this-alias': ['error', { allowedNames: ['rng'] }],
        },
    },

    // ---- Engine: pure, deterministic, dependency-free (CLAUDE.md R1 / R6) ----
    {
        files: ENGINE_SRC,
        rules: {
            'no-restricted-imports': ['error', { patterns: ENGINE_FORBIDDEN_IMPORT_PATTERNS }],
            'no-restricted-globals': ['error', ...ENGINE_FORBIDDEN_GLOBALS],
            'no-restricted-properties': ['error', ...ENGINE_FORBIDDEN_PROPERTIES],
        },
    },
    {
        files: ENGINE_ALL,
        languageOptions: { globals: { ...globals.node } },
    },

    // ---- App: React 18 + R3F; hooks rules ----
    // W-040: dependency arrays must be complete (sw-coding-style-ts); both rules are `error`.
    {
        files: APP_FILES,
        plugins: { 'react-hooks': reactHooks },
        languageOptions: { globals: { ...globals.browser } },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
        },
    },

    // ---- Plain JS config files at root (*.js / *.mjs / *.cjs) ----
    {
        files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
        languageOptions: { globals: { ...globals.node } },
    },

    // Must be last: disables stylistic rules that would conflict with Prettier.
    prettierConfig,
);
