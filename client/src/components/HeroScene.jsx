// ===========================================================================
//  THE TOOLKIT — a barbershop after hours
// ===========================================================================
//
// A glowing barber pole with red/ivory/navy helix stripes, a pair of scissors
// that slowly open and close, a straight razor that folds, and a comb — turning
// in a dark room, lit the way a watch or a fragrance is shot: black everywhere,
// and every edge of gold and steel catching a line of light.
//
// Everything is procedural geometry. No GLTF, no HDR, nothing to download: the
// blades are `ExtrudeGeometry` from hand-drawn `Shape` outlines, the stripes
// are a shader, and the studio is built from `<Lightformer>` rectangles.
//
// ---------------------------------------------------------------------------
// How a dark scene gets its drama
// ---------------------------------------------------------------------------
//
// Metal has no colour of its own to show — it only ever shows what it
// reflects. So the room is almost entirely BLACK, and the light comes from a
// few narrow sources placed where their reflections will slide along the
// tools: a warm tungsten key (the gold), a cool rim from behind (the silver),
// and one long overhead strip for the specular line down every blade. A soft
// pool of warm light on the back wall separates the silhouettes from the dark.
// Brighten the room and all of that turns grey.
//
// ---------------------------------------------------------------------------
// The four things that make it smooth rather than busy
// ---------------------------------------------------------------------------
//
//  1. NOTHING IS EVER ASSIGNED. Every reactive value goes through
//     THREE.MathUtils.damp(), which converges at a wall-clock rate rather than
//     a per-frame fraction. lerp(a, b, 0.1) settles twice as fast on a 120Hz
//     iPhone as on a 60Hz laptop; damp() does not.
//
//  2. THE RENDER LOOP NEVER TOUCHES REACT. Pointer and scroll live in a plain
//     module object read inside useFrame. useState there would reconcile the
//     tree at frame rate.
//
//  3. NO drei MeshTransmissionMaterial ANYWHERE. It re-renders the scene into
//     its own framebuffer per material. The pole's glass tube uses three's
//     BUILT-IN meshPhysicalMaterial transmission instead, which shares the
//     renderer's single transmission pass — so the scene can afford four
//     detailed objects instead of one expensive sphere.
//
//  4. EVERY GEOMETRY IS BUILT ONCE in useMemo and disposed on unmount. Three
//     does not garbage-collect GPU buffers; rebuilding an ExtrudeGeometry per
//     render would leak a blade a frame.

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  AdaptiveDpr,
  ContactShadows,
  Environment,
  Float,
  Lightformer,
  PerformanceMonitor,
  Preload,
} from '@react-three/drei';
import * as THREE from 'three';
import { BARBER_MODEL_URL, BarberModel, ModelBoundary } from './BarberModel.jsx';
import { useOverlayOpen } from '../lib/overlay.js';

// ---------------------------------------------------------------------------
// Per-frame input. A plain object, deliberately outside React.
// ---------------------------------------------------------------------------

const input = { px: 0, py: 0, scroll: 0, reduced: false };
const damp = THREE.MathUtils.damp;

function useSpatialInput() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    input.reduced = mq.matches;
    const onMq = (e) => {
      input.reduced = e.matches;
    };

    // Parallax on fine pointers only. On touch the finger is already driving
    // the scroll, and tying the scene to touch position fights the gesture.
    const fine = window.matchMedia('(pointer: fine)').matches;
    const onPointer = (e) => {
      input.px = (e.clientX / window.innerWidth) * 2 - 1;
      input.py = (e.clientY / window.innerHeight) * 2 - 1;
    };

    // scrollHeight forces a reflow, so it is measured on resize and cached.
    let max = 1;
    const measure = () => {
      max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    };
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        input.scroll = Math.min(1, Math.max(0, window.scrollY / max));
      });
    };

    measure();
    onScroll();
    mq.addEventListener('change', onMq);
    window.addEventListener('resize', measure, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    if (fine) window.addEventListener('pointermove', onPointer, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener('change', onMq);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll);
      if (fine) window.removeEventListener('pointermove', onPointer);
    };
  }, []);
}

/**
 * The room. ONYX must equal `onyx` in tailwind.config.js exactly: the canvas
 * IS the page background, and any difference shows as a seam where the scene
 * meets the first glass panel.
 */
