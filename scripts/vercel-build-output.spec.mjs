// Specs for scripts/vercel-build-output.mjs (W-050).
//
// WHAT THIS GUARDS
// The script's own header, deploy.yml and docs/environments.md all make the same promise:
// routing this converter cannot translate FAILS THE DEPLOY rather than being silently dropped.
// W-050 found three counter-examples, all of which exited 0 and wrote a structurally valid but
// semantically wrong config.json:
//
//   - a rewrite with no `destination`      -> `{src, status}` and no `dest`. JSON.stringify drops
//     an undefined value entirely, so the SPA fallback disappears. `/` still resolves through the
//     filesystem handler, so BOTH smoke gates stay green while every deep link 404s.
//   - `destination: ''`                    -> `dest: ''`.
//   - a rewrite carrying `has` / `missing`  -> the condition is dropped, and a route that should
//     have been conditional applies to every request.
//
// Two layers, because the deploy depends on both: the pure builder is called directly, and the
// CLI is run as a subprocess against a fixture repo so the exit code / `::error::` contract that
// CI actually reads is covered as well.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, describe, expect, it } from 'vitest';

import { buildVercelOutputConfig, InvalidVercelConfigError } from './vercel-build-output.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SCRIPT_PATH = resolve(SCRIPT_DIR, 'vercel-build-output.mjs');
const VERCEL_JSON_PATH = resolve(REPO_ROOT, 'vercel.json');
const CONFIG_RELATIVE_PATH = '.vercel/output/config.json';

const EXIT_INVALID = 1;
const JSON_INDENT_SPACES = 2;

// The shape the repo actually ships, kept separate from vercel.json so a failure here points at
// the converter rather than at whoever last edited the real file.
const VALID_VERCEL_JSON = {
    $schema: 'https://openapi.vercel.sh/vercel.json',
    framework: 'vite',
    rewrites: [{ source: '/(.*)', destination: '/index.html' }],
};

// The exact object the hand-written heredoc in deploy.yml used to produce. Asserting against a
// literal rather than a re-derivation is the point: this is the contract with Vercel, not an
// implementation detail of the script.
const EXPECTED_CONFIG = {
    version: 3,
    routes: [{ handle: 'filesystem' }, { src: '/.*', status: 200, dest: '/index.html' }],
};

function withRewrite(rewrite) {
    return { ...VALID_VERCEL_JSON, rewrites: [rewrite] };
}

const sandboxes = [];

// Copies the script into a throwaway repo root so the CLI can be driven against arbitrary
// vercel.json content. The script derives its repo root from its own location, so a copy is the
// only way to test the entry point without touching the real vercel.json.
// `vercelJson === null` leaves the file out entirely.
function runScriptAgainst(vercelJson) {
    const sandbox = mkdtempSync(resolve(tmpdir(), 'vercel-build-output-'));

    sandboxes.push(sandbox);
    mkdirSync(resolve(sandbox, 'scripts'), { recursive: true });
    copyFileSync(SCRIPT_PATH, resolve(sandbox, 'scripts/vercel-build-output.mjs'));

    if (vercelJson !== null) {
        writeFileSync(
            resolve(sandbox, 'vercel.json'),
            `${JSON.stringify(vercelJson, null, JSON_INDENT_SPACES)}\n`,
        );
    }

    return {
        ...runScriptIn(sandbox, resolve(sandbox, 'scripts/vercel-build-output.mjs')),
        sandbox,
    };
}

