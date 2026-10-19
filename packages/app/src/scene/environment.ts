/**
 * environment.ts — every colour, light and geometry value for the "Lounge"
 * scene (docs/design/polish-v0.3.md §2.1 / §2.2). The DOM side reads the same
 * hex tokens from styles.css; this file mirrors them for the 3D side so the two
 * never drift apart silently.
 */
import { TABLE_RADIUS, TABLE_Y } from './constants';

// ---------------------------------------------------------------------------
// Tokens (§2.1) — hex values identical to the `--*` custom properties in styles.css.
// ---------------------------------------------------------------------------

export const BG_0 = '#0b1020';
export const BG_1 = '#04060c';
export const FELT = '#1a6a4a';
export const FELT_EDGE = '#114733';
export const WOOD = '#4a2b17';
export const WOOD_HIGHLIGHT = '#7a4a2a';
export const GOLD = '#e8c35a';
export const INK = '#101218';
export const PAPER = '#f7f5ef';

// Scene-only colours (§2.2): not CSS tokens, but still named here so no component
// carries a literal hex.
export const SKIN = '#f1c7a2';
export const CATCH_RING = '#2a7fd4';
export const SPOT_LIGHT_COLOR = '#fff2dc';
export const HEMISPHERE_SKY_COLOR = '#cfe3ff';
export const HEMISPHERE_GROUND_COLOR = '#1a1420';
export const RIM_LIGHT_COLOR = '#ffe3b8';

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export const TONE_MAPPING_EXPOSURE = 1.05;

// ---------------------------------------------------------------------------
// Lights. three r155+ uses physical light units: a spot's intensity is in candela
// and falls off with decay 2, so the value is sized for its distance to the felt
// (~6.7 units → ≈ 2 lux at the centre before tone mapping).
// ---------------------------------------------------------------------------

export type Vec3 = readonly [number, number, number];

export const SPOT_LIGHT_POSITION: Vec3 = [1.2, 6, 2.8];
export const SPOT_LIGHT_INTENSITY = 90;
export const SPOT_LIGHT_ANGLE_RAD = 0.62;
export const SPOT_LIGHT_PENUMBRA = 0.7;
export const SPOT_LIGHT_DECAY = 2;
// No SHADOW_RADIUS: <Canvas shadows> selects PCFSoftShadowMap, under which three
// documents LightShadow.radius as a no-op (S-077); the softness comes from the map size.
export const SHADOW_MAP_SIZE = 2048;
export const SHADOW_BIAS = -0.0003;
export const SHADOW_NORMAL_BIAS = 0.02;
export const SHADOW_CAMERA_NEAR = 1;
export const SHADOW_CAMERA_FAR = 20;

export const HEMISPHERE_INTENSITY = 0.55;

/** Behind the far seat, low and slightly above, so figures get a bright edge. */
export const RIM_LIGHT_POSITION: Vec3 = [0, 3, -6];
export const RIM_LIGHT_INTENSITY = 0.5;

// ---------------------------------------------------------------------------
// Table (§2.2). The felt top sits exactly at TABLE_Y; everything else hangs off it.
// ---------------------------------------------------------------------------

export const FELT_SEGMENTS = 64;
export const FELT_THICKNESS = 0.1;
export const FELT_ROUGHNESS = 0.95;
export const FELT_TEXTURE_REPEAT = 6;
export const FELT_BUMP_SCALE = 0.012;
/** Lift flat rings off the felt so they never z-fight with it. */
export const FELT_SURFACE_LIFT = 0.002;

export const FELT_EDGE_WIDTH = 0.38;
export const FELT_EDGE_OPACITY = 0.6;
export const FELT_EDGE_Y = TABLE_Y + FELT_SURFACE_LIFT;

export const INLAY_Y = TABLE_Y + FELT_SURFACE_LIFT * 2;
export const INLAY_OUTER_RADIUS = TABLE_RADIUS - 0.16;
export const INLAY_WIDTH = 0.025;
export const INLAY_SEGMENTS = 96;
export const INLAY_METALNESS = 0.7;
export const INLAY_ROUGHNESS = 0.35;
export const INLAY_EMISSIVE_INTENSITY = 0.25;

/** Torus centre line slightly outside the felt so its inner wall overlaps the felt edge. */
export const RIM_RADIUS = TABLE_RADIUS + 0.05;
export const RIM_TUBE_RADIUS = 0.12;
export const RIM_RADIAL_SEGMENTS = 24;
export const RIM_TUBULAR_SEGMENTS = 96;
export const RIM_ROUGHNESS = 0.5;
export const RIM_METALNESS = 0.05;

