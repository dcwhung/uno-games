/**
 * cardGlyphs.ts — card symbols drawn as canvas shapes, not font glyphs
 * (polish-v0.3 §2.3). One entry point, `drawGlyph`, renders the symbol for a
 * face at a given centre and size; the same routine draws the big centre
 * symbol and the small corner indices, so they always match.
 */
import type { CardFace } from '@uno/engine';
import { CARD_INK, PALETTE } from './constants';

export interface GlyphStyle {
    /** Centre of the glyph box on the canvas. */
    readonly x: number;
    readonly y: number;
    /** Height of the glyph box in canvas px; every shape scales from it. */
    readonly size: number;
    /** Main ink of the glyph. */
    readonly color: string;
    /** Contrast colour used to separate overlapping shapes. */
    readonly border: string;
    /** Draw the dark drop shadow under numerals (centre glyph only). */
    readonly shadow: boolean;
}

export const HEAVY_FONT = (px: number): string =>
    `900 ${px}px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`;
const SHADOW_COLOR = 'rgba(16, 18, 24, 0.4)';
/** Drop shadow offset as a fraction of the glyph size (6 px at the 300 px centre numeral). */
const SHADOW_OFFSET = 0.02;
/** Tilt shared by the card oval and the wild quadrant oval. */
export const OVAL_TILT_RAD = (-25 * Math.PI) / 180;

const SKIP_RADIUS = 0.38;
const SKIP_LINE = 0.11;
const SKIP_BAR = 0.7;

const REVERSE_RADIUS = 0.34;
const REVERSE_LINE = 0.1;
const REVERSE_HEAD = 0.2;
/** Half width of an arrow head as a fraction of its length. */
const ARROW_HEAD_HALF_WIDTH = 0.75;
const REVERSE_ARC_START = (-150 * Math.PI) / 180;
const REVERSE_ARC_END = (-30 * Math.PI) / 180;

const DRAW2_W = 0.5;
const DRAW2_H = 0.74;
const DRAW2_OFFSET = 0.17;
const DRAW2_RADIUS = 0.06;
const DRAW2_BORDER = 0.035;

const WILD_RX = 0.3;
const WILD_RY = 0.46;
const WILD_RIM = 0.03;

const DRAW4_W = 0.26;
const DRAW4_H = 0.38;
const DRAW4_PIVOT = 0.95;
const DRAW4_RISE = 0.18;
const DRAW4_FAN_RAD = 0.3;
const DRAW4_LABEL = 0.4;
const DRAW4_LABEL_Y = 0.42;
const DRAW4_ORDER = ['green', 'blue', 'red', 'yellow'] as const;
const WILD_QUADRANTS = ['red', 'blue', 'yellow', 'green'] as const;

export function roundedRectPath(
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

/** Heavy centred text; `shadow` adds the dark drop shadow behind it. */
function drawHeavyText(
    ctx: CanvasRenderingContext2D,
    text: string,
    style: GlyphStyle,
    px: number,
    dy: number,
): void {
    ctx.save();
    ctx.font = HEAVY_FONT(px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (style.shadow) {
        const off = style.size * SHADOW_OFFSET;
        ctx.fillStyle = SHADOW_COLOR;
        ctx.fillText(text, style.x + off, style.y + dy + off);
    }
    ctx.fillStyle = style.color;
    ctx.fillText(text, style.x, style.y + dy);
    ctx.restore();
}

function drawNumber(ctx: CanvasRenderingContext2D, value: number, style: GlyphStyle): void {
    drawHeavyText(ctx, String(value), style, style.size, 0);
}

/** Circle with a diagonal bar: the "no entry" skip sign. */
function drawSkip(ctx: CanvasRenderingContext2D, style: GlyphStyle): void {
    const r = style.size * SKIP_RADIUS;
    const bar = r * SKIP_BAR;
    ctx.save();
    ctx.translate(style.x, style.y);
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.size * SKIP_LINE;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-bar, -bar);
    ctx.lineTo(bar, bar);
    ctx.stroke();
    ctx.restore();
}

/** One curved arrow: an arc with a filled head pointing along its end tangent. */
function drawCurvedArrow(
    ctx: CanvasRenderingContext2D,
    r: number,
    start: number,
    end: number,
    head: number,
): void {
    ctx.beginPath();
    ctx.arc(0, 0, r, start, end, false);
    ctx.stroke();
    const tipX = Math.cos(end) * r;
    const tipY = Math.sin(end) * r;
    // Tangent of a clockwise (increasing-angle) arc at `end`.
    const tx = -Math.sin(end);
    const ty = Math.cos(end);
    ctx.beginPath();
    ctx.moveTo(tipX + tx * head, tipY + ty * head);
    const halfWidth = head * ARROW_HEAD_HALF_WIDTH;
    ctx.lineTo(tipX - ty * halfWidth, tipY + tx * halfWidth);
    ctx.lineTo(tipX + ty * halfWidth, tipY - tx * halfWidth);
    ctx.closePath();
    ctx.fill();
}

/** Two curved arrows chasing each other around a circle. */
function drawReverse(ctx: CanvasRenderingContext2D, style: GlyphStyle): void {
    const r = style.size * REVERSE_RADIUS;
    const head = style.size * REVERSE_HEAD;
    ctx.save();
    ctx.translate(style.x, style.y);
    ctx.strokeStyle = style.color;
    ctx.fillStyle = style.color;
    ctx.lineWidth = style.size * REVERSE_LINE;
    ctx.lineCap = 'round';
    drawCurvedArrow(ctx, r, REVERSE_ARC_START, REVERSE_ARC_END, head);
    ctx.rotate(Math.PI);
    drawCurvedArrow(ctx, r, REVERSE_ARC_START, REVERSE_ARC_END, head);
    ctx.restore();
}

/** A small filled card with a contrasting border, centred on (x, y) and rotated. */
function drawMiniCard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    rotation: number,
    fill: string,
    border: string,
    borderWidth: number,
): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    roundedRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * DRAW2_RADIUS);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = borderWidth;
    ctx.strokeStyle = border;
    ctx.stroke();
    ctx.restore();
}