const PALETTE = {
  onyx: '#0B1110',
  // Metals. On a metalness-1 surface `color` is the reflectance — the tint the
  // reflected light comes back with — so these are what the highlights become.
  gold: '#E2B863',
  brass: '#C9A86B',
  silver: '#E4E7EA',
  steel: '#A7AEB5',
  // The pole's enamel, deepened from toy-bright to vintage.
  poleRed: '#D23A34',
  poleNavy: '#2E62BE',
  poleIvory: '#F2E8D8',
  // Light temperatures.
  tungsten: '#FFC98A', // the warm key — what turns an edge gold
  moon: '#BFD4EA', // the cool rim — what keeps silver reading as silver
};

/**
 * Surfaces. `color` is only half of a metal; roughness decides whether a
 * reflected strip light arrives as a crisp line (mirror) or a soft sheen
 * (satin), and mixing the two is what makes a set of tools look expensive
 * rather than uniformly shiny.
 */
const FINISH = {
  gold: { color: PALETTE.gold, metalness: 1, roughness: 0.2, envMapIntensity: 2.1 },
  goldSatin: { color: PALETTE.gold, metalness: 1, roughness: 0.34, envMapIntensity: 1.8 },
  brass: { color: PALETTE.brass, metalness: 1, roughness: 0.3, envMapIntensity: 1.9 },
  mirror: { color: PALETTE.silver, metalness: 1, roughness: 0.12, envMapIntensity: 2.4 },
  steel: { color: PALETTE.steel, metalness: 1, roughness: 0.2, envMapIntensity: 2 },
  gunmetal: { color: '#2B3134', metalness: 1, roughness: 0.13, envMapIntensity: 2.2 },
  // Black lacquer shows nothing but the lights it reflects — in this room,
  // that is exactly the point.
  lacquer: { color: '#0F1313', metalness: 0, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.6 },
};

/** One material from a FINISH: physical when it needs clearcoat, standard otherwise. */
function Finish({ spec, ...rest }) {
  return spec.clearcoat ? (
    <meshPhysicalMaterial {...spec} {...rest} />
  ) : (
    <meshStandardMaterial {...spec} {...rest} />
  );
}

const TIERS = {
  high: { beads: 9, shadows: true, segments: 96, bevel: 3 },
  mid: { beads: 6, shadows: true, segments: 64, bevel: 2 },
  low: { beads: 3, shadows: false, segments: 32, bevel: 1 },
};

// ---------------------------------------------------------------------------
// Light — a dark room, lit like a product shot
// ---------------------------------------------------------------------------

/**
 * The reflections.
 *
 * `frames={1}` bakes the rig into a cube map on the first frame and then stops
 * costing anything. At 512 the strips stay crisp in a mirror-polished blade;
 * the price is paid once.
 *
 * Everything not listed here is black, and that is the design: a metal
 * surface reflects mostly darkness, with a few precise lines of light sliding
 * across it as the tools turn. Warm key against cool rim is what makes the
 * gold read as gold and the steel read as steel side by side — lit by one
 * temperature, both would collapse into the same beige.
 *
 * With no `rotation`, a Lightformer turns to face the origin, which is where
 * the tools are; only the overhead and floor panels set their angle by hand.
 */
function Studio() {
  return (
    <Environment frames={1} resolution={512}>
      {/* Warm tungsten key: a tall, narrow strip high off the right shoulder —
          the lamp over the chair. The gold highlights come from here. */}
      <Lightformer form="rect" intensity={4.2} color={PALETTE.tungsten} position={[4.5, 3.5, 3.5]} scale={[1.6, 8, 1]} />
      {/* Cool rim from behind-left. Edges the silhouettes against the black and
          keeps the steel reading as steel. */}
      <Lightformer form="rect" intensity={3} color={PALETTE.moon} position={[-5.5, 1, -3]} scale={[1, 8, 1]} />
      {/* One long, thin overhead strip — the specular line that runs down every
          blade as it turns. The single most "expensive" reflection in the rig. */}
      <Lightformer form="rect" intensity={7} color="#FFF1DC" position={[0, 5.5, 0.5]} scale={[14, 0.25, 1]} rotation={[Math.PI / 2, 0, 0]} />
      {/* A low warm accent, front-left: a second, fainter line on the faces
          turned toward the viewer, so they are not a black hole. */}
      <Lightformer form="rect" intensity={1.4} color={PALETTE.tungsten} position={[-3.5, -1.5, 4]} scale={[0.6, 4, 1]} />
      {/* A large, dim warm softbox behind the camera. Faces turned toward the
          viewer reflect THIS — without it they reflect black, and polished gold
          reads as dark bronze. Kept low so it lifts the metal without lighting
          the room. */}
      <Lightformer form="rect" intensity={0.6} color="#E9C99A" position={[0, 1, 8]} scale={[11, 6, 1]} />
      {/* A gold ring far behind — a circular glint in every sphere and pole cap. */}
      <Lightformer form="ring" intensity={2.4} color={PALETTE.gold} position={[2.5, 0.8, -6]} scale={2.2} />
      {/* The barest warm floor bounce, so undersides fall off into shadow
          instead of cutting out as flat black shapes. */}
      <Lightformer form="rect" intensity={0.35} color="#5A4122" position={[0, -6, 0]} scale={[10, 10, 1]} rotation={[-Math.PI / 2, 0, 0]} />
    </Environment>
  );
}

