// Specs for scripts/check-audit-allowlist.mjs (S-072).
//
// The check itself must never fail a build -- an unmaintainable red gate is the exact failure
// mode W-044 was written to avoid -- so these specs pin two things: the right verdict for each
// state of the allowlist, and exit 0 from the CLI in every one of them, including the states
// that are themselves mistakes (reworded comment, missing date).
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AllowlistStatus, checkAuditAllowlist } from './check-audit-allowlist.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const SCRIPT_PATH = resolve(SCRIPT_DIR, 'check-audit-allowlist.mjs');

const REVIEW_DATE = '2026-12-11';
const BEFORE_REVIEW_DATE = new Date('2026-12-10T23:59:59Z');
const ON_REVIEW_DATE = new Date('2026-12-11T00:00:00Z');
const AFTER_REVIEW_DATE = new Date('2027-01-05T00:00:00Z');

function packageJsonWith({
    notes = [`Next review: ${REVIEW_DATE}, or when vitest 4 is adopted`],
    ghsas = ['GHSA-82fw-gwwq-j7x9'],
} = {}) {
    return {
        pnpm: {
            '//auditConfig': notes,
            auditConfig: { ignoreGhsas: ghsas },
        },
    };
}

describe('checkAuditAllowlist', () => {
    it('is satisfied while the review date is still in the future', () => {
        const result = checkAuditAllowlist(packageJsonWith(), BEFORE_REVIEW_DATE);

        expect(result.status).toBe(AllowlistStatus.Ok);
        expect(result.message).toContain(REVIEW_DATE);
    });

    // The date is a deadline, not a grace period: the day it names is already the day to act.
    it('reports overdue on the review date itself', () => {
        expect(checkAuditAllowlist(packageJsonWith(), ON_REVIEW_DATE).status).toBe(
            AllowlistStatus.Overdue,
        );
    });

    it('reports overdue after the review date, naming the date and the allowlisted advisory', () => {
        const result = checkAuditAllowlist(packageJsonWith(), AFTER_REVIEW_DATE);

        expect(result.status).toBe(AllowlistStatus.Overdue);
        expect(result.message).toContain(REVIEW_DATE);
        expect(result.message).toContain('GHSA-82fw-gwwq-j7x9');
    });

    // An empty allowlist is the goal state, not a problem: nothing is being ignored, so a stale
    // date next to it is not worth a warning.
    it('is satisfied when nothing is allowlisted at all', () => {
        const result = checkAuditAllowlist(packageJsonWith({ ghsas: [] }), AFTER_REVIEW_DATE);

        expect(result.status).toBe(AllowlistStatus.NoAllowlist);
    });

    it('is satisfied when there is no pnpm.auditConfig block', () => {
        expect(checkAuditAllowlist({}, AFTER_REVIEW_DATE).status).toBe(AllowlistStatus.NoAllowlist);
    });

    // Warn rather than pass silently: an allowlist whose date has been edited away is exactly the
    // "allowlist nobody re-reads" the W-044 comment warns about.
    it('warns when an allowlist carries no parseable review date', () => {
        const result = checkAuditAllowlist(
            packageJsonWith({ notes: ['GHSA-82fw-gwwq-j7x9 -- unfixable on vitest 3.'] }),
            BEFORE_REVIEW_DATE,
        );

        expect(result.status).toBe(AllowlistStatus.NoDate);
    });

    it('warns when the notes block is missing entirely', () => {
        const packageJson = { pnpm: { auditConfig: { ignoreGhsas: ['GHSA-1111-1111-1111'] } } };

        expect(checkAuditAllowlist(packageJson, BEFORE_REVIEW_DATE).status).toBe(
            AllowlistStatus.NoDate,
        );
    });

    // The committed package.json must be in a state this check understands; if someone reformats
    // the W-044 note out of recognition, that should surface here rather than as a silent pass.
    it('finds a real review date in the committed package.json', () => {
        const result = checkAuditAllowlist(readRepoPackageJson(), BEFORE_REVIEW_DATE);

        expect([AllowlistStatus.Ok, AllowlistStatus.Overdue]).toContain(result.status);
    });
});

describe('check-audit-allowlist.mjs as a CLI', () => {
    // The whole point of S-072: a signal, never a blocker.
    it('exits 0 against the committed package.json', () => {
        const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
        });

        expect(stdout).toContain('allowlist');
    });
});

function readRepoPackageJson() {
    return JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'));
}
