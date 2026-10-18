import type { CardColor } from '@uno/engine';

// Card geometry (scene units ≈ metres). Physical UNO card is 56 × 87 mm.
export const CARD_W = 0.56;
export const CARD_H = 0.87;
export const CARD_THICKNESS = 0.006;
/** Corner radius of the rounded card outline (scene units); ~3.5 mm on a real card. */
export const CARD_CORNER_RADIUS = 0.035;

// Table
export const TABLE_RADIUS = 2.3;
export const TABLE_Y = 0;

// Piles
export const DRAW_PILE_POS: readonly [number, number, number] = [-0.45, TABLE_Y, -0.4];
export const DISCARD_PILE_POS: readonly [number, number, number] = [0.45, TABLE_Y, -0.4];
export const PILE_VISIBLE_CARDS = 6;

// First-person hand (in front of the camera, lower part of the view).
// Raised in v0.3 so the fan's lowest point clears the bottom HAND_VIEW_CLEAR_FRACTION
// of the view, where the HUD action column lives (polish-v0.3 §2.3 / §2.4). Landscape
// uses a narrower vertical FOV, so its fan centre sits higher still.
export const HAND_CENTER: readonly [number, number, number] = [0, 0.85, 1.25];
export const HAND_CENTER_RAISE_LANDSCAPE = 0.35;
export const HAND_CARD_SCALE = 0.62;
export const HAND_FAN_RADIUS = 1.35;
export const HAND_MAX_SPREAD_RAD = 0.9;
export const HAND_CARD_ANGLE_RAD = 0.13;
export const HAND_TILT_RAD = -0.8; // lean the fan back toward the camera
export const HAND_RAISE_Y = 0.22;
export const HAND_HOVER_DIM = 0.55; // brightness of unplayable cards
/** Legal cards float this far in front of the fan plane; illegal cards sink the same amount. */
export const HAND_LEGAL_LIFT = 0.03;
/** Selected card scale relative to the resting hand scale. */
export const HAND_SELECTED_SCALE = 1.08;
// Portrait fan: a tighter arc with more overlap so an 18-card hand fits a 390 px view.
export const HAND_CARD_SCALE_PORTRAIT = 0.56;
export const HAND_FAN_RADIUS_PORTRAIT = 1.0;
export const HAND_CARD_ANGLE_PORTRAIT_RAD = 0.11;
/** Fraction of the view half-width kept free on each side of the portrait fan. */
export const HAND_VIEW_MARGIN = 0.06;
/** The fan must stay above this fraction of the view height (bottom edge upward). */
export const HAND_VIEW_CLEAR_FRACTION = 0.12;

// Opponents
export type SeatPosition = readonly [number, number, number];
export type SeatTable = readonly SeatPosition[];

/**
 * Seat table for a count with no layout of its own. Named (W-009) so the
 * fallback in `seatPositions` is a real constant rather than an asserted lookup
 * back into the record it is falling back from.
 */
export const DEFAULT_SEAT_TABLE: SeatTable = [
    [-1.45, 0, -0.9],
    [0, 0, -1.9],
    [1.45, 0, -0.9],
];

export const OPPONENT_SEATS: Readonly<Record<number, SeatTable>> = {
    1: [[0, 0, -1.9]],
    2: [
        [-1.2, 0, -1.5],
        [1.2, 0, -1.5],
    ],
    3: DEFAULT_SEAT_TABLE,
};
export const OPPONENT_HAND_HEIGHT = 0.95;
export const OPPONENT_CARD_SCALE = 0.8;
export const OPPONENT_FAN_ANGLE_RAD = 0.09;
export const OPPONENT_FAN_MAX_RAD = 0.9;

// Camera
export const CAMERA_POS: readonly [number, number, number] = [0, 2.9, 2.7];
export const CAMERA_TARGET: readonly [number, number, number] = [0, 0.15, -0.35];
export const FOV_PORTRAIT = 62;
export const FOV_LANDSCAPE = 44;

// Motion
export const LERP_SPEED = 9; // higher = snappier
export const SWIPE_UP_PX = 40;
/** A target jump longer than this (play / draw / deal) flies along an arc instead of lerping. */
export const LONG_MOVE_DISTANCE = 0.45;
export const ARC_DURATION_MS = 420;
export const ARC_LIFT_MAX = 0.35;
/** Scale a card lands with before the lerp settles it to 1.0. */
export const SETTLE_SCALE_FROM = 0.9;
export const DEAL_STAGGER_MS = 45;
/** Selected-card rim glow: plane size relative to the card, and its peak opacity. */
export const GLOW_SCALE = 1.12;
export const GLOW_OPACITY = 0.45;

// Card palette: mirrors the --card-* / --paper / --ink / --gold tokens in styles.css
// (polish-v0.3 §2.1). Keep both in step.
export const PALETTE: Readonly<Record<CardColor | 'wild', string>> = {
    red: '#e5322d',
    yellow: '#f7c500',
    green: '#2fa84f',
    blue: '#1f78d1',
    wild: '#101218',
};
export const CARD_PAPER = '#f7f5ef';
export const CARD_INK = '#101218';
export const CARD_GOLD = '#e8c35a';
export const CARD_BACK_COLOR = CARD_INK;
export const CARD_BACK_ACCENT = PALETTE.red;
export const SEAT_COLORS = ['#f3a5b7', '#9fd8c8', '#f6d78c'] as const;
