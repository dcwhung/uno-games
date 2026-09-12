/**
 * rng.ts — immutable seeded PRNG (mulberry32).
 *
 * Every call returns a new Rng; the engine threads it through state via
 * `GameState.seed` + `GameState.tick` so replay(seed, actions) is exact.
 */
import { elementAt } from './invariant';
import type { Rng, Seed } from './types';

const UINT32 = 0x100000000;
const MULBERRY_INCREMENT = 0x6d2b79f5;
/** Both Fisher–Yates indices are derived from the array's own length. */
const SHUFFLE_SWAP = 'Rng.shuffle swap';

function mulberry32(a: number): { value: number; next: number } {
    const t = (a + MULBERRY_INCREMENT) | 0;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return { value: ((r ^ (r >>> 14)) >>> 0) / UINT32, next: t };
}

class Mulberry implements Rng {
    constructor(private readonly state: number) {}

    next(): { readonly value: number; readonly rng: Rng } {
        const { value, next } = mulberry32(this.state);
        return { value, rng: new Mulberry(next) };
    }

    shuffle<T>(items: readonly T[]): { readonly items: readonly T[]; readonly rng: Rng } {
        const out = items.slice();
        let rng: Rng = this;
        // Fisher–Yates, deterministic.
        for (let i = out.length - 1; i > 0; i--) {
            const r = rng.next();
            rng = r.rng;
            const j = Math.floor(r.value * (i + 1));
            const atI = elementAt(out, i, SHUFFLE_SWAP);
            out[i] = elementAt(out, j, SHUFFLE_SWAP);
            out[j] = atI;
        }
        return { items: out, rng };
    }
}

export function createRng(seed: Seed): Rng {
    return new Mulberry(seed >>> 0);
}

/** Derive a per-tick rng so the reducer never has to store rng internals. */
export function rngForTick(seed: Seed, tick: number): Rng {
    return createRng((seed ^ Math.imul(tick + 1, 0x9e3779b9)) >>> 0);
}
