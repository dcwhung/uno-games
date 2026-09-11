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
// NOT replaced by `vercel build`: that would work, but the Vercel CLI runs vercel.json's
// buildCommand as a child process, and Vercel's own documented CI flow passes VERCEL_TOKEN to it.
// That would put a production deploy token back into the environment of the app build -- exactly
// what W-045 removed. See the job comments in .github/workflows/deploy.yml.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// The one rewrite shape understood here: a catch-all that hands every unmatched path to the SPA
// entry point. `/(.*)` (path pattern) becomes `/.*` (regex) after the filesystem handler.
const SPA_CATCH_ALL_SOURCE = '/(.*)';
const SPA_CATCH_ALL_SRC = '/.*';
const REWRITE_STATUS = 200;
const BUILD_OUTPUT_VERSION = 3;

const EXIT_INVALID = 1;
const JSON_INDENT_SPACES = 2;

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function fail(message) {
    console.error(`::error::${message}`);
    process.exit(EXIT_INVALID);
}

// Returns the single catch-all rewrite, or exits describing exactly what is unsupported.
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
    const [rewrite] = rewrites;

    if (rewrites.length !== 1 || rewrite.source !== SPA_CATCH_ALL_SOURCE) {
        fail(
            `vercel.json "rewrites" must be exactly one SPA catch-all with source ` +
                `"${SPA_CATCH_ALL_SOURCE}"; got ${JSON.stringify(rewrites)}.`,
        );
    }

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

const config = buildConfig(readCatchAllRewrite(readJson(VERCEL_JSON_PATH)));

rmSync(OUTPUT_DIR, { recursive: true, force: true });
mkdirSync(OUTPUT_DIR, { recursive: true });
writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, JSON_INDENT_SPACES)}\n`);

console.log(`Wrote ${CONFIG_PATH} from vercel.json:`);
console.log(JSON.stringify(config, null, JSON_INDENT_SPACES));
