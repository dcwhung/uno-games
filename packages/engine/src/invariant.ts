/**
 * invariant.ts — runtime checks for guarantees the engine maintains itself.
 *
 * tsconfig enables `noUncheckedIndexedAccess`, so `items[i]` and `record[key]`
 * read as `T | undefined` even where the engine has already established the
 * value exists: an index derived from the collection's own length, a card id
 * minted into the round's own deck. A `!` silences the type *and* erases at
 * runtime, so a broken invariant resurfaces later as a confusing undefined read
 * far from its cause. These helpers keep the check and name what broke.
 *
 * They are deliberately not a `?? fallback`: substituting a value would let a
 * corrupt state keep playing and turn a logic bug into a silent wrong result.
 *
 * Lives outside core.ts because rng.ts needs it and core.ts imports rng.ts.
 */

const INVARIANT_PREFIX = 'Engine invariant violated';

/**
 * `value`, or a thrown error naming the invariant that must have held.
 * `what` should read as the guarantee, e.g. `card c17 is not in the deck`.
 */
export function invariant<T>(value: T | undefined, what: string): T {
    if (value === undefined) throw new Error(`${INVARIANT_PREFIX}: ${what}`);
    return value;
}

/** `items[index]` where the caller has already established the index is in range. */
export function elementAt<T>(items: readonly T[], index: number, what: string): T {
    return invariant(items[index], `${what} — no element at index ${index} of ${items.length}`);
}
