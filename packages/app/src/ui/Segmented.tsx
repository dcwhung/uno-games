/**
 * Segmented.tsx — a pill-shaped single-choice control (lobby difficulty,
 * settings toggles). Exposed as a radiogroup with a roving tabindex: one tab
 * stop, arrow keys move the choice (S-092). The selected option's
 * description, if any, reads below.
 */
import type { KeyboardEvent } from 'react';

import { NOT_FOUND, stepIndex } from './segmented';

export interface SegmentedOption<T> {
    readonly value: T;
    readonly label: string;
    readonly description?: string;
}

interface SegmentedProps<T> {
    readonly label: string;
    readonly options: readonly SegmentedOption<T>[];
    readonly value: T;
    readonly onChange: (value: T) => void;
}

const FIRST = 0;

/** Arrow keys move the choice and the focus together, like native radios. */
function onArrowKey<T>(
    e: KeyboardEvent<HTMLDivElement>,
    options: readonly SegmentedOption<T>[],
    selectedIndex: number,
    onChange: (value: T) => void,
): void {
    const next = stepIndex(options.length, selectedIndex, e.key);
    const option = next === undefined ? undefined : options[next];
    if (next === undefined || !option) return;
    e.preventDefault();
    onChange(option.value);
    const radio = e.currentTarget.children[next];
    if (radio instanceof HTMLElement) radio.focus();
}

export function Segmented<T extends string | number>({
    label,
    options,
    value,
    onChange,
}: SegmentedProps<T>) {
    const selectedIndex = options.findIndex((o) => o.value === value);
    const selected = options[selectedIndex];
    const hasDescriptions = options.some((o) => o.description !== undefined);
    const tabStop = selectedIndex === NOT_FOUND ? FIRST : selectedIndex;

    return (
        <>
            <div
                className="segmented"
                role="radiogroup"
                aria-label={label}
                onKeyDown={(e) => onArrowKey(e, options, selectedIndex, onChange)}
            >
                {options.map((o, i) => (
                    <button
                        key={String(o.value)}
                        type="button"
                        role="radio"
                        className={i === selectedIndex ? 'chip on' : 'chip'}
                        aria-checked={i === selectedIndex}
                        tabIndex={i === tabStop ? 0 : -1}
                        onClick={() => onChange(o.value)}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
            {hasDescriptions && (
                <p className="segmented-desc" aria-live="polite">
                    {selected?.description}
                </p>
            )}
        </>
    );
}
