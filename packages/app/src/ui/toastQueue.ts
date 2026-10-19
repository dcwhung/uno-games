/**
 * toastQueue.ts — pure helpers behind <Toasts />.
 *
 * Kept free of React so the queue bookkeeping can be unit-tested in node
 * without jsdom. The seq cursor itself lives in `eventCursor.ts` (shared with
 * callouts, sound and stats since v0.3).
 */
export const MAX_TOASTS = 3;
/** How long a toast stays; styles.css `--toast-total` mirrors it (pinned by the spec). */
export const TOAST_MS = 1800;

export interface Toast {
    readonly seq: number;
    readonly text: string;
}

/** Appends and drops the oldest entries so at most MAX_TOASTS stay on screen. */
export function appendToasts(
    queue: readonly Toast[],
    incoming: readonly Toast[],
): readonly Toast[] {
    return [...queue, ...incoming].slice(-MAX_TOASTS);
}

export function expireToasts(queue: readonly Toast[], seqs: readonly number[]): readonly Toast[] {
    return queue.filter((x) => !seqs.includes(x.seq));
}