/** Dark wood skirt under the felt so the table has a visible thickness at wide FOV. */
export const APRON_RADIUS = TABLE_RADIUS - 0.04;
export const APRON_HEIGHT = 0.32;
export const APRON_Y = TABLE_Y - FELT_THICKNESS - APRON_HEIGHT / 2;
export const APRON_ROUGHNESS = 0.8;

// ---------------------------------------------------------------------------
// Opponent figure (§2.2). Seat positions are on the felt (y = TABLE_Y).
// ---------------------------------------------------------------------------

export const TORSO_RADIUS = 0.33;
export const TORSO_LENGTH = 0.45;
export const TORSO_Y = 0.5;
export const TORSO_CAP_SEGMENTS = 8;
export const TORSO_RADIAL_SEGMENTS = 24;
export const TORSO_ROUGHNESS = 0.7;

export const HEAD_RADIUS = 0.3;
export const HEAD_Y = 1.22;
/**
 * Lowest point of the head sphere. The opponent fan (layout.ts) must stay below
 * it so the cards never cover the face; the layout spec reads this number.
 */
export const OPPONENT_HEAD_BOTTOM_Y = HEAD_Y - HEAD_RADIUS;
export const HEAD_SEGMENTS = 32;
export const HEAD_ROUGHNESS = 0.6;

export const EYE_RADIUS = 0.035;
export const EYE_SEGMENTS = 12;
export const EYE_ROUGHNESS = 0.4;
export const EYE_SPACING_X = 0.1;
export const EYE_Y = HEAD_Y + 0.04;
/** Just proud of the head surface on the side facing the table (+z after yaw). */
export const EYE_Z = HEAD_RADIUS - 0.03;

export const CAP_RADIUS = HEAD_RADIUS + 0.015;
export const CAP_Y = HEAD_Y + 0.03;
export const CAP_SEGMENTS = 32;
/** Sphere theta sweep from the pole: 0.42π gives a short rounded skull-cap. */
export const CAP_THETA_LENGTH_RAD = Math.PI * 0.42;
export const CAP_ROUGHNESS = 0.65;

/** Catchable figures lean toward the table about their local X axis. */
export const CATCH_LEAN_RAD = 0.12;
export const LEAN_LERP_SPEED = 6;

// ---------------------------------------------------------------------------
// Floor rings
// ---------------------------------------------------------------------------

export const RING_SEGMENTS = 48;
/** Group-local (seat sits on the felt): above both felt rings so the glow is never clipped. */
export const RING_Y = FELT_SURFACE_LIFT * 3;
/** Face the ring upward: RingGeometry lies in the XY plane by default. */
export const FLAT_RING_ROTATION_RAD = -Math.PI / 2;

export const ACTIVE_RING_INNER_RADIUS = 0.5;
export const ACTIVE_RING_OUTER_RADIUS = 0.62;
export const ACTIVE_RING_OPACITY = 0.85;
export const ACTIVE_RING_BREATH_AMPLITUDE = 0.06;
export const ACTIVE_RING_BREATH_PERIOD_S = 1.2;

export const CATCH_RING_INNER_RADIUS = 0.66;
export const CATCH_RING_OUTER_RADIUS = 0.76;
export const CATCH_RING_OPACITY_MIN = 0.35;
export const CATCH_RING_OPACITY_MAX = 0.95;
export const CATCH_RING_PULSE_PERIOD_S = 0.8;

export const FULL_TURN_RAD = Math.PI * 2;

/**
 * Raised-cosine wave in [0, 1]: 0 at t = 0, 1 at half period, back to 0 at a
 * whole period. Smooth at both ends so a looping ring never visibly "ticks".
 */
function cyclicWave(tSeconds: number, periodSeconds: number): number {
    return (1 - Math.cos((FULL_TURN_RAD * tSeconds) / periodSeconds)) / 2;
}

/** Scale of the active player's floor ring: breathes 1 → 1.06 → 1 over 1.2 s. */
export function breathScale(tSeconds: number): number {
    return 1 + ACTIVE_RING_BREATH_AMPLITUDE * cyclicWave(tSeconds, ACTIVE_RING_BREATH_PERIOD_S);
}

/** Opacity of the catchable player's floor ring: pulses between min and max over 0.8 s. */
export function pulseOpacity(tSeconds: number): number {
    const range = CATCH_RING_OPACITY_MAX - CATCH_RING_OPACITY_MIN;
    return CATCH_RING_OPACITY_MIN + range * cyclicWave(tSeconds, CATCH_RING_PULSE_PERIOD_S);
}
