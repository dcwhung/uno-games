// Warns when the pnpm audit allowlist in package.json is past its stated review date (S-072).
//
// WHY THIS EXISTS
// W-044 tightened both audit gates from `high` to `moderate` and named the one advisory that
// cannot be fixed in `pnpm.auditConfig.ignoreGhsas`, with a reason, a review date and an exit
// condition written beside it. Nothing made the date happen. An allowlist nobody re-reads turns
// `--audit-level=moderate` into a nominal setting, so this turns the date into a signal.
//
// WARNING, NEVER A FAILURE. This script always exits 0. A blocking gate whose only remedy is
// "someone must go and review something" is precisely the shape W-044 set out to avoid: CI that
// is red for a reason nobody can fix on the spot gets bypassed or torn out, taking the real
// gates with it. A `::warning::` is visible in the Actions UI and in the PR checks summary
// without standing between anyone and a merge.
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const PACKAGE_JSON_PATH = resolve(REPO_ROOT, 'package.json');

// Length of a YYYY-MM-DD prefix, used to compare an ISO timestamp against a date-only deadline.
const ISO_DATE_LENGTH = 10;

// The notes live in a `//`-prefixed sibling key, which pnpm ignores (verified by W-044's T2
// experiment: deleting the real auditConfig turned the gate red while this key stayed inert).
const NOTES_KEY = '//auditConfig';
const REVIEW_DATE_PATTERN = /Next review:\s*(\d{4}-\d{2}-\d{2})/;

export const AllowlistStatus = {
    Ok: 'ok',
    Overdue: 'overdue',
    NoAllowlist: 'no-allowlist',
    NoDate: 'no-date',
};

function allowlistedGhsas(packageJson) {
    return packageJson.pnpm?.auditConfig?.ignoreGhsas ?? [];
}

function reviewDateFrom(packageJson) {
    const notes = packageJson.pnpm?.[NOTES_KEY];
    const text = Array.isArray(notes) ? notes.join(' ') : (notes ?? '');
    const match = REVIEW_DATE_PATTERN.exec(text);

    return match === null ? null : match[1];
}

// Pure: takes the parsed package.json and "now", returns a verdict. `today` is injected so the
// specs can pin both sides of the boundary instead of depending on when they run.
export function checkAuditAllowlist(packageJson, today) {
    const ghsas = allowlistedGhsas(packageJson);

    if (ghsas.length === 0) {
        return {
            status: AllowlistStatus.NoAllowlist,
            message: 'pnpm audit allowlist is empty -- nothing to review.',
        };
    }

    const reviewDate = reviewDateFrom(packageJson);

    if (reviewDate === null) {
        return {
            status: AllowlistStatus.NoDate,
            message:
                `pnpm audit allowlist ignores ${ghsas.join(', ')} but carries no "Next review: YYYY-MM-DD" ` +
                `line in package.json's "${NOTES_KEY}" notes. W-044: every entry must keep a reason, a ` +
                `review date and an exit condition.`,
        };
    }

    // Date-only comparison in UTC: the review date is a deadline, so the day it names is already
    // the day to act, not a grace period.
    const isOverdue = today.toISOString().slice(0, ISO_DATE_LENGTH) >= reviewDate;

    if (isOverdue) {
        return {
            status: AllowlistStatus.Overdue,
            message:
                `pnpm audit allowlist is due for review (Next review: ${reviewDate}). It still ignores ` +
                `${ghsas.join(', ')}. Re-check whether the advisory is now fixable; if it is, delete the ` +
                `entry and confirm \`pnpm audit --audit-level=moderate\` still exits 0. If it is not, ` +
                `move the date forward in package.json with a fresh reason.`,
        };
    }

    return {
        status: AllowlistStatus.Ok,
        message: `pnpm audit allowlist is in date (Next review: ${reviewDate}).`,
    };
}

function main() {
    const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8'));
    const { status, message } = checkAuditAllowlist(packageJson, new Date());

    if (status === AllowlistStatus.Ok || status === AllowlistStatus.NoAllowlist) {
        console.log(message);
        return;
    }

    console.log(`::warning file=package.json::${message}`);
}

// Run only when invoked as a command, so importing the pure check above has no side effects.
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
