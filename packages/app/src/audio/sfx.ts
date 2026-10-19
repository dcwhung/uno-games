/**
 * sfx.ts — Web Audio synthesised cues, no asset files (design §2.6).
 *
 * Every cue is a recipe: an optional filtered-noise swish plus a list of
 * enveloped oscillator notes, each with its own offset so a recipe can be a
 * melody (`win`) or a chord (`lose`). The context is created on the first
 * user gesture (`unlock`), never at import time, so autoplay policy is met.
 */
import type { Cue } from './cues';

interface Note {
    readonly freq: number;
    /** Glide target; omitted means a steady pitch. */
    readonly to?: number;
    readonly ms: number;
    readonly offsetMs: number;
    readonly wave: OscillatorType;
    readonly gain: number;
}

interface Noise {
    readonly ms: number;
    readonly filterHz: number;
    readonly gain: number;
}

interface Recipe {
    readonly noise?: Noise;
    readonly notes: readonly Note[];
}

const MS_PER_S = 1000;
/** Exponential ramps cannot reach 0; this is "silent" for all practical gains. */
const SILENT_GAIN = 0.0001;
const NOISE_SECONDS = 1;
const NOISE_FILTER_Q = 0.9;
const NO_OFFSET = 0;

const SOFT = 0.12;
const MID = 0.25;
const LOUD = 0.35;

const note = (freq: number, ms: number, overrides: Partial<Note> = {}): Note => ({
    freq,
    ms,
    offsetMs: NO_OFFSET,
    wave: 'sine',
    gain: MID,
    ...overrides,
});

// Pitches are plain Hz: C5 523, E5 659, G5 784 (fanfare); A4 440 + C5 523 (minor dyad).
const RECIPES: Readonly<Record<Cue, Recipe>> = {
    card: { noise: { ms: 90, filterHz: 2200, gain: LOUD }, notes: [] },
    draw: { noise: { ms: 130, filterHz: 900, gain: MID }, notes: [] },
    uno: { notes: [note(660, 90), note(880, 160, { offsetMs: 90 })] },
    skip: { notes: [note(400, 80, { to: 800, wave: 'square', gain: SOFT })] },
    reverse: { notes: [note(800, 80, { to: 400, wave: 'square', gain: SOFT })] },
    draw2: { notes: [note(220, 160, { to: 110, wave: 'triangle', gain: LOUD })] },
    draw4: {
        notes: [
            note(200, 240, { to: 70, wave: 'triangle', gain: LOUD }),
            note(140, 240, { to: 60, wave: 'triangle', gain: LOUD, offsetMs: 180 }),
        ],
    },
    win: {
        notes: [
            note(523, 120),
            note(659, 120, { offsetMs: 120 }),
            note(784, 260, { offsetMs: 240 }),
        ],
    },
    lose: { notes: [note(440, 320, { wave: 'triangle' }), note(523, 320, { wave: 'triangle' })] },
    tap: { notes: [note(1200, 25, { wave: 'square', gain: SOFT })] },
};

let context: AudioContext | undefined;
let noiseBuffer: AudioBuffer | undefined;
let enabled = true;

export function setEnabled(value: boolean): void {
    enabled = value;
}

function createContext(): AudioContext | undefined {
    if (typeof AudioContext === 'undefined') return undefined;
    try {
        return new AudioContext();
    } catch {
        return undefined;
    }
}

/**
 * W-082: iOS parks the context (`suspended`, or Safari's non-standard
 * `interrupted`) after a phone call, Siri or backgrounding, and never brings it
 * back on its own. Anything not running and not closed is asked to resume; a
 * refusal (no gesture yet) is swallowed because the next gesture retries.
 */
function resumeIfParked(ctx: AudioContext): void {
    if (ctx.state === 'running' || ctx.state === 'closed') return;
    try {
        void ctx.resume().catch(() => undefined);
    } catch {
        /* a context torn down by the browser can throw synchronously */
    }
}

/** Call from a user gesture: creates the context and resumes it if parked. */
export function unlock(): void {
    context ??= createContext();
    if (context) resumeIfParked(context);
}

function whiteNoise(ctx: AudioContext): AudioBuffer {
    if (noiseBuffer) return noiseBuffer;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * NOISE_SECONDS, ctx.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    noiseBuffer = buffer;
    return buffer;
}

function envelope(ctx: AudioContext, gain: number, at: number, seconds: number): GainNode {
    const node = ctx.createGain();
    node.gain.setValueAtTime(gain, at);
    node.gain.exponentialRampToValueAtTime(SILENT_GAIN, at + seconds);
    node.connect(ctx.destination);
    return node;
}

function playNote(ctx: AudioContext, step: Note, start: number): void {
    const at = start + step.offsetMs / MS_PER_S;
    const seconds = step.ms / MS_PER_S;
    const osc = ctx.createOscillator();
    osc.type = step.wave;
    osc.frequency.setValueAtTime(step.freq, at);
    if (step.to !== undefined) osc.frequency.exponentialRampToValueAtTime(step.to, at + seconds);
    osc.connect(envelope(ctx, step.gain, at, seconds));
    osc.start(at);
    osc.stop(at + seconds);
}

function playNoise(ctx: AudioContext, noise: Noise, at: number): void {
    const seconds = noise.ms / MS_PER_S;
    const source = ctx.createBufferSource();
    source.buffer = whiteNoise(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = noise.filterHz;
    filter.Q.value = NOISE_FILTER_Q;
    source.connect(filter).connect(envelope(ctx, noise.gain, at, seconds));
    source.start(at);
    source.stop(at + seconds);
}

export function play(cue: Cue): void {
    if (!enabled || !context) return;
    // Most plays follow a tap, so this is the gesture that re-arms a parked context.
    resumeIfParked(context);
    const recipe = RECIPES[cue];
    const at = context.currentTime;
    if (recipe.noise) playNoise(context, recipe.noise, at);
    for (const step of recipe.notes) playNote(context, step, at);
}
