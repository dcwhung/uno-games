/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// Vite's ?raw loader (see vitest.config.ts): the app tsconfig has no Node types, so no fs here.
import css from '../styles.css?raw';
import { MAX_TOASTS, TOAST_MS, appendToasts, expireToasts } from './toastQueue';
import type { Toast } from './toastQueue';

function toast(seq: number): Toast {
    return { seq, text: `toast-${seq}` };
}

describe('styles.css toast timeline', () => {
    it('should declare --toast-total equal to TOAST_MS', () => {
        expect(css).toContain(`--toast-total: ${TOAST_MS}ms;`);
    });
});

describe('appendToasts', () => {
    it('should keep only the newest MAX_TOASTS entries', () => {
        const queue = [toast(1), toast(2), toast(3)];
        const incoming = [toast(4), toast(5)];

        const next = appendToasts(queue, incoming);

        expect(next).toHaveLength(MAX_TOASTS);
        expect(next.map((x) => x.seq)).toEqual([3, 4, 5]);
    });
});

describe('expireToasts', () => {
    it('should remove only the toasts with the given seqs', () => {
        const queue = [toast(1), toast(2), toast(3)];

        expect(expireToasts(queue, [1, 3]).map((x) => x.seq)).toEqual([2]);
    });

    it('should return the same queue when nothing matches', () => {
        const queue = [toast(1)];

        expect(expireToasts(queue, [9])).toEqual(queue);
    });
});
