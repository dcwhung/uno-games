/**
 * cardTextures.ts — card faces and the card back drawn on a canvas at runtime
 * (polish-v0.3 §2.3). Paper frame, colour fill with a radial lighten, a tilted
 * white oval with an inner shadow, and shape-drawn glyphs from cardGlyphs.ts.
 * The geometry is rounded, so the canvas is painted edge to edge.
 * Replaced by the KTX2 atlas from theme/manifest.json once Blender assets exist.
 */
import * as THREE from 'three';
import type { CardFace } from '@uno/engine';
import { drawGlyph, OVAL_TILT_RAD } from './cardGlyphs';
import type { GlyphStyle } from './cardGlyphs';
import { CARD_BACK_ACCENT, CARD_BACK_COLOR, CARD_INK, CARD_PAPER, PALETTE } from './constants';

const TEX_W = 512;
const TEX_H = 796;
const FRAME = 20;
const FILL_RADIUS = 14;
const OVAL_RX = 186;
const OVAL_RY = 300;
const OVAL_SHADOW = 'rgba(16, 18, 24, 0.22)';
const OVAL_SHADOW_WIDTH = 6;
const OVAL_SHADOW_DROP = 2;
const LIGHTEN_CENTER_X = 0.3;
const LIGHTEN_CENTER_Y = 0.25;
const LIGHTEN_RADIUS = 0.9;
const LIGHTEN_ALPHA = 0.22;
const CENTER_NUMERAL_SIZE = 300;
const CENTER_SHAPE_SIZE = 260;
const CENTER_DROP = 6;
const CORNER_SIZE = 84;
const CORNER_X = 62;
const CORNER_Y = 92;
const WORDMARK = 'UNO';
const WORDMARK_SIZE = 150;
const WORDMARK_SHADOW = 'rgba(16, 18, 24, 0.5)';
const WORDMARK_DROP = 5;
const BACK_LINE = 'rgba(247, 245, 239, 0.06)';
const BACK_LINE_WIDTH = 3;
const BACK_LINE_STEP = 26;
const TEXTURE_ANISOTROPY = 4;

const cache = new Map<string, THREE.CanvasTexture>();

function roundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    return { canvas, ctx };
}

function finish(canvas: HTMLCanvasElement): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = TEXTURE_ANISOTROPY;
    return tex;
}

/** Paper border, then the inner fill area (left as the current path for clipping). */
function drawFrame(ctx: CanvasRenderingContext2D, fill: string): void {
    ctx.fillStyle = CARD_PAPER;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    roundedRect(ctx, FRAME, FRAME, TEX_W - 2 * FRAME, TEX_H - 2 * FRAME, FILL_RADIUS);
    ctx.fillStyle = fill;
    ctx.fill();
}

/** Soft radial lighten at the top-left so the flat colour reads as lit paper. */
function drawLighten(ctx: CanvasRenderingContext2D): void {
    const cx = TEX_W * LIGHTEN_CENTER_X;
    const cy = TEX_H * LIGHTEN_CENTER_Y;
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, TEX_W * LIGHTEN_RADIUS);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${LIGHTEN_ALPHA})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.save();
    roundedRect(ctx, FRAME, FRAME, TEX_W - 2 * FRAME, TEX_H - 2 * FRAME, FILL_RADIUS);
    ctx.clip();
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    ctx.restore();
}

function ovalPath(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.ellipse(0, 0, OVAL_RX, OVAL_RY, 0, 0, Math.PI * 2);
}

/** The tilted centre oval with a 2 px inner shadow along its upper edge. */
function drawOval(ctx: CanvasRenderingContext2D, fill: string, innerShadow: boolean): void {
    ctx.save();
    ctx.translate(TEX_W / 2, TEX_H / 2);
    ctx.rotate(OVAL_TILT_RAD);
    ovalPath(ctx);
    ctx.fillStyle = fill;
    ctx.fill();
    if (innerShadow) {
        ctx.clip();
        ctx.translate(0, OVAL_SHADOW_DROP);
        ovalPath(ctx);
        ctx.lineWidth = OVAL_SHADOW_WIDTH;
        ctx.strokeStyle = OVAL_SHADOW;
        ctx.stroke();
    }
    ctx.restore();
}

/** Centre glyph on the oval plus the two corner indices on the colour fill. */
function drawIndices(ctx: CanvasRenderingContext2D, face: CardFace, color: string): void {
    const isNumber = face.kind === 'number';
    const centre: GlyphStyle = {
        x: TEX_W / 2,
        y: TEX_H / 2 + CENTER_DROP,
        size: isNumber ? CENTER_NUMERAL_SIZE : CENTER_SHAPE_SIZE,
        color,
        border: CARD_PAPER,
        shadow: isNumber,
    };
    drawGlyph(ctx, face, centre);
    const corner: GlyphStyle = {
        x: CORNER_X,
        y: CORNER_Y,
        size: CORNER_SIZE,
        color: CARD_PAPER,
        border: color,
        shadow: false,
    };
    drawGlyph(ctx, face, corner);
    ctx.save();
    ctx.translate(TEX_W, TEX_H);
    ctx.rotate(Math.PI);
    drawGlyph(ctx, face, corner);
    ctx.restore();
}

export function faceTexture(face: CardFace): THREE.CanvasTexture {
    const key = `${face.color}:${face.kind}:${face.value ?? ''}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const { canvas, ctx } = makeCanvas();
    const fill = PALETTE[face.color];
    drawFrame(ctx, fill);
    drawLighten(ctx);
    drawOval(ctx, CARD_PAPER, true);
    // The wild glyph paints its own four-colour oval; its ink is the card ink.
    drawIndices(ctx, face, face.color === 'wild' ? CARD_INK : fill);

    const tex = finish(canvas);
    cache.set(key, tex);
    return tex;
}

/** Faint diagonal hatching so a stack of backs reads as many cards. */
function drawBackPattern(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    roundedRect(ctx, FRAME, FRAME, TEX_W - 2 * FRAME, TEX_H - 2 * FRAME, FILL_RADIUS);
    ctx.clip();
    ctx.strokeStyle = BACK_LINE;
    ctx.lineWidth = BACK_LINE_WIDTH;
    ctx.beginPath();
    for (let x = -TEX_H; x < TEX_W + TEX_H; x += BACK_LINE_STEP) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x + TEX_H, TEX_H);
    }
    ctx.stroke();
    ctx.restore();
}

function drawWordmark(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.translate(TEX_W / 2, TEX_H / 2);
    ctx.rotate(OVAL_TILT_RAD);
    ctx.font = `900 ${WORDMARK_SIZE}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = WORDMARK_SHADOW;
    ctx.fillText(WORDMARK, WORDMARK_DROP, WORDMARK_DROP);
    ctx.fillStyle = CARD_PAPER;
    ctx.fillText(WORDMARK, 0, 0);
    ctx.restore();
}

export function backTexture(): THREE.CanvasTexture {
    const key = 'back';
    const hit = cache.get(key);
    if (hit) return hit;

    const { canvas, ctx } = makeCanvas();
    drawFrame(ctx, CARD_BACK_COLOR);
    drawBackPattern(ctx);
    drawOval(ctx, CARD_BACK_ACCENT, true);
    drawWordmark(ctx);

    const tex = finish(canvas);
    cache.set(key, tex);
    return tex;
}
