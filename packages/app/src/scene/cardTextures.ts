/**
 * cardTextures.ts — placeholder card faces drawn on a canvas at runtime.
 * Replaced by the KTX2 atlas from theme/manifest.json once Blender assets exist.
 */
import * as THREE from 'three';
import type { CardFace } from '@uno/engine';
import { CARD_BACK_ACCENT, CARD_BACK_COLOR, PALETTE } from './constants';

const TEX_W = 256;
const TEX_H = 398;
const CORNER = 22;
const INNER_INSET = 14;
const OVAL_RX = 92;
const OVAL_RY = 150;
const BIG_FONT = 'bold 150px system-ui, sans-serif';
const SMALL_FONT = 'bold 40px system-ui, sans-serif';
const ACTION_FONT = 'bold 64px system-ui, sans-serif';

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

function label(face: CardFace): { big: string; font: string } {
    switch (face.kind) {
        case 'number':
            return { big: String(face.value ?? ''), font: BIG_FONT };
        case 'skip':
            return { big: '⊘', font: BIG_FONT };
        case 'reverse':
            return { big: '⇄', font: BIG_FONT };
        case 'draw2':
            return { big: '+2', font: ACTION_FONT };
        case 'wild':
            return { big: 'W', font: ACTION_FONT };
        case 'wild_draw4':
            return { big: '+4', font: ACTION_FONT };
        default:
            return { big: face.kind, font: SMALL_FONT };
    }
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
    tex.anisotropy = 4;
    return tex;
}

export function faceTexture(face: CardFace): THREE.CanvasTexture {
    const key = `${face.color}:${face.kind}:${face.value ?? ''}`;
    const hit = cache.get(key);
    if (hit) return hit;

    const { canvas, ctx } = makeCanvas();
    const bg = PALETTE[face.color];
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, 0, 0, TEX_W, TEX_H, CORNER);
    ctx.fill();
    ctx.fillStyle = bg;
    roundedRect(
        ctx,
        INNER_INSET,
        INNER_INSET,
        TEX_W - 2 * INNER_INSET,
        TEX_H - 2 * INNER_INSET,
        CORNER - 6,
    );
    ctx.fill();

    ctx.save();
    ctx.translate(TEX_W / 2, TEX_H / 2);
    ctx.rotate(-0.45);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(0, 0, OVAL_RX, OVAL_RY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const { big, font } = label(face);
    ctx.fillStyle = face.color === 'wild' ? '#111' : bg;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(big, TEX_W / 2, TEX_H / 2 + 8);

    ctx.fillStyle = '#ffffff';
    ctx.font = SMALL_FONT;
    ctx.textAlign = 'left';
    ctx.fillText(big, 26, 50);
    ctx.save();
    ctx.translate(TEX_W - 26, TEX_H - 50);
    ctx.rotate(Math.PI);
    ctx.fillText(big, 0, 0);
    ctx.restore();

    const tex = finish(canvas);
    cache.set(key, tex);
    return tex;
}

export function backTexture(): THREE.CanvasTexture {
    const key = 'back';
    const hit = cache.get(key);
    if (hit) return hit;

    const { canvas, ctx } = makeCanvas();
    ctx.fillStyle = '#ffffff';
    roundedRect(ctx, 0, 0, TEX_W, TEX_H, CORNER);
    ctx.fill();
    ctx.fillStyle = CARD_BACK_COLOR;
    roundedRect(
        ctx,
        INNER_INSET,
        INNER_INSET,
        TEX_W - 2 * INNER_INSET,
        TEX_H - 2 * INNER_INSET,
        CORNER - 6,
    );
    ctx.fill();
    ctx.save();
    ctx.translate(TEX_W / 2, TEX_H / 2);
    ctx.rotate(-0.45);
    ctx.fillStyle = CARD_BACK_ACCENT;
    ctx.beginPath();
    ctx.ellipse(0, 0, OVAL_RX, OVAL_RY, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = ACTION_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('UNO', TEX_W / 2, TEX_H / 2);

    const tex = finish(canvas);
    cache.set(key, tex);
    return tex;
}