// Runs the CLI exactly as the "Assemble Vercel prebuilt output" step does.
function runScriptIn(cwd, scriptPath) {
    try {
        const stdout = execFileSync(process.execPath, [scriptPath], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        return { status: 0, stdout, stderr: '' };
    } catch (error) {
        return { status: error.status, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
    }
}

function readWrittenConfig(root) {
    return JSON.parse(readFileSync(resolve(root, CONFIG_RELATIVE_PATH), 'utf8'));
}

afterAll(() => {
    for (const sandbox of sandboxes) {
        rmSync(sandbox, { recursive: true, force: true });
    }
});

describe('buildVercelOutputConfig', () => {
    // Case #1 -- the happy path must stay identical to the heredoc it replaced.
    it('translates the SPA catch-all rewrite into the filesystem + fallback route pair', () => {
        expect(buildVercelOutputConfig(VALID_VERCEL_JSON)).toEqual(EXPECTED_CONFIG);
    });

    // The committed vercel.json must keep matching what the converter understands. If someone
    // edits it into a shape the deploy cannot translate, that should be a red test, not a red tag.
    it('agrees with the committed vercel.json', () => {
        expect(buildVercelOutputConfig(JSON.parse(readFileSync(VERCEL_JSON_PATH, 'utf8')))).toEqual(
            EXPECTED_CONFIG,
        );
    });

    // Case A -- exited 0 and dropped `dest` entirely before W-050.
    it('rejects a rewrite with no destination', () => {
        const config = withRewrite({ source: '/(.*)' });

        expect(() => buildVercelOutputConfig(config)).toThrow(InvalidVercelConfigError);
        expect(() => buildVercelOutputConfig(config)).toThrow(/destination/);
    });

    // Case B -- exited 0 and wrote `dest: ""` before W-050.
    it('rejects an empty-string destination', () => {
        const config = withRewrite({ source: '/(.*)', destination: '' });

        expect(() => buildVercelOutputConfig(config)).toThrow(/destination/);
    });

    it('rejects a non-string destination', () => {
        const config = withRewrite({ source: '/(.*)', destination: 42 });

        expect(() => buildVercelOutputConfig(config)).toThrow(/destination/);
    });

    // Case C -- the nastiest one: a conditional route silently became unconditional.
    it.each([
        ['has', [{ type: 'host', value: 'beta.example.com' }]],
        ['missing', [{ type: 'cookie', key: 'beta' }]],
    ])('rejects a rewrite carrying %s, naming the key', (key, value) => {
        const config = withRewrite({ source: '/(.*)', destination: '/index.html', [key]: value });

        expect(() => buildVercelOutputConfig(config)).toThrow(new RegExp(`\\b${key}\\b`));
    });

    // Cases #2 / #3 -- already blocked before W-050; locked in so they stay blocked.
    it.each([
        ['headers', [{ source: '/(.*)', headers: [{ key: 'X-Frame-Options', value: 'DENY' }] }]],
        ['redirects', [{ source: '/old', destination: '/new' }]],
        ['routes', [{ src: '/.*', dest: '/index.html' }]],
    ])('rejects top-level %s', (key, value) => {
        const config = { ...VALID_VERCEL_JSON, [key]: value };

        expect(() => buildVercelOutputConfig(config)).toThrow(new RegExp(key));
    });

    // Case #5 -- rewrites removed entirely.
    it('rejects a vercel.json with no rewrites at all', () => {
        expect(() => buildVercelOutputConfig({ framework: 'vite' })).toThrow(/rewrites/);
    });

    // Case #4 -- a narrowed source ships a fallback that no longer covers every path.
    it('rejects a rewrite whose source is not the catch-all', () => {
        const config = withRewrite({ source: '/app/(.*)', destination: '/index.html' });

        expect(() => buildVercelOutputConfig(config)).toThrow(/source/);
    });

    it('rejects a second rewrite', () => {
        const config = {
            ...VALID_VERCEL_JSON,
            rewrites: [
                { source: '/(.*)', destination: '/index.html' },
                { source: '/api/(.*)', destination: '/api.html' },
            ],
        };

        expect(() => buildVercelOutputConfig(config)).toThrow(/rewrites/);
    });

    // Case D -- fail-closed before W-050, but via a raw "rewrites is not iterable" TypeError.
    it('rejects a rewrites value that is not an array, with a readable message', () => {
        const config = { ...VALID_VERCEL_JSON, rewrites: { source: '/(.*)' } };

        expect(() => buildVercelOutputConfig(config)).toThrow(InvalidVercelConfigError);
        expect(() => buildVercelOutputConfig(config)).toThrow(/rewrites/);
    });
});

describe('vercel-build-output.mjs as a CLI', () => {
    // Importing the module for the specs above must not deploy anything, and the entry point must
    // still be wired to the builder -- otherwise every assertion above proves nothing about CI.
    it('writes the config and exits 0 for a valid vercel.json', () => {
        const { status, stdout, sandbox } = runScriptAgainst(VALID_VERCEL_JSON);

        expect(status).toBe(0);
        expect(stdout).toContain(CONFIG_RELATIVE_PATH);
        expect(readWrittenConfig(sandbox)).toEqual(EXPECTED_CONFIG);
    });

    // The regression itself, at the layer CI reads: exit code, not just a thrown error.
    it.each([
        ['a destination-less rewrite', withRewrite({ source: '/(.*)' })],
        ['an empty destination', withRewrite({ source: '/(.*)', destination: '' })],
        [
            'a has[] condition',
            withRewrite({ source: '/(.*)', destination: '/index.html', has: [{ type: 'host' }] }),
        ],
    ])('exits non-zero with an ::error:: annotation for %s', (_label, vercelJson) => {
        const { status, stderr } = runScriptAgainst(vercelJson);

        expect(status).toBe(EXIT_INVALID);
        expect(stderr).toContain('::error::');
    });

    // Case F -- a missing / unparseable vercel.json must still fail closed, and must say so in a
    // way the Actions log surfaces rather than as a bare Node stack trace.
    it('exits non-zero with an ::error:: annotation when vercel.json is missing', () => {
        const { status, stderr } = runScriptAgainst(null);

        expect(status).toBe(EXIT_INVALID);
        expect(stderr).toContain('::error::');
    });
});
