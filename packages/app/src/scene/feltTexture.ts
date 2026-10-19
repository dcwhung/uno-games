/**
 * feltTexture.ts — procedural felt grain for the table top (polish-v0.3 §2.2).
 *
 * The noise is a seamless tile: two octaves of value noise on a wrapping lattice
 * plus per-pixel grain, all hashed from a seed so the result is deterministic.
 * The pure functions have no DOM dependency and are unit-tested; `feltTexture()`
 * wraps them in a canvas once and caches the three.js texture for the session.
 */
import * as THREE from 'three';
import { FELT_TEXTURE_REPEAT } from './environment';

/** Tile edge in pixels. 256² keeps generation under a millisecond on a phone. */
export const FELT_NOISE_SIZE = 256;
export const FELT_NOISE_SEED = 0x5eed;
/**
 * Darkest grain byte. The texture multiplies the felt colour, so 255 is the
 * untouched felt and anything lower is a slightly darker fibre.
 */
export const FELT_NOISE_FLOOR = 222;

const COARSE_CELLS = 8;
const FINE_CELLS = 32;
const FINE_WEIGHT = 0.5;
const GRAIN_WEIGHT = 0.6;
const TOTAL_WEIGHT = 1 + FINE_WEIGHT + GRAIN_WEIGHT;
/** Decorrelate the three layers that share one seed. */
const FINE_SALT = 0x1f1f;
const GRAIN_SALT = 0x2e2e;

const RGBA_CHANNELS = 4;
const BYTE_MAX = 255;
const UINT32_RANGE = 2 ** 32;

// Integer hash mixing constants (xxHash / murmur finalisers): arbitrary odd
// multipliers with good avalanche; any change only re-rolls the grain.
const HASH_MUL_X = 0x165667b1;
const HASH_MUL_Y = 0x27d4eb2f;
const HASH_MIX_A = 0x85ebca6b;
const HASH_MIX_B = 0xc2b2ae35;
const HASH_SHIFT_A = 15;
const HASH_SHIFT_B = 13;
const HASH_SHIFT_C = 16;

/** Deterministic hash of an integer lattice point to [0, 1). */
function hashUnit(x: number, y: number, seed: number): number {
    let h = Math.imul(x | 0, HASH_MUL_X) ^ Math.imul(y | 0, HASH_MUL_Y) ^ (seed | 0);
    h = Math.imul(h ^ (h >>> HASH_SHIFT_A), HASH_MIX_A);
    h = Math.imul(h ^ (h >>> HASH_SHIFT_B), HASH_MIX_B);
    return ((h ^ (h >>> HASH_SHIFT_C)) >>> 0) / UINT32_RANGE;
}

function smoothstep(t: number): number {
    return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function wrap(value: number, size: number): number {
    return ((value % size) + size) % size;
}

/**
 * Value noise over a `cells × cells` lattice that wraps at the tile edge, so
 * sampling at u = 1 equals u = 0 and the tile repeats without a seam.
 */
function latticeNoise(u: number, v: number, cells: number, seed: number): number {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x) % cells;
    const y0 = Math.floor(y) % cells;
    const x1 = (x0 + 1) % cells;
    const y1 = (y0 + 1) % cells;
    const tx = smoothstep(x - Math.floor(x));
    const ty = smoothstep(y - Math.floor(y));
    const top = lerp(hashUnit(x0, y0, seed), hashUnit(x1, y0, seed), tx);
    const bottom = lerp(hashUnit(x0, y1, seed), hashUnit(x1, y1, seed), tx);
    return lerp(top, bottom, ty);
}

/** Felt brightness at an integer pixel, in [0, 1]; periodic in both axes with period `size`. */
export function feltNoiseAt(px: number, py: number, size: number, seed: number): number {
    const x = wrap(px, size);
    const y = wrap(py, size);
    const u = x / size;
    const v = y / size;
    const coarse = latticeNoise(u, v, COARSE_CELLS, seed);
    const fine = latticeNoise(u, v, FINE_CELLS, seed + FINE_SALT);
    const grain = hashUnit(x, y, seed + GRAIN_SALT);
    return (coarse + fine * FINE_WEIGHT + grain * GRAIN_WEIGHT) / TOTAL_WEIGHT;
}

/**
 * RGBA bytes for a `size × size` grey tile, each pixel in [FELT_NOISE_FLOOR, 255].
 * Typed over a plain ArrayBuffer because that is what `ImageData` accepts.
 */
export function feltNoisePixels(size: number, seed: number): Uint8ClampedArray<ArrayBuffer> {
    const pixels = new Uint8ClampedArray(size * size * RGBA_CHANNELS);
    const band = BYTE_MAX - FELT_NOISE_FLOOR;
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const byte = Math.round(FELT_NOISE_FLOOR + band * feltNoiseAt(x, y, size, seed));
            const base = (y * size + x) * RGBA_CHANNELS;
            pixels[base] = byte;
            pixels[base + 1] = byte;
            pixels[base + 2] = byte;
            pixels[base + 3] = BYTE_MAX;
        }
    }
    return pixels;
}

let cached: THREE.CanvasTexture | null = null;

/** The felt grain as a repeating three.js texture; generated once per session. */
export function feltTexture(): THREE.CanvasTexture {
    if (cached) return cached;
    const canvas = document.createElement('canvas');
    canvas.width = FELT_NOISE_SIZE;
    canvas.height = FELT_NOISE_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('feltTexture: 2D canvas context unavailable');
    const pixels = feltNoisePixels(FELT_NOISE_SIZE, FELT_NOISE_SEED);
    ctx.putImageData(new ImageData(pixels, FELT_NOISE_SIZE, FELT_NOISE_SIZE), 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(FELT_TEXTURE_REPEAT, FELT_TEXTURE_REPEAT);
    texture.colorSpace = THREE.SRGBColorSpace;
    cached = texture;
    return texture;
}
