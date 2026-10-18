/**
 * cardShape.ts — the rounded card outline and the geometries built from it
 * (polish-v0.3 §2.3: no more black square corners). The front and back are
 * flat ShapeGeometries with UVs remapped to 0..1 so a face texture maps edge
 * to edge; the thin side wall is an extrusion whose caps are never drawn.
 */
import * as THREE from 'three';
import { CARD_CORNER_RADIUS, CARD_H, CARD_THICKNESS, CARD_W } from './constants';

/** Segments per rounded corner; enough to read as a curve at hand size. */
const CORNER_SEGMENTS = 6;

/** A rounded rectangle centred on the origin, counter-clockwise. */
export function roundedRectShape(width: number, height: number, radius: number): THREE.Shape {
    const hw = width / 2;
    const hh = height / 2;
    const r = Math.min(radius, hw, hh);
    const shape = new THREE.Shape();
    shape.moveTo(-hw + r, -hh);
    shape.lineTo(hw - r, -hh);
    shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(hw, hh - r);
    shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-hw + r, hh);
    shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-hw, -hh + r);
    shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);
    shape.closePath();
    return shape;
}

/**
 * ShapeGeometry writes the vertex xy as its UVs; squash them into the unit
 * square so a texture drawn for the whole card lands on the whole card.
 */
export function remapUvsToUnit(
    geometry: THREE.BufferGeometry,
    width: number,
    height: number,
): void {
    const uv = geometry.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv.getX(i) / width + 0.5, uv.getY(i) / height + 0.5);
    }
    uv.needsUpdate = true;
}

/** Flat rounded card face in the xy plane, textured 0..1, normal +z. */
export function cardFaceGeometry(): THREE.ShapeGeometry {
    const geometry = new THREE.ShapeGeometry(
        roundedRectShape(CARD_W, CARD_H, CARD_CORNER_RADIUS),
        CORNER_SEGMENTS,
    );
    remapUvsToUnit(geometry, CARD_W, CARD_H);
    return geometry;
}

/**
 * The card's side wall: an extrusion centred on z = 0. Material index 0 is the
 * caps (left undrawn by the mesh), index 1 is the wall.
 */
export function cardEdgeGeometry(): THREE.ExtrudeGeometry {
    const geometry = new THREE.ExtrudeGeometry(
        roundedRectShape(CARD_W, CARD_H, CARD_CORNER_RADIUS),
        { depth: CARD_THICKNESS, bevelEnabled: false, curveSegments: CORNER_SEGMENTS },
    );
    geometry.translate(0, 0, -CARD_THICKNESS / 2);
    return geometry;
}

/** A larger rounded plane behind a selected card that reads as a rim glow. */
export function cardGlowGeometry(scale: number): THREE.ShapeGeometry {
    return new THREE.ShapeGeometry(
        roundedRectShape(CARD_W * scale, CARD_H * scale, CARD_CORNER_RADIUS * scale),
        CORNER_SEGMENTS,
    );
}
