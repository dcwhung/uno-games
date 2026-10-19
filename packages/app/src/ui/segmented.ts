/**
 * segmented.ts — the pure keyboard half of <Segmented /> (S-092): which option
 * an arrow key moves the radiogroup's choice to.
 */
const STEP_BY_KEY: Readonly<Record<string, number>> = {
    ArrowRight: 1,
    ArrowDown: 1,
    ArrowLeft: -1,
    ArrowUp: -1,
};
export const NOT_FOUND = -1;
const FIRST = 0;

/**
 * Index `key` moves to from `index` (NOT_FOUND when nothing is chosen yet),
 * wrapping at both ends; undefined for non-arrow keys or an empty group.
 */
export function stepIndex(count: number, index: number, key: string): number | undefined {
    const step = STEP_BY_KEY[key];
    if (step === undefined || count === 0) return undefined;
    if (index === NOT_FOUND) return FIRST;
    return (index + step + count) % count;
}
