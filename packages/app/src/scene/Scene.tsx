/**
 * Scene.tsx — the R3F canvas, camera and lighting for the lounge table
 * (polish-v0.3 §2.2). The canvas is transparent: the page's CSS gradient is the
 * single backdrop shared with the lobby overlay. Table geometry lives in
 * Table.tsx and the cards / seats in TableContents.tsx.
 */
import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import { applyCameraPose, cameraPoseFor } from './cameraPose';
import { CAMERA_FAR, CAMERA_NEAR } from './constants';
import {
    HEMISPHERE_GROUND_COLOR,
    HEMISPHERE_INTENSITY,
    HEMISPHERE_SKY_COLOR,
    RIM_LIGHT_COLOR,
    RIM_LIGHT_INTENSITY,
    RIM_LIGHT_POSITION,
    SHADOW_BIAS,
    SHADOW_CAMERA_FAR,
    SHADOW_CAMERA_NEAR,
    SHADOW_MAP_SIZE,
    SHADOW_NORMAL_BIAS,
    SPOT_LIGHT_ANGLE_RAD,
    SPOT_LIGHT_COLOR,
    SPOT_LIGHT_DECAY,
    SPOT_LIGHT_INTENSITY,
    SPOT_LIGHT_PENUMBRA,
    SPOT_LIGHT_POSITION,
    TONE_MAPPING_EXPOSURE,
} from './environment';
import { DEFAULT_VIEWPORT } from './layout';
import { Table } from './Table';
import { TableContents } from './TableContents';

// Renderer options: transparent so the CSS backdrop shows through, ACES filmic
// so the warm spot rolls off instead of clipping on the paper-white card faces.
const GL_OPTIONS = {
    alpha: true,
    antialias: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: TONE_MAPPING_EXPOSURE,
};
// The pose the canvas mounts with, before ResponsiveCamera measures the real
// aspect: the same default the layout uses, so the first frame is not arbitrary.
const INITIAL_POSE = cameraPoseFor(DEFAULT_VIEWPORT.aspect);

// ---------------------------------------------------------------------------
// Camera: the pose (position, target, FOV) follows the canvas aspect so a
// portrait phone sees every seat and the far rim (cameraPose.ts).
// ---------------------------------------------------------------------------

function ResponsiveCamera() {
    const { camera, size } = useThree();
    useEffect(() => {
        const pose = cameraPoseFor(size.width / size.height);
        applyCameraPose(camera as THREE.PerspectiveCamera, pose);
    }, [camera, size]);
    return null;
}

// ---------------------------------------------------------------------------
// Lights: warm key spot from above-front (the only shadow caster), cool
// hemisphere fill, and a low rim light from behind the far seat so the figures
// separate from the dark backdrop. The spot's default target is the world
// origin, which is the table centre.
// ---------------------------------------------------------------------------

function Lights() {
    return (
        <>
            <hemisphereLight
                args={[HEMISPHERE_SKY_COLOR, HEMISPHERE_GROUND_COLOR, HEMISPHERE_INTENSITY]}
            />
            <spotLight
                color={SPOT_LIGHT_COLOR}
                position={[...SPOT_LIGHT_POSITION]}
                intensity={SPOT_LIGHT_INTENSITY}
                angle={SPOT_LIGHT_ANGLE_RAD}
                penumbra={SPOT_LIGHT_PENUMBRA}
                decay={SPOT_LIGHT_DECAY}
                castShadow
                shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
                shadow-bias={SHADOW_BIAS}
                shadow-normalBias={SHADOW_NORMAL_BIAS}
                shadow-camera-near={SHADOW_CAMERA_NEAR}
                shadow-camera-far={SHADOW_CAMERA_FAR}
            />
            <directionalLight
                color={RIM_LIGHT_COLOR}
                position={[...RIM_LIGHT_POSITION]}
                intensity={RIM_LIGHT_INTENSITY}
            />
        </>
    );
}

export function Scene() {
    const state = useGameStore((s) => s.state);
    return (
        <Canvas
            shadows
            dpr={[1, 2]}
            gl={GL_OPTIONS}
            camera={{
                position: [...INITIAL_POSE.position],
                fov: INITIAL_POSE.fov,
                near: CAMERA_NEAR,
                far: CAMERA_FAR,
            }}
            onPointerMissed={() => useGameStore.getState().select(null)}
        >
            <ResponsiveCamera />
            <Lights />
            <Table />
            {state && <TableContents state={state} />}
        </Canvas>
    );
}
