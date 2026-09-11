// Validates public/assets/cards/manifest.json against manifest.schema.json (CLAUDE.md R6).
//
// AU-016: replaces the `ajv-cli` invocation this script was ported from. ajv-cli@5 pulled in
// fast-json-patch < 3.1.1 (GHSA-8gh8-hqwg-xf34, prototype pollution) and is unmaintained, so the
// CLI is gone and `ajv` is used directly. Behaviour is unchanged: draft 2020-12, strict mode off,
// errors printed and a non-zero exit when the manifest does not match the schema.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Ajv2020 from 'ajv/dist/2020.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(SCRIPT_DIR, '../public/assets/cards');
const SCHEMA_PATH = resolve(ASSETS_DIR, 'manifest.schema.json');
const MANIFEST_PATH = resolve(ASSETS_DIR, 'manifest.json');

// `--strict=false` in the old CLI call: the schema carries annotation keywords Ajv's strict mode
// rejects. `allErrors` reports every mismatch in one run instead of stopping at the first.
const AJV_OPTIONS = { strict: false, allErrors: true };

const EXIT_INVALID = 1;
const JSON_INDENT_SPACES = 2;

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// Returns null when the manifest is valid, otherwise Ajv's error list.
function collectManifestErrors() {
  const ajv = new Ajv2020(AJV_OPTIONS);
  const validate = ajv.compile(readJson(SCHEMA_PATH));
  return validate(readJson(MANIFEST_PATH)) ? null : (validate.errors ?? []);
}

function reportAndExit(errors) {
  console.error(`Invalid card asset manifest: ${MANIFEST_PATH}`);
  console.error(JSON.stringify(errors, null, JSON_INDENT_SPACES));
  process.exit(EXIT_INVALID);
}

const errors = collectManifestErrors();

if (errors) {
  reportAndExit(errors);
}

console.log(`Card asset manifest valid: ${MANIFEST_PATH}`);
