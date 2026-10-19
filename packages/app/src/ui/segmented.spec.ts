/**
 * segmented.spec.ts — arrow-key movement for the radiogroup (S-092), kept pure
 * so the wrap-around and the ignored keys are pinned without a DOM.
 */
import { describe, expect, it } from 'vitest';

import { stepIndex } from './segmented';

const COUNT = 3;
const FIRST = 0;
const LAST = COUNT - 1;
const MIDDLE = 1;

describe('stepIndex', () => {
    it('should move right / down to the next option', () => {
        expect(stepIndex(COUNT, FIRST, 'ArrowRight')).toBe(MIDDLE);
        expect(stepIndex(COUNT, FIRST, 'ArrowDown')).toBe(MIDDLE);
    });

    it('should move left / up to the previous option', () => {
        expect(stepIndex(COUNT, LAST, 'ArrowLeft')).toBe(MIDDLE);
        expect(stepIndex(COUNT, LAST, 'ArrowUp')).toBe(MIDDLE);
    });

    it('should wrap around at both ends', () => {
        expect(stepIndex(COUNT, LAST, 'ArrowRight')).toBe(FIRST);
        expect(stepIndex(COUNT, FIRST, 'ArrowLeft')).toBe(LAST);
    });

    it('should ignore keys that are not arrows', () => {
        expect(stepIndex(COUNT, MIDDLE, 'Enter')).toBeUndefined();
        expect(stepIndex(COUNT, MIDDLE, 'Tab')).toBeUndefined();
    });

    it('should land on the first option when nothing is selected yet', () => {
        const NONE_SELECTED = -1;

        expect(stepIndex(COUNT, NONE_SELECTED, 'ArrowRight')).toBe(FIRST);
    });

    it('should do nothing for an empty group', () => {
        expect(stepIndex(0, FIRST, 'ArrowRight')).toBeUndefined();
    });
});
