// Writes .vercel/output/config.json (Vercel Build Output API v3) from vercel.json (S-067).
//
// WHY THIS EXISTS
// The production deploy is *prebuilt*, so Vercel never reads vercel.json during the deploy --
// it reads .vercel/output/config.json. Before this script, deploy.yml hand-wrote that file in a
// heredoc, which meant the SPA fallback was declared twice in two different dialects, kept in
// sync by three comments and a line in docs/environments.md. Nothing checked it. Routing drift
// would have shown up as "local `vercel build` behaves differently from the CI deploy", which is
// miserable to debug.
//
// Now vercel.json is the single source of truth, and anything this converter does not understand
// is a LOUD FAILURE at deploy time rather than a silent divergence. The mapping is deliberately
// narrow: `rewrites` (path patterns) and `routes` (regexes) are different languages, and a
// general path-to-regexp translator would be more code, and more risk, than this repo needs.
//
// W-050: validation is an ALLOWLIST all the way down to the field level, not just the top-level
// key level. The first version checked which keys vercel.json used but never checked the fields
// inside a rewrite, so a rewrite with no `destination` produced `{src, status}` with no `dest` --
// JSON.stringify drops an undefined value -- which disables the SPA fallback while `/` keeps
// answering 200 through the filesystem handler. Both smoke gates would have stayed green with
// every deep link 404ing. The rule this encodes: validate down to the smallest unit a person
// edits by hand, and treat unknown as fatal rather than as absent. Covered by
// scripts/vercel-build-output.spec.mjs.
//
// NOT replaced by `vercel build`: that would work, but the Vercel CLI runs vercel.json's
// buildCommand as a child process, and Vercel's own documented CI flow passes VERCEL_TOKEN to it.
// That would put a production deploy token back into the environment of the app build -- exactly
// what W-045 removed. See the job comments in .github/workflows/deploy.yml.
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const VERCEL_JSON_PATH = resolve(REPO_ROOT, 'vercel.json');
const OUTPUT_DIR = resolve(REPO_ROOT, '.vercel/output');
const CONFIG_PATH = resolve(OUTPUT_DIR, 'config.json');

// Routing keys this converter does NOT translate. If one appears in vercel.json, the prebuilt
// deploy would silently ignore it -- so fail instead, and extend this script deliberately.
const UNSUPPORTED_ROUTING_KEYS = ['routes', 'redirects', 'headers', 'cleanUrls', 'trailingSlash'];

// W-050: the only keys this converter knows how to carry across from a rewrite object. Anything
// else (`has`, `missing`, `statusCode`, ...) is routing that would be dropped on the floor, and a
// dropped `has` is worse than a dropped route: a rule that should have been conditional then
// applies to every request. Allowlist, not blocklist -- unknown is fatal.
const REWRITE_ALLOWED_KEYS = ['source', 'destination'];

// The one rewrite shape understood here: a catch-all that hands every unmatched path to the SPA
// entry point. `/(.*)` (path pattern) becomes `/.*` (regex) after the filesystem handler.
const SPA_CATCH_ALL_SOURCE = '/(.*)';
const SPA_CATCH_ALL_SRC = '/.*';
const REWRITE_STATUS = 200;
const BUILD_OUTPUT_VERSION = 3;
const EXPECTED_REWRITE_COUNT = 1;

const EXIT_INVALID = 1;
const JSON_INDENT_SPACES = 2;

// Every rejection this script makes is one of these, so the entry point can turn it into a single
// `::error::` line instead of a Node stack trace, and the specs can assert on it without spawning
// a process.
export class InvalidVercelConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidVercelConfigError';
    }
}

function fail(message) {
    throw new InvalidVercelConfigError(message);
}

function readJson(path) {
    let raw;

    try {
        raw = readFileSync(path, 'utf8');
    } catch (error) {
        fail(`Cannot read ${path}: ${error.message}`);
    }

    try {
        return JSON.parse(raw);
    } catch (error) {
        fail(`${path} is not valid JSON: ${error.message}`);
    }
}

