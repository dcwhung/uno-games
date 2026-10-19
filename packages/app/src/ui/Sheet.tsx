/**
 * Sheet.tsx — the one modal surface (design §2.1 `--radius-panel` panels).
 *
 * Owns the a11y plumbing every sheet needs: dialog role, focus moved in on
 * open and restored on close, Esc to dismiss, Tab kept inside, everything
 * behind the scrim inert (W-086).
 */
import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';

import { inertOutside, trapTab } from './focusTrap';

const ESCAPE_KEY = 'Escape';
const TAB_KEY = 'Tab';

interface SheetProps {
    readonly title: string;
    readonly className?: string;
    /** Omitted when the sheet must be answered (colour choice, challenge). */
    readonly onClose?: () => void;
    readonly children: ReactNode;
}

export function Sheet({ title, className, onClose, children }: SheetProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const backdropRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Order matters: the opener is read before it turns inert, and turns
        // back before focus returns to it (focus() on an inert element is a no-op).
        const opener = document.activeElement;
        const restoreOutside = inertOutside(backdropRef.current);
        panelRef.current?.focus();
        return () => {
            restoreOutside();
            if (opener instanceof HTMLElement) opener.focus();
        };
    }, []);

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === ESCAPE_KEY && onClose) onClose();
        if (e.key === TAB_KEY && panelRef.current) trapTab(e, panelRef.current);
    };

    const handleBackdropPointerDown = (e: PointerEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return; // a tap inside the panel
        // A scrim tap dismisses a dismissible sheet; otherwise focus must stay
        // in the dialog, so the default "focus <body>" of the tap is cancelled.
        if (onClose) onClose();
        else {
            e.preventDefault();
            panelRef.current?.focus();
        }
    };

    return (
        <div ref={backdropRef} className="sheet-backdrop" onPointerDown={handleBackdropPointerDown}>
            <div
                ref={panelRef}
                className={className ? `sheet ${className}` : 'sheet'}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
            >
                <h2 className="sheet-title">{title}</h2>
                {children}
            </div>
        </div>
    );
}