/** Two overlapping card rectangles. */
function drawDraw2(ctx: CanvasRenderingContext2D, style: GlyphStyle): void {
    const w = style.size * DRAW2_W;
    const h = style.size * DRAW2_H;
    const off = style.size * DRAW2_OFFSET;
    const border = style.size * DRAW2_BORDER;
    drawMiniCard(ctx, style.x + off, style.y - off, w, h, 0, style.color, style.border, border);
    drawMiniCard(ctx, style.x - off, style.y + off, w, h, 0, style.color, style.border, border);
}

/** A tilted oval split into four colour quadrants with a thin rim. */
function drawWild(ctx: CanvasRenderingContext2D, style: GlyphStyle): void {
    const rx = style.size * WILD_RX;
    const ry = style.size * WILD_RY;
    const reach = Math.max(rx, ry) * 2;
    ctx.save();
    ctx.translate(style.x, style.y);
    ctx.rotate(OVAL_TILT_RAD);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    WILD_QUADRANTS.forEach((color, i) => {
        const sx = i % 2 === 0 ? -reach : 0;
        const sy = i < 2 ? -reach : 0;
        ctx.fillStyle = PALETTE[color];
        ctx.fillRect(sx, sy, reach, reach);
    });
    ctx.lineWidth = style.size * WILD_RIM * 2;
    ctx.strokeStyle = style.border;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

/** Four small colour cards fanned from a pivot below, with "+4" beneath. */
function drawWildDraw4(ctx: CanvasRenderingContext2D, style: GlyphStyle): void {
    const w = style.size * DRAW4_W;
    const h = style.size * DRAW4_H;
    const pivotY = style.y + style.size * DRAW4_PIVOT - style.size * DRAW4_RISE;
    const rise = style.size * DRAW4_PIVOT;
    const border = style.size * DRAW2_BORDER;
    DRAW4_ORDER.forEach((color, i) => {
        const rot = (i - (DRAW4_ORDER.length - 1) / 2) * DRAW4_FAN_RAD;
        const x = style.x + Math.sin(rot) * rise;
        const y = pivotY - Math.cos(rot) * rise;
        drawMiniCard(ctx, x, y, w, h, rot, PALETTE[color], style.border, border);
    });
    const label = { ...style, shadow: false };
    drawHeavyText(ctx, '+4', label, style.size * DRAW4_LABEL, style.size * DRAW4_LABEL_Y);
}

/** Draws the symbol for `face` centred on the style's (x, y). */
export function drawGlyph(ctx: CanvasRenderingContext2D, face: CardFace, style: GlyphStyle): void {
    switch (face.kind) {
        case 'number':
            return drawNumber(ctx, face.value ?? 0, style);
        case 'skip':
            return drawSkip(ctx, style);
        case 'reverse':
            return drawReverse(ctx, style);
        case 'draw2':
            return drawDraw2(ctx, style);
        case 'wild':
            return drawWild(ctx, style);
        case 'wild_draw4':
            return drawWildDraw4(ctx, style);
        default:
            // Variant kinds without art yet: name them rather than render nothing.
            return drawHeavyText(ctx, face.kind, { ...style, color: CARD_INK }, style.size / 4, 0);
    }
}
