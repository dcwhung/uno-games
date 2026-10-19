/**
 * sfx.spec.ts — the context lifecycle (W-082) and the recipe → node wiring,
 * driven through a fake AudioContext whose `state` moves suspended → running
 * on `resume()`, the way iOS parks and re-arms a real one.
 *
 * `sfx.ts` keeps its context in module scope, so every test re-imports a
 * fresh module after stubbing the global.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sfx = typeof import('./sfx');

const NO_AUDIO = undefined;
const ONE_CONTEXT = 1;
const WIN_NOTE_COUNT = 3;
const SAMPLE_RATE = 8000;

class FakeParam {
    value = 0;
    setValueAtTime = vi.fn();
    exponentialRampToValueAtTime = vi.fn();
}

class FakeNode {
    type = '';
    buffer: unknown = null;
    gain = new FakeParam();
    frequency = new FakeParam();
    Q = new FakeParam();
    connect = vi.fn((target: FakeNode) => target);
    start = vi.fn();
    stop = vi.fn();
}

class FakeAudioContext {
    static instances: FakeAudioContext[] = [];
    state: AudioContextState = 'suspended';
    currentTime = 0;
    sampleRate = SAMPLE_RATE;
    destination = new FakeNode();
    resumeCalls = 0;
    oscillators = 0;
    bufferSources = 0;
    /** When set, `resume()` refuses the way a browser does without a gesture. */
    refuseResume = false;

    constructor() {
        FakeAudioContext.instances.push(this);
    }
    resume(): Promise<void> {
        this.resumeCalls += 1;
        if (this.refuseResume) return Promise.reject(new Error('not allowed'));
        this.state = 'running';
        return Promise.resolve();
    }
    createBuffer(_channels: number, length: number): { getChannelData(): Float32Array } {
        return { getChannelData: () => new Float32Array(length) };
    }
    createGain(): FakeNode {
        return new FakeNode();
    }
    createOscillator(): FakeNode {
        this.oscillators += 1;
        return new FakeNode();
    }
    createBufferSource(): FakeNode {
        this.bufferSources += 1;
        return new FakeNode();
    }
    createBiquadFilter(): FakeNode {
        return new FakeNode();
    }
}

function lastContext(): FakeAudioContext {
    const ctx = FakeAudioContext.instances.at(-1);
    if (!ctx) throw new Error('no AudioContext was created');
    return ctx;
}

async function freshSfx(): Promise<Sfx> {
    vi.resetModules();
    return import('./sfx');
}

describe('sfx', () => {
    beforeEach(() => {
        FakeAudioContext.instances = [];
        vi.stubGlobal('AudioContext', FakeAudioContext);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe('unlock', () => {
        it('should create one context and resume it from suspended', async () => {
            const sfx = await freshSfx();

            sfx.unlock();
            sfx.unlock();

            expect(FakeAudioContext.instances).toHaveLength(ONE_CONTEXT);
            expect(lastContext().state).toBe('running');
        });

        it('should be a no-op where the Web Audio API is missing', async () => {
            vi.stubGlobal('AudioContext', NO_AUDIO);
            const sfx = await freshSfx();

            expect(() => sfx.unlock()).not.toThrow();
            expect(() => sfx.play('card')).not.toThrow();
        });
    });

    describe('play', () => {
        it('should stay silent before the first gesture unlocks the context', async () => {
            const sfx = await freshSfx();

            sfx.play('card');

            expect(FakeAudioContext.instances).toHaveLength(0);
        });

        it('should resume a context that iOS parked after the unlock', async () => {
            // W-082: a phone call or backgrounding moves the context back to
            // suspended; the next gesture-driven play must re-arm it.
            const sfx = await freshSfx();
            sfx.unlock();
            const ctx = lastContext();
            ctx.state = 'suspended';

            sfx.play('card');

            expect(ctx.state).toBe('running');
            expect(ctx.bufferSources).toBe(1);
        });

        it('should not call resume on a running context', async () => {
            const sfx = await freshSfx();
            sfx.unlock();
            const ctx = lastContext();
            const afterUnlock = ctx.resumeCalls;

            sfx.play('card');

            expect(ctx.resumeCalls).toBe(afterUnlock);
        });

        it('should swallow a refused resume instead of rejecting unhandled', async () => {
            const sfx = await freshSfx();
            sfx.unlock();
            const ctx = lastContext();
            ctx.state = 'suspended';
            ctx.refuseResume = true;

            expect(() => sfx.play('card')).not.toThrow();
            await Promise.resolve();
            expect(ctx.resumeCalls).toBeGreaterThan(0);
        });

        it('should schedule nothing while sound is off', async () => {
            const sfx = await freshSfx();
            sfx.unlock();
            sfx.setEnabled(false);

            sfx.play('win');

            expect(lastContext().oscillators).toBe(0);
        });

        it('should start one oscillator per note of the recipe', async () => {
            const sfx = await freshSfx();
            sfx.unlock();

            sfx.play('win');

            expect(lastContext().oscillators).toBe(WIN_NOTE_COUNT);
        });
    });
});
