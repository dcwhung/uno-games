import { describe, expect, it } from 'vitest';

import { MAX_TOASTS, appendToasts, expireToasts } from './toastQueue';
import type { Toast } from './toastQueue';

function toast(seq: number): Toast {
    return { seq, text: `toast-${seq}` };
}

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
