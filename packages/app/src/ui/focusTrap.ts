/**
 * focusTrap.ts — keep Tab / Shift+Tab inside an open sheet (WCAG 2.1 §2.4.3).
 */
import type { KeyboardEvent } from 'react';

const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex="0"]';

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
