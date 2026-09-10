/**
 * theme/types.ts — visual layer contract for card assets.
 *
 * The engine never imports this file. Everything visual (backs, faces, palette,
 * display names) lives here so an IP swap only touches `public/assets/cards/*`
 * and `i18n/*.json`.
 */
import type { CardColor, CardFace, CardSide, VariantId } from '@uno/engine';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Physical UNO card ratio 56mm × 87mm. */
export const CARD_ASPECT_RATIO = 56 / 87;
export const CARD_WIDTH_UNITS = 0.56;   // scene units (metres-ish)
export const CARD_HEIGHT_UNITS = CARD_WIDTH_UNITS / CARD_ASPECT_RATIO;
export const CARD_CORNER_RADIUS_UNITS = 0.03;

export const ASSET_ROOT = '/assets/cards';
export const MANIFEST_FILE = 'manifest.json';
export const MANIFEST_SCHEMA_VERSION = 1;

// ---------------------------------------------------------------------------
// Texture references
// ---------------------------------------------------------------------------

export type TextureFormat = 'ktx2' | 'png' | 'webp';

export interface TextureRef {
  /** Path relative to ASSET_ROOT/<variant>/, e.g. "back.ktx2". */
  readonly file: string;
  readonly format: TextureFormat;
  /** Colour textures are sRGB; masks / roughness are linear. */
  readonly srgb: boolean;
  readonly width: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Atlas
// ---------------------------------------------------------------------------

/** Normalised UV rect in [0,1], origin bottom-left (Three.js convention). */
export interface UvRect {
  readonly u: number;
  readonly v: number;
  readonly w: number;
  readonly h: number;
}

/**
 * A regular grid atlas. Cell index → UvRect is computed, not stored,
 * so the manifest stays small and can't drift from the image.
 */
export interface AtlasGrid {
  readonly texture: TextureRef;
  readonly columns: number;
  readonly rows: number;
  /** Optional gutter in pixels to avoid bleeding at mip levels. */
  readonly paddingPx: number;
}

/**
 * How a CardFace maps to an atlas cell. Each variant provides one per side.
 * Returning `undefined` means "this face doesn't exist on this side" — a
 * theme bug that the loader surfaces at startup, not at render time.
 */
export type FaceToCell = (face: CardFace) => number | undefined;

// ---------------------------------------------------------------------------
// Card theme (runtime object, built from manifest + per-variant mapping code)
// ---------------------------------------------------------------------------

export interface SideTheme {
  readonly back: TextureRef;
  readonly faces: AtlasGrid;
  readonly faceToCell: FaceToCell;
  /** Hex colours used for UI chips, glow, colour-picker — NOT the textures. */
  readonly palette: Readonly<Record<CardColor, string>>;
  /** Colour shown for the "wild" state before a colour is chosen. */
  readonly wildAccent: string;
}

export interface CardTheme {
  readonly variant: VariantId;
  readonly displayNameKey: string;             // i18n key
  readonly sides: Readonly<Record<CardSide, SideTheme | undefined>>;
  /** Table felt / ambient tint per variant (No Mercy is darker, etc.). */
  readonly tableTint: string;
}

/** Single-sided variants set `back: undefined`. */
export type SingleSidedTheme = CardTheme & { readonly sides: { front: SideTheme; back: undefined } };
export type DoubleSidedTheme = CardTheme & { readonly sides: { front: SideTheme; back: SideTheme } };

// ---------------------------------------------------------------------------
// Manifest (static JSON on disk, one file for all variants)
// ---------------------------------------------------------------------------

export interface ManifestSide {
  readonly back: TextureRef;
  readonly faces: Omit<AtlasGrid, 'texture'> & { readonly texture: TextureRef };
  readonly palette: Readonly<Record<CardColor, string>>;
  readonly wildAccent: string;
}

export interface ManifestVariant {
  readonly displayNameKey: string;
  readonly tableTint: string;
  readonly sides: {
    readonly front: ManifestSide;
    readonly back?: ManifestSide;
  };
}

export interface CardAssetManifest {
  readonly schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  /** Build-time hash of all files, used as cache-buster + SW precache key. */
  readonly buildHash: string;
  readonly variants: Readonly<Partial<Record<VariantId, ManifestVariant>>>;
}

// ---------------------------------------------------------------------------
// Helpers (pure)
// ---------------------------------------------------------------------------

export function cellToUv(grid: Pick<AtlasGrid, 'columns' | 'rows' | 'paddingPx' | 'texture'>, cell: number): UvRect {
  const col = cell % grid.columns;
  const row = Math.floor(cell / grid.columns);
  const cellW = 1 / grid.columns;
  const cellH = 1 / grid.rows;
  const padU = grid.paddingPx / grid.texture.width;
  const padV = grid.paddingPx / grid.texture.height;
  return {
    u: col * cellW + padU,
    // Three.js UV origin is bottom-left; atlas rows are authored top-down.
    v: 1 - (row + 1) * cellH + padV,
    w: cellW - 2 * padU,
    h: cellH - 2 * padV,
  };
}

export function assetUrl(variant: VariantId, ref: TextureRef): string {
  return `${ASSET_ROOT}/${variant}/${ref.file}`;
}
