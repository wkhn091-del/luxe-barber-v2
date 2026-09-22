import { Component, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useAnimations, useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import * as THREE from 'three';

/**
 * ===========================================================================
 *  The barber, in 3D — any .glb / .gltf, dropped into the hero scene
 * ===========================================================================
 *
 * Whatever made the model — a phone scan, an AI image-to-3D tool, Blender —
 * it arrives at an arbitrary size, facing an arbitrary way, with its origin
 * anywhere. This normalises it: centred where the barber pole stands, scaled
 * to the pole's height, so swapping the pole for the barber changes nothing
 * else in the scene — the lighting, the parallax and the scroll all carry on.
 *
 *   - Compressed files just work. Draco decoders are served from /draco (no
 *     third-party CDN, so the PWA and the CSP stay self-contained); Meshopt
 *     is built in.
 *   - A model that carries animations plays its first one (an idle loop from
 *     Mixamo, say). A static scan gets a slow turntable instead.
 *   - Loading or failing never leaves a hole: until the file is ready, and if
 *     it cannot load at all, the barber pole stands in (see HeroScene.jsx).
 *
 * Point VITE_BARBER_MODEL_URL at the file (client/.env.example).
 */
export const BARBER_MODEL_URL = import.meta.env.VITE_BARBER_MODEL_URL || '';
const DRACO_PATH = '/draco/';
const TARGET_HEIGHT = 3.3; // world units: the pole's full height, caps included

// Start the download with the page, not when the hero first renders.
if (BARBER_MODEL_URL) useGLTF.preload(BARBER_MODEL_URL, DRACO_PATH);

export function BarberModel({ url, turntable = 0.25 }) {
  const group = useRef();
  const { scene, animations } = useGLTF(url, DRACO_PATH);
  // A private copy — the loader cache hands everyone the same object, and this
  // one gets moved and scaled. SkeletonUtils, not scene.clone(): a plain clone
  // leaves a rigged character's bones bound to the original.
  const model = useMemo(() => cloneSkinned(scene), [scene]);
  const { actions, names } = useAnimations(animations, group);

  useLayoutEffect(() => {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const scale = size.y > 0 ? TARGET_HEIGHT / size.y : 1;
    model.scale.setScalar(scale);
    model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);

    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        // Scans arrive with their light baked in and read flat under studio
        // light; a little environment gives them the room's gold edges.
        if (material && 'envMapIntensity' in material) material.envMapIntensity = 1.2;
      }
    });
  }, [model]);

  useEffect(() => {
    const first = names[0] ? actions[names[0]] : null;
    first?.reset().fadeIn(0.6).play();
    return () => {
      first?.fadeOut(0.3);
    };
  }, [actions, names]);

  const animated = names.length > 0;
  useFrame((_, delta) => {
    if (!group.current || animated || !turntable) return;
    group.current.rotation.y += Math.min(delta, 1 / 30) * turntable;
  });

  return (
    <group ref={group}>
      <primitive object={model} />
    </group>
  );
}

/** If the file is missing or broken, show `fallback` (the pole) instead of a crash. */
export class ModelBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('[3d] the barber model could not load — showing the pole instead:', error?.message);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
