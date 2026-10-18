/**
 * Sheet.tsx — the one modal surface (design §2.1 `--radius-panel` panels).
 *
 * Owns the a11y plumbing every sheet needs: dialog role, focus moved in on
 * open and restored on close, Esc to dismiss, Tab kept inside.
 */
import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { trapTab } from './focusTrap';

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

    useEffect(() => {
        const opener = document.activeElement;
        panelRef.current?.focus();
        return () => {
            if (opener instanceof HTMLElement) opener.focus();
        };
    }, []);

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === ESCAPE_KEY && onClose) onClose();
        if (e.key === TAB_KEY && panelRef.current) trapTab(e, panelRef.current);
    };

    return (
        <div className="sheet-backdrop">
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
