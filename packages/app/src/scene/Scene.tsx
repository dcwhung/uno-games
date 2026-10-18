import { useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store/gameStore';
import {
    CAMERA_POS,
    CAMERA_TARGET,
    FOV_LANDSCAPE,
    FOV_PORTRAIT,
    TABLE_RADIUS,
    TABLE_Y,
} from './constants';
import { TableContents } from './TableContents';

// ---------------------------------------------------------------------------
// Camera: portrait gets a wider FOV so the whole table fits.
// ---------------------------------------------------------------------------

function ResponsiveCamera() {
    const { camera, size } = useThree();
    useEffect(() => {
        const cam = camera as THREE.PerspectiveCamera;
        cam.position.set(...CAMERA_POS);
        cam.lookAt(new THREE.Vector3(...CAMERA_TARGET));
        cam.fov = size.height > size.width ? FOV_PORTRAIT : FOV_LANDSCAPE;
        cam.updateProjectionMatrix();
    }, [camera, size]);
    return null;
}

export function Scene() {
    const state = useGameStore((s) => s.state);
    return (
        <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [...CAMERA_POS], fov: FOV_PORTRAIT, near: 0.1, far: 30 }}
            onPointerMissed={() => useGameStore.getState().select(null)}
        >
            <ResponsiveCamera />
            <color attach="background" args={['#1b1b1f']} />
            <hemisphereLight args={['#ffffff', '#3d3a44', 0.7]} />
            <directionalLight
                position={[2, 6, 3]}
                intensity={1.4}
                castShadow
                shadow-mapSize={[1024, 1024]}
            />
            <mesh position={[0, TABLE_Y - 0.05, 0]} receiveShadow>
                <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS, 0.1, 10]} />
                <meshStandardMaterial color="#2f6b46" flatShading />
            </mesh>
            {state && <TableContents state={state} />}
        </Canvas>
    );
}