// Rejects rewrite fields this converter would otherwise drop without a word.
function assertRewriteIsTranslatable(rewrite) {
    const extraKeys = Object.keys(rewrite).filter((key) => !REWRITE_ALLOWED_KEYS.includes(key));

    if (extraKeys.length > 0) {
        fail(
            `vercel.json rewrite carries keys this script does not translate: ${extraKeys.join(', ')}. ` +
                `Teach scripts/vercel-build-output.mjs about them before deploying, or the prebuilt ` +
                `deployment will apply this route unconditionally.`,
        );
    }

    if (typeof rewrite.destination !== 'string' || rewrite.destination.length === 0) {
        fail(
            `vercel.json rewrite "destination" must be a non-empty string; ` +
                `got ${JSON.stringify(rewrite.destination)}. An absent dest silently disables the SPA ` +
                `fallback: "/" still resolves via the filesystem handler, so the smoke tests stay green ` +
                `while every deep link 404s.`,
        );
    }
}

// Returns the single catch-all rewrite, or throws describing exactly what is unsupported.
function readCatchAllRewrite(vercelConfig) {
    const unsupported = UNSUPPORTED_ROUTING_KEYS.filter((key) => key in vercelConfig);

    if (unsupported.length > 0) {
        fail(
            `vercel.json uses routing keys this script does not translate: ${unsupported.join(', ')}. ` +
                `Teach scripts/vercel-build-output.mjs about them before deploying, or the prebuilt ` +
                `deployment will silently ignore them.`,
        );
    }

    const rewrites = vercelConfig.rewrites ?? [];

    if (!Array.isArray(rewrites)) {
        fail(`vercel.json "rewrites" must be an array; got ${JSON.stringify(rewrites)}.`);
    }

    const [rewrite] = rewrites;

    if (rewrites.length !== EXPECTED_REWRITE_COUNT || rewrite.source !== SPA_CATCH_ALL_SOURCE) {
        fail(
            `vercel.json "rewrites" must be exactly one SPA catch-all with source ` +
                `"${SPA_CATCH_ALL_SOURCE}"; got ${JSON.stringify(rewrites)}.`,
        );
    }

    assertRewriteIsTranslatable(rewrite);

    return rewrite;
}

// "handle": "filesystem" serves real files first; everything left over falls back to the SPA
// entry point, so a client-side route survives a hard refresh.
function buildConfig(rewrite) {
    return {
        version: BUILD_OUTPUT_VERSION,
        routes: [
            { handle: 'filesystem' },
            { src: SPA_CATCH_ALL_SRC, status: REWRITE_STATUS, dest: rewrite.destination },
        ],
    };
}

// The whole translation, as a pure function: parsed vercel.json in, Build Output config out,
// InvalidVercelConfigError on anything this script refuses to guess about.
export function buildVercelOutputConfig(vercelConfig) {
    return buildConfig(readCatchAllRewrite(vercelConfig));
}

function main() {
    let config;

    try {
        config = buildVercelOutputConfig(readJson(VERCEL_JSON_PATH));
    } catch (error) {
        console.error(`::error::${error.message}`);
        process.exit(EXIT_INVALID);
    }

    rmSync(OUTPUT_DIR, { recursive: true, force: true });
    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, JSON_INDENT_SPACES)}\n`);

    console.log(`Wrote ${CONFIG_PATH} from vercel.json:`);
    console.log(JSON.stringify(config, null, JSON_INDENT_SPACES));
}

// Run only when invoked as a command, so the specs can import the pure builder above without the
// import itself reading the repo's vercel.json, writing .vercel/output, or calling process.exit
// (which would take the test worker down with it). realpath on both sides because a temp
// directory reaches this script through a symlink on macOS.
function isDirectRun() {
    const entryPath = process.argv[1];

    if (entryPath === undefined) {
        return false;
    }

    try {
        return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url));
    } catch {
        return false;
    }
}

if (isDirectRun()) {
    main();
}
