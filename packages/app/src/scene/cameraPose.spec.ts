import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
    CAMERA_FAR,
    CAMERA_NEAR,
    CAMERA_POS,
    CAMERA_POS_PORTRAIT,
    CAMERA_TARGET,
    CAMERA_TARGET_PORTRAIT,
    FOV_LANDSCAPE,
    FOV_PORTRAIT,
} from './constants';
import { applyCameraPose, cameraPoseFor, isPortrait } from './cameraPose';

const PORTRAIT_ASPECT = 390 / 844;
const LANDSCAPE_ASPECT = 844 / 390;
const DESKTOP_ASPECT = 1440 / 900;
const SQUARE_ASPECT = 1;

describe('isPortrait', () => {
    it('should be true only when the view is taller than it is wide', () => {
        expect(isPortrait(PORTRAIT_ASPECT)).toBe(true);
        expect(isPortrait(SQUARE_ASPECT)).toBe(false);
        expect(isPortrait(LANDSCAPE_ASPECT)).toBe(false);
    });
});

describe('cameraPoseFor', () => {
    it('should keep the v0.2 landscape pose for landscape and square views', () => {
        const landscape = cameraPoseFor(LANDSCAPE_ASPECT);

        expect(landscape).toEqual({
            position: CAMERA_POS,
            target: CAMERA_TARGET,
            fov: FOV_LANDSCAPE,
        });
        expect(cameraPoseFor(DESKTOP_ASPECT)).toEqual(landscape);
        expect(cameraPoseFor(SQUARE_ASPECT)).toEqual(landscape);
    });

    it('should use the portrait pose and the wide portrait FOV for a portrait view', () => {
        expect(cameraPoseFor(PORTRAIT_ASPECT)).toEqual({
            position: CAMERA_POS_PORTRAIT,
            target: CAMERA_TARGET_PORTRAIT,
            fov: FOV_PORTRAIT,
        });
    });

    it('should pull the portrait camera back and up relative to landscape', () => {
        const portrait = cameraPoseFor(PORTRAIT_ASPECT);
        const landscape = cameraPoseFor(LANDSCAPE_ASPECT);

        expect(portrait.position[1]).toBeGreaterThan(landscape.position[1]);
        expect(portrait.position[2]).toBeGreaterThan(landscape.position[2]);
        expect(portrait.fov).toBeGreaterThan(landscape.fov);
    });
});

describe('applyCameraPose', () => {
    it('should move the camera to the pose and point it at the target', () => {
        const pose = cameraPoseFor(PORTRAIT_ASPECT);
        const camera = new THREE.PerspectiveCamera(
            FOV_LANDSCAPE,
            PORTRAIT_ASPECT,
            CAMERA_NEAR,
            CAMERA_FAR,
        );

        applyCameraPose(camera, pose);

        expect(camera.position.toArray()).toEqual([...pose.position]);
        expect(camera.fov).toBe(pose.fov);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const toTarget = new THREE.Vector3(...pose.target).sub(camera.position).normalize();
        expect(forward.distanceTo(toTarget)).toBeCloseTo(0);
    });

    it('should refresh the projection matrix so the new FOV takes effect', () => {
        const camera = new THREE.PerspectiveCamera(
            FOV_LANDSCAPE,
            PORTRAIT_ASPECT,
            CAMERA_NEAR,
            CAMERA_FAR,
        );
        const before = camera.projectionMatrix.clone();

        applyCameraPose(camera, cameraPoseFor(PORTRAIT_ASPECT));

        expect(camera.projectionMatrix.equals(before)).toBe(false);
    });
});
