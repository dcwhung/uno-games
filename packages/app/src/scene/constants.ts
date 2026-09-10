import type { CardColor } from '@uno/engine';

// Card geometry (scene units ≈ metres). Physical UNO card is 56 × 87 mm.
export const CARD_W = 0.56;
export const CARD_H = 0.87;
export const CARD_THICKNESS = 0.006;

// Table
export const TABLE_RADIUS = 2.3;
export const TABLE_Y = 0;

// Piles
export const DRAW_PILE_POS: readonly [number, number, number] = [-0.45, TABLE_Y, -0.4];
export const DISCARD_PILE_POS: readonly [number, number, number] = [0.45, TABLE_Y, -0.4];
export const PILE_VISIBLE_CARDS = 6;

// First-person hand (in front of the camera, lower part of the view)
export const HAND_CENTER: readonly [number, number, number] = [0, 0.75, 1.25];
export const HAND_CARD_SCALE = 0.62;
export const HAND_FAN_RADIUS = 1.35;
export const HAND_MAX_SPREAD_RAD = 0.9;
export const HAND_CARD_ANGLE_RAD = 0.13;
export const HAND_TILT_RAD = -0.8;      // lean the fan back toward the camera
export const HAND_RAISE_Y = 0.22;
export const HAND_HOVER_DIM = 0.55;      // brightness of unplayable cards

// Opponents
export const OPPONENT_SEATS: Readonly<Record<number, readonly (readonly [number, number, number])[]>> = {
  1: [[0, 0, -1.9]],
  2: [[-1.2, 0, -1.5], [1.2, 0, -1.5]],
  3: [[-1.45, 0, -0.9], [0, 0, -1.9], [1.45, 0, -0.9]],
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
export const LERP_SPEED = 9;          // higher = snappier
export const SWIPE_UP_PX = 40;

export const PALETTE: Readonly<Record<CardColor | 'wild', string>> = {
  red: '#e0413a',
  yellow: '#f5c400',
  green: '#3aa655',
  blue: '#2a7fd4',
  wild: '#222226',
};
export const CARD_BACK_COLOR = '#1c1c22';
export const CARD_BACK_ACCENT = '#d3302b';
export const SEAT_COLORS = ['#f3a5b7', '#9fd8c8', '#f6d78c'] as const;