const GLOW_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GLOW_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;

  void main() {
    // An elliptical pool, brightest a little above centre: a pendant lamp over
    // the chair, landing on the back wall. Squared falloff, because light from
    // a point dims with the square of the distance — linear falloff reads as a
    // flat disc stuck to the wall.
    vec2 p = (vUv - vec2(0.5, 0.56)) * vec2(1.0, 1.4);
    float a = smoothstep(0.5, 0.0, length(p));
    gl_FragColor = vec4(uColor * a * a * uStrength, 1.0);
  }
`;

/**
 * The back wall. Without it the tools float in a void; with it they stand in
 * a room, and their silhouettes separate from the dark behind them.
 *
 * Additive, so it can only ever lighten the onyx it sits on — it can never put
 * a grey rectangle on the page — and depthWrite off, so it never occludes.
 * Outside the moving group on purpose: the wall stays put while the camera
 * drifts, which is free parallax.
 */
function BackGlow() {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color(PALETTE.tungsten) },
      uStrength: { value: 0.22 },
    }),
    []
  );

  return (
    <mesh position={[0, 0.4, -7.5]} scale={[22, 14, 1]} renderOrder={-1}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial
        vertexShader={GLOW_VERT}
        fragmentShader={GLOW_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// The barber pole
// ---------------------------------------------------------------------------

const POLE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const POLE_FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime, uTwist, uBands;
  uniform vec3 uRed, uBlue, uWhite, uRim, uSheen;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;

  void main() {
    // uv.x wraps around the cylinder, uv.y climbs it. Subtracting a multiple
    // of uv.x shears the bands into a helix.
    //
    // uTwist MUST stay an integer: at the cylinder's UV seam uv.x jumps 1 -> 0,
    // and only an integer shear keeps the phase continuous across it. A
    // fractional twist puts a visible vertical scar down the back of the pole.
    float phase = vUv.y * uBands - vUv.x * uTwist + uTime;

    // Colour selection from a SINE, not from fract().
    //
    // fract() wraps hard once per period and fwidth() blows up exactly at that
    // seam — which is the shimmer that gives cheap barber-pole demos away.
    // sin() is continuous everywhere, so the pattern antialiases itself for
    // free at any zoom, and the soft band edges read as painted enamel under
    // glass rather than as vector art.
    float s = sin(phase * 6.2831853);
    float red  = smoothstep(0.12, 0.58, s);
    float blue = smoothstep(-0.12, -0.58, s);

    vec3 col = uWhite;
    col = mix(col, uRed, red);
    col = mix(col, uBlue, blue);

    // Fresnel rim, tinted GOLD. The pole glows from inside, but its silhouette
    // should catch the same warm key as every other metal in the room.
    float fres = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.6);
    col += uRim * fres * 0.55;

    // A single specular band, so the cylinder looks wet rather than
    // matte-printed.
    float spec = pow(max(dot(normalize(vN), normalize(vV)), 0.0), 7.0);
    col += uSheen * spec * 0.16;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function BarberPole({ tier }) {
  const group = useRef();

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTwist: { value: 3 }, // integer — see the seam note in the shader
      uBands: { value: 5.5 },
      uRed: { value: new THREE.Color(PALETTE.poleRed) },
      uBlue: { value: new THREE.Color(PALETTE.poleNavy) },
      uWhite: { value: new THREE.Color(PALETTE.poleIvory) },
      uRim: { value: new THREE.Color(PALETTE.gold) },
      uSheen: { value: new THREE.Color('#FFF1DC') },
    }),
    []
  );

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30); // a returning tab must not teleport it
    // Stripes climb; the body turns the other way. That counter-motion is what
    // makes a barber pole legible AS a barber pole.
    uniforms.uTime.value += dt * (0.22 + input.scroll * 0.5);
    if (group.current) {
      group.current.rotation.y += dt * 0.18;
      group.current.rotation.z = damp(
        group.current.rotation.z,
        -0.06 + (input.reduced ? 0 : input.px * 0.05),
        2,
        dt
      );
    }
  });

  return (
    <group ref={group}>
      {/* Striped body */}
      <mesh castShadow>
        <cylinderGeometry args={[0.42, 0.42, 2.9, tier.segments, 1, true]} />
        <shaderMaterial
          vertexShader={POLE_VERT}
          fragmentShader={POLE_FRAG}
          uniforms={uniforms}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Glass tube. three's BUILT-IN transmission, which shares the renderer's
          single pass — drei's version would allocate a whole framebuffer for
          this one cylinder. In the dark it shows almost nothing but the strip
          lights sliding over it, which is exactly how glass looks at night. */}
      <mesh>
        <cylinderGeometry args={[0.5, 0.5, 3.0, tier.segments, 1, true]} />
        <meshPhysicalMaterial
          transmission={1}
          thickness={0.25}
          roughness={0.04}
          ior={1.5}
          metalness={0}
          clearcoat={1}
          clearcoatRoughness={0.05}
          transparent
          opacity={0.92}
          side={THREE.DoubleSide}
          color="#FFFFFF"
        />
      </mesh>

      {/* Polished gold fittings, top and bottom, with steel collars */}
      {[1, -1].map((d) => (
        <group key={d} position={[0, d * 1.62, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.6, 0.5, 0.34, 40]} />
            <Finish spec={FINISH.gold} />
          </mesh>
          <mesh position={[0, d * 0.29, 0]} castShadow>
            <sphereGeometry args={[0.21, 28, 20]} />
            <Finish spec={FINISH.gold} roughness={0.1} />
          </mesh>
          <mesh position={[0, -d * 0.24, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.52, 0.03, 12, 44]} />
            <Finish spec={FINISH.steel} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Blades — the outline every cutting edge is extruded from
// ---------------------------------------------------------------------------

/**
 * A real blade profile: wide and blunt at the heel, tapering to a point, with a
 * bevelled spine.
 *
 * A plain box would have read as a stick. Twelve lines of `Shape` is what makes
 * the silhouette legible as scissors from across the room — and the bevel is
 * what the overhead strip light runs along.
 */
function useBladeGeometry({ length = 1.45, heel = 0.17, bevel = 2 }) {
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, -heel * 0.45);
    s.lineTo(length * 0.88, -0.022);
    s.lineTo(length, 0.004); // the point
    s.lineTo(length * 0.86, 0.042);
    s.lineTo(0, heel * 0.55);
    s.closePath();

    return new THREE.ExtrudeGeometry(s, {
      depth: 0.05,
      bevelEnabled: true,
      bevelSize: 0.009,
      bevelThickness: 0.011,
      bevelSegments: bevel,
      curveSegments: 4,
    });
  }, [length, heel, bevel]);
}

/** Three does not GC GPU buffers, so every geometry built here is disposed. */
function useDisposeGeometry(geometry) {
  useLayoutEffect(() => () => geometry?.dispose?.(), [geometry]);
}

// ---------------------------------------------------------------------------
// Scissors
// ---------------------------------------------------------------------------

/**
 * Two halves hinged on a pivot, opening and closing on a slow sine.
 *
 * The animation is why this object earns its place: a static pair of scissors
 * is a logo; a pair that breathes open and shut is alive. The rate stays under
 * one cycle every four seconds — faster reads as nervous.
 */
function Scissors({ tier, finish }) {
  const group = useRef();
  const upper = useRef();
  const lower = useRef();

  const blade = useBladeGeometry({ length: 1.5, heel: 0.19, bevel: tier.bevel });
  useDisposeGeometry(blade);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const open = 0.2 + Math.sin(state.clock.elapsedTime * 0.55) * 0.17;

    if (upper.current) upper.current.rotation.z = damp(upper.current.rotation.z, open, 3, dt);
    if (lower.current) lower.current.rotation.z = damp(lower.current.rotation.z, -open, 3, dt);
    if (group.current) {
      group.current.rotation.y = damp(
        group.current.rotation.y,
        -0.5 + (input.reduced ? 0 : input.px * 0.3),
        1.8,
        dt
      );
    }
  });

  const half = (ref, flip) => (
    <group ref={ref}>
      {/* Mirror-polished blade, reaching out from the pivot */}
      <mesh geometry={blade} position={[0.08, 0, -0.025]} scale={[1, flip, 1]} castShadow>
        <Finish spec={FINISH.mirror} />
      </mesh>
      {/* Arm running back to the finger ring */}
      <mesh position={[-0.42, flip * 0.16, 0]} rotation={[0, 0, flip * 0.34]} castShadow>
        <boxGeometry args={[0.85, 0.075, 0.05]} />
        <Finish spec={finish} />
      </mesh>
      {/* Finger ring */}
      <mesh position={[-0.92, flip * 0.33, 0]} castShadow>
        <torusGeometry args={[0.2, 0.045, 12, 30]} />
        <Finish spec={finish} />
      </mesh>
    </group>
  );

  return (
    <group ref={group} position={[-2.35, 1.15, -0.4]} rotation={[0.2, -0.5, 0.5]} scale={0.78}>
      {half(upper, 1)}
      {half(lower, -1)}
      {/* Pivot screw */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.075, 0.075, 0.13, 20]} />
        <Finish spec={FINISH.steel} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Straight razor
// ---------------------------------------------------------------------------

/** Folds and unfolds on its own cycle, deliberately out of phase with the
 *  scissors so the two never pulse together. */
function Razor({ tier, finish }) {
  const group = useRef();
  const hinge = useRef();

  const blade = useBladeGeometry({ length: 1.25, heel: 0.24, bevel: tier.bevel });
  useDisposeGeometry(blade);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    // 0 = folded into the scale, ~2.4rad = fully open.
    const fold = 1.2 + Math.sin(state.clock.elapsedTime * 0.4 + 1.6) * 1.2;

    if (hinge.current) hinge.current.rotation.z = damp(hinge.current.rotation.z, fold, 2.2, dt);
    if (group.current) {
      group.current.rotation.z = damp(
        group.current.rotation.z,
        -0.3 + (input.reduced ? 0 : input.py * 0.18),
        1.8,
        dt
      );
    }
  });

  return (
    <group ref={group} position={[2.5, -1.15, -0.2]} rotation={[0.25, 0.4, -0.3]} scale={0.82}>
      {/* The scale (handle) */}
      <mesh position={[0.62, 0, 0]} castShadow>
        <boxGeometry args={[1.3, 0.17, 0.09]} />
        <Finish spec={finish} />
      </mesh>
      {/* Blade on its hinge */}
      <group ref={hinge}>
        <mesh geometry={blade} position={[0.05, 0, -0.025]} castShadow>
          <Finish spec={FINISH.mirror} />
        </mesh>
      </group>
      {/* Hinge pin */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.055, 0.055, 0.14, 16]} />
        <Finish spec={FINISH.gold} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Comb
// ---------------------------------------------------------------------------

/**
 * A spine plus fourteen teeth.
 *
 * Fourteen separate meshes would be fourteen draw calls for an object the size
 * of a thumbnail, so the teeth are one InstancedMesh — positioned once in a
 * layout effect and never touched again.
 */
function Comb({ finish }) {
  const group = useRef();
  const teeth = useRef();
  const TEETH = 14;

  useLayoutEffect(() => {
    if (!teeth.current) return;
    const m = new THREE.Object3D();
    for (let i = 0; i < TEETH; i += 1) {
      m.position.set(-0.62 + i * 0.095, -0.17, 0);
      m.updateMatrix();
      teeth.current.setMatrixAt(i, m.matrix);
    }
    teeth.current.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state, delta) => {
    if (!group.current) return;
    const dt = Math.min(delta, 1 / 30);
    group.current.rotation.y += dt * 0.25;
    group.current.rotation.x = damp(
      group.current.rotation.x,
      0.35 + (input.reduced ? 0 : input.py * 0.2),
      1.8,
      dt
    );
  });

  return (
    <group ref={group} position={[2.1, 1.5, -0.8]} rotation={[0.35, 0.4, 0.25]} scale={0.85}>
      <mesh castShadow>
        <boxGeometry args={[1.42, 0.17, 0.06]} />
        <Finish spec={finish} />
      </mesh>
      <instancedMesh ref={teeth} args={[null, null, TEETH]} castShadow>
        <boxGeometry args={[0.032, 0.2, 0.05]} />
        <Finish spec={finish} />
      </instancedMesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Gold dust
// ---------------------------------------------------------------------------

/**
 * Small metal beads — gold, mirror steel, brass, gunmetal — drifting.
 *
 * In a dark room each one is a point of reflected light, the same glints the
 * tools throw, scattered through the air around them. Each bead floats on its
 * own phase; uniform float across nine objects reads as one animated layer
 * rather than as air.
 *
 * Positions are deterministic rather than Math.random(), so nothing reshuffles
 * on a hot reload or a Strict Mode double-mount.
 */
function Beads({ count }) {
  const beads = useMemo(() => {
    const finishes = [FINISH.gold, FINISH.mirror, FINISH.brass, FINISH.gunmetal, FINISH.goldSatin];
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + i * 0.7;
      const r = 3.1 + ((i * 7) % 4) * 0.42;
      return {
        key: i,
        finish: finishes[i % finishes.length],
        position: [Math.cos(a) * r, Math.sin(i * 1.4) * 2.1, Math.sin(a) * r * 0.6 - 1],
        scale: 0.085 + ((i * 11) % 4) * 0.032,
        speed: 0.8 + ((i * 13) % 5) * 0.25,
      };
    });
  }, [count]);

  return (
    <>
      {beads.map((b) => (
        <Float
          key={b.key}
          speed={b.speed}
          rotationIntensity={0.4}
          floatIntensity={1.1}
          floatingRange={[-0.2, 0.2]}
        >
          <mesh position={b.position} scale={b.scale} castShadow>
            <sphereGeometry args={[1, 24, 18]} />
            <Finish spec={b.finish} />
          </mesh>
        </Float>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rig
// ---------------------------------------------------------------------------

/**
 * The camera counter-drifts against the objects' tilt.
 *
 * Moving both toward the cursor doubles the apparent motion and feels cheap.
 * Moving them in opposition produces parallax, which is what reads as depth.
 */
function Rig() {
  const { camera } = useThree();
  const origin = useMemo(() => new THREE.Vector3(0, 0, 0), []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 1 / 30);
    const px = input.reduced ? 0 : input.px;
    const py = input.reduced ? 0 : input.py;

    camera.position.x = damp(camera.position.x, -px * 0.9, 1.4, dt);
    camera.position.y = damp(camera.position.y, 0.2 + py * 0.5, 1.4, dt);
    camera.position.z = damp(camera.position.z, 7.6 + input.scroll * 1.6, 1.4, dt);
    camera.lookAt(origin);
  });

  return null;
}

function Scene({ tier, setTier, onReady }) {
  const t = TIERS[tier];
  const announced = useRef(false);
  const group = useRef();

  useFrame((state, delta) => {
    // One real frame has been drawn. This — not an asset-progress number, and
    // not a timer — is the correct signal to lift the page's loading veil.
    if (!announced.current) {
      announced.current = true;
      onReady?.();
    }

    if (!group.current) return;
    const dt = Math.min(delta, 1 / 30);
    group.current.rotation.x = damp(group.current.rotation.x, (input.reduced ? 0 : input.py) * 0.12, 2, dt);
    // Scroll pushes the whole toolkit back and down, handing the frame over to
    // the copy instead of letting it scroll away in front of it.
    group.current.position.y = damp(group.current.position.y, -input.scroll * 1.6, 1.6, dt);
  });

  return (
    <>
      {/* The dark room. Attached to the scene so they sit outside
          PerformanceMonitor, which renders a fragment rather than an Object3D. */}
      <color attach="background" args={[PALETTE.onyx]} />
      {/* Fog in the room's own colour: the far beads sink into the dark instead
          of floating in front of it as hard dots. */}
      <fog attach="fog" args={[PALETTE.onyx, 8, 20]} />

      <PerformanceMonitor
        /* Two declines in a row is a real trend. One is a garbage-collection
           blip and should not permanently downgrade the experience. */
        flipflops={2}
        onDecline={() => setTier((q) => (q === 'high' ? 'mid' : 'low'))}
        onIncline={() => setTier((q) => (q === 'low' ? 'mid' : 'high'))}
        onFallback={() => setTier('low')}
      >
        {/* Next to no ambient. The shadow side of every object is meant to fall
            away into the page — that falloff IS the mood. */}
        <ambientLight intensity={0.06} color={PALETTE.moon} />
        {/* The warm key, from the same top-right as the tungsten strip in the
            Studio, so the glints and the cast shadows agree. */}
        <directionalLight
          position={[4, 6, 3]}
          intensity={1.2}
          color={PALETTE.tungsten}
          castShadow
          shadow-mapSize={1024}
          shadow-bias={-0.0005}
        />
        {/* The cool rim from behind-left: separates dark edges from a dark room. */}
        <directionalLight position={[-5, 2, -4]} intensity={1} color={PALETTE.moon} />
        <Studio />
        <BackGlow />
        <Rig />

        <group ref={group}>
          {/* The barber, when a model is configured (VITE_BARBER_MODEL_URL).
              The pole stands in while it downloads, and for good if it fails. */}
          {BARBER_MODEL_URL ? (
            <ModelBoundary fallback={<BarberPole tier={t} />}>
              <Suspense fallback={<BarberPole tier={t} />}>
                <BarberModel url={BARBER_MODEL_URL} turntable={input.reduced ? 0 : 0.25} />
              </Suspense>
            </ModelBoundary>
          ) : (
            <BarberPole tier={t} />
          )}
          {/* The pole is lit from inside, so it spills a little warm light onto
              whatever is near it. Short range: it colours the neighbours, not
              the room. In the group, so it travels with the pole on scroll. */}
          <pointLight position={[0, 0.3, 0.9]} intensity={3.5} distance={4.5} decay={2} color="#FFD2B0" />
          <Scissors tier={t} finish={FINISH.gold} />
          <Razor tier={t} finish={FINISH.lacquer} />
          <Comb finish={FINISH.brass} />
          <Beads count={t.beads} />
        </group>

        {t.shadows && (
          <ContactShadows
            position={[0, -2.55, 0]}
            opacity={0.5}
            scale={14}
            blur={3.2}
            far={5}
            /* True black. Against onyx it is felt more than seen — just enough
               to settle the toolkit onto a floor instead of floating. */
            color="#000000"
            frames={1}
          />
        )}

        <AdaptiveDpr pixelated />
        <Preload all />
      </PerformanceMonitor>
    </>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Owns its own Canvas, so the page only has to position it:
 *
 *   <div className="fixed inset-0"><HeroScene onReady={...} /></div>
 *
 * @param {object}   props
 * @param {string}   [props.className]
 * @param {Function} [props.onReady]  fires once, on the first drawn frame
 */
export default function HeroScene({ className = '', onReady }) {
  const covered = useOverlayOpen();
  useSpatialInput();

  // Plain state. The tier changes a handful of times per session at most, so a
  // re-render is exactly what should happen.
  const [tier, setTier] = useState('high');

  return (
    <Canvas
      // Frozen while a sheet covers the scene: see lib/overlay.js.
      frameloop={covered ? 'never' : 'always'}
      className={className}
      /* dpr is a RANGE, not a number. AdaptiveDpr slides within it as the frame
         budget moves, so a weak device loses sharpness before it loses
         smoothness — which is far less noticeable. */
      dpr={[1, 2]}
      shadows="soft"
      gl={{
        antialias: true,
        alpha: false,
        stencil: false,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        /* A touch over 1 in a dark scene: ACES rolls the brightest glints off
           softly instead of clipping them, so the highlights can run hot and
           still read as polished metal rather than as white holes. */
        toneMappingExposure: 1.1,
      }}
      camera={{ fov: 34, near: 0.1, far: 60, position: [0, 0.2, 7.6] }}
    >
      {/* fallback={null} on purpose — the page owns the loading veil, and a
          second spinner inside the canvas would flash through it. */}
      <Suspense fallback={null}>
        <Scene tier={tier} setTier={setTier} onReady={onReady} />
      </Suspense>
    </Canvas>
  );
}
