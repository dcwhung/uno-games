/**
 * Segmented.tsx — a pill-shaped single-choice control (lobby difficulty,
 * settings toggles). The selected option's description, if any, reads below.
 */
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

export function Segmented<T extends string | number>({
    label,
    options,
    value,
    onChange,
}: SegmentedProps<T>) {
    const selected = options.find((o) => o.value === value);
    const hasDescriptions = options.some((o) => o.description !== undefined);
    return (
        <>
            <div className="segmented" role="group" aria-label={label}>
                {options.map((o) => (
                    <button
                        key={String(o.value)}
                        type="button"
                        className={o.value === value ? 'chip on' : 'chip'}
                        aria-pressed={o.value === value}
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
