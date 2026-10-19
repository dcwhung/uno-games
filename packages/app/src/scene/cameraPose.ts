/**
 * cameraPose.ts — where the scene camera sits for a given viewport aspect
 * (polish-v0.3 §2.2). Landscape keeps the v0.2 pose. A portrait view has a
 * narrow horizontal field of view, so its camera pulls back and up and looks a
 * little further down; together with the portrait seat table in constants.ts
 * every opponent figure and the far half of the rim then fit a 390 px phone.
 *
 * The pose is pure data so handFan.ts and the layout specs project through the
 * very same camera Scene.tsx renders with.
 */
import * as THREE from 'three';
import {
    CAMERA_POS,
    CAMERA_POS_PORTRAIT,
    CAMERA_TARGET,
    CAMERA_TARGET_PORTRAIT,
    FOV_LANDSCAPE,
    FOV_PORTRAIT,
} from './constants';

export interface CameraPose {
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    /** Vertical field of view in degrees. */
    readonly fov: number;
}

const LANDSCAPE_POSE: CameraPose = {
    position: CAMERA_POS,
    target: CAMERA_TARGET,
    fov: FOV_LANDSCAPE,
};

const PORTRAIT_POSE: CameraPose = {
    position: CAMERA_POS_PORTRAIT,
    target: CAMERA_TARGET_PORTRAIT,
    fov: FOV_PORTRAIT,
};

/** Portrait means strictly taller than wide; a square view takes the landscape pose. */
export function isPortrait(aspect: number): boolean {
    return aspect < 1;
}

export function cameraPoseFor(aspect: number): CameraPose {
    return isPortrait(aspect) ? PORTRAIT_POSE : LANDSCAPE_POSE;
}

/** Moves `camera` to `pose`, aims it at the target and refreshes its projection. */
export function applyCameraPose(camera: THREE.PerspectiveCamera, pose: CameraPose): void {
    camera.position.set(...pose.position);
    camera.lookAt(new THREE.Vector3(...pose.target));
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
}
