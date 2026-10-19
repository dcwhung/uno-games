/**
 * focusTrap.ts — keep Tab / Shift+Tab inside an open sheet (WCAG 2.1 §2.4.3)
 * and make everything outside it inert while it is open (W-086), so neither
 * the keyboard nor a tap can reach the covered HUD.
 *
 * `nodesOutside` and `makeInert` are structural so they can be specced on
 * plain objects; `inertOutside` is the DOM-facing wrapper the sheet calls.
 */
import type { KeyboardEvent } from 'react';

/** Tabbable only: a roving-tabindex radio at -1 (Segmented) is not a trap endpoint. */
const FOCUSABLE =
    'button:not([disabled]):not([tabindex="-1"]), [href], input, select, textarea, [tabindex="0"]';
/** Live regions (callouts, toasts) stay announceable while a sheet is open. */
const LIVE_REGION_ATTR = 'aria-live';

export function trapTab(e: KeyboardEvent<HTMLElement>, panel: HTMLElement): void {
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;

    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
    } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
    }
}

/** The slice of `Element` the traversal needs; a DOM element satisfies it as is. */
export interface TreeNode {
    readonly parentElement: TreeNode | null;
    readonly children: ArrayLike<TreeNode>;
}

export interface Inertable {
    inert: boolean;
}

/**
 * Every node outside `leaf`'s ancestor chain, nearest level first: the leaf's
 * siblings, then each ancestor's siblings, stopping below `root` (or at the
 * top of the tree when `root` is not an ancestor).
 */
export function nodesOutside(leaf: TreeNode, root: TreeNode): TreeNode[] {
    const outside: TreeNode[] = [];
    for (let node = leaf; node !== root && node.parentElement; node = node.parentElement) {
        const siblings = node.parentElement.children;
        for (let i = 0; i < siblings.length; i += 1) {
            const sibling = siblings[i];
            if (sibling && sibling !== node) outside.push(sibling);
        }
    }
    return outside;
}

/** Marks every node inert and returns the undo that restores each previous value. */
export function makeInert(nodes: readonly Inertable[]): () => void {
    const previous = nodes.map((n) => n.inert);
    for (const n of nodes) n.inert = true;
    return () => {
        nodes.forEach((n, i) => {
            n.inert = previous[i] ?? false;
        });
    };
}

function isInertableElement(n: TreeNode): n is HTMLElement {
    return n instanceof HTMLElement && !n.hasAttribute(LIVE_REGION_ATTR);
}

/**
 * `aria-modal` is a promise the browser does not enforce: a tap on the scrim
 * moves focus to <body> and the next Tab walks into the HUD. `inert` on every
 * element outside the backdrop enforces it, pointer and keyboard alike.
 */
export function inertOutside(backdrop: HTMLElement | null): () => void {
    if (!backdrop) return () => undefined;
    return makeInert(nodesOutside(backdrop, document.body).filter(isInertableElement));
}
