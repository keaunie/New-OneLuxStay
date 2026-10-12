// Scroll-driven 3D story: a Redondo Beach shoreline rendered with Three.js (via React Three Fiber)
// that stays fixed behind the home page. As you scroll, the camera walks down the beach and out
// along the pier while the day moves from sunny morning to golden hour, sunset and dusk.
// Ocean, sand, sky, clouds and sun are all procedural shaders, so there are no model or texture
// downloads.
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

const SHORE_Z = 3.0;

const NOISE = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return v;
  }
`;

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;

const skyFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uHorizon;
  uniform vec3 uMid;
  uniform vec3 uZenith;
  uniform vec3 uSunCol;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShade;
  uniform float uNight;
  varying vec3 vDir;
  ${NOISE}
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
    col = mix(col, uZenith, smoothstep(0.18, 0.85, h));

    // Stars fade in as the light goes.
    if (uNight > 0.0 && dir.y > 0.04) {
      vec2 cell = floor(dir.xz / (dir.y + 0.3) * 70.0);
      float r = hash(cell);
      float star = step(0.9965, r) * (0.55 + 0.45 * sin(uTime * 2.0 + r * 40.0));
      col += vec3(1.0, 0.97, 0.9) * star * smoothstep(0.04, 0.35, dir.y) * uNight;
    }

    float sd = max(dot(dir, uSunDir), 0.0);
    col += uSunCol * pow(sd, 10.0) * 0.18;
    col += uSunCol * pow(sd, 70.0) * 0.7;
    col = mix(col, mix(uSunCol, vec3(1.0), 0.6), smoothstep(0.9990, 0.9995, sd));

    // Clouds: project the view ray onto a plane overhead and drift it with the wind.
    if (dir.y > 0.01) {
      vec2 uv = dir.xz / (dir.y + 0.25) * 1.6 + vec2(uTime * 0.012, 0.0);
      float c = fbm(uv * 1.4);
      float cover = smoothstep(0.58, 0.82, c) * smoothstep(0.0, 0.22, dir.y);
      float shade = fbm(uv * 1.4 + uSunDir.xz * 0.35);
      vec3 cloud = mix(uCloudShade, uCloudLit, smoothstep(0.35, 0.8, shade));
      cloud += uSunCol * pow(sd, 8.0) * 0.25;
      col = mix(col, cloud, cover * 0.95);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

const oceanVertex = /* glsl */ `
  uniform float uTime;
  uniform float uShore;
  varying vec3 vWorld;
  varying float vHeight;
  void main() {
    vec3 p = position;
    vec4 base = modelMatrix * vec4(p, 1.0);
    float calm = smoothstep(uShore + 1.0, uShore - 14.0, base.z);
    float h = 0.0;
    h += sin(base.x * 0.22 + base.z * 0.35 + uTime * 0.9) * 0.34;
    h += sin(base.x * 0.47 - base.z * 0.21 + uTime * 1.3) * 0.18;
    h += sin(base.x * 0.95 + base.z * 0.78 + uTime * 1.9) * 0.07;
    h *= calm;
    vHeight = h;
    base.y += h;
    vWorld = base.xyz;
    gl_Position = projectionMatrix * viewMatrix * base;
  }
`;

const oceanFragment = /* glsl */ `
  uniform float uTime;
  uniform float uShore;
  uniform vec3 uSunDir;
  uniform vec3 uSunCol;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uRefl;
  uniform vec3 uHaze;
  uniform vec3 uTint;
  varying vec3 vWorld;
  varying float vHeight;
  ${NOISE}
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;
    n = normalize(mix(vec3(0.0, 1.0, 0.0), n, 0.6)); // soften the mesh facets

    // Fine ripples perturb the normal so sun glitter breaks up.
    vec2 rp = vWorld.xz * 1.7 + vec2(uTime * 0.25, uTime * 0.18);
    n = normalize(n + vec3(noise(rp) - 0.5, 0.0, noise(rp + 7.3) - 0.5) * 0.35);

    // The shoreline wobbles along the beach and swells in and out like surf.
    float shoreZ = uShore + sin(uTime * 0.55 + vWorld.x * 0.12) * 0.7 + sin(uTime * 0.9 + vWorld.x * 0.31) * 0.25;
    float d = shoreZ - vWorld.z; // metres of water in front of the sand line

    vec3 deep = uDeep;
    vec3 shallow = uShallow;
    vec3 water = mix(deep, shallow, smoothstep(-26.0, uShore, vWorld.z));

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    vec3 skyRefl = uRefl;
    vec3 col = mix(water, skyRefl, clamp(fres * 0.85 + 0.06, 0.0, 1.0));

    vec3 r = reflect(-viewDir, n);
    float sd = max(dot(r, uSunDir), 0.0);
    col += uSunCol * pow(sd, 260.0) * 2.2;
    col += uSunCol * pow(sd, 28.0) * 0.28;

    // Foam on wave crests.
    float crest = smoothstep(0.28, 0.56, vHeight + (noise(vWorld.xz * 1.2 + uTime * 0.2) - 0.5) * 0.22);
    col = mix(col, uTint, crest * 0.55);

    vec3 haze = uHaze;
    float dist = length(cameraPosition - vWorld);

    if (d > 0.0) {
      // Foam wash and the trailing lines left by each wave.
      float band = smoothstep(0.0, 0.25, d) * smoothstep(1.1, 0.35, d);
      float lace = noise(vWorld.xz * 3.2 + uTime * 0.3);
      col = mix(col, uTint, band * (0.55 + 0.45 * lace));
      float lines = smoothstep(0.72, 0.9, sin(d * 3.3 - uTime * 0.9) * 0.5 + 0.5) * smoothstep(5.5, 1.0, d) * smoothstep(0.9, 2.0, d);
      col = mix(col, uTint, lines * 0.35 * lace);
      col = mix(col, shallow * 1.1, smoothstep(2.8, 0.2, d) * 0.25);
    } else {
      // Dry and damp sand.
      float grain = noise(vWorld.xz * 14.0) * 0.5 + noise(vWorld.xz * 40.0) * 0.5;
      vec3 sand = mix(vec3(0.93, 0.78, 0.54), vec3(1.0, 0.90, 0.68), grain) * uTint;
      float wet = smoothstep(-2.6, 0.0, d);
      sand = mix(sand, sand * vec3(0.74, 0.66, 0.56), wet);
      sand += vec3(1.0, 0.95, 0.85) * wet * pow(sd, 18.0) * 0.12;
      float rim = smoothstep(0.0, -0.18, d) * smoothstep(-0.5, -0.05, d);
      col = mix(sand, uTint, rim * 0.45);
    }

    col = mix(col, haze, clamp((dist - 45.0) / 110.0, 0.0, 1.0) * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

// --- Time of day: the story moves through these looks as you scroll (p = 0 top, 1 bottom) ---
const rgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
const LOOKS = [
  { p: 0.0, az: 0.30, elev: 0.30, horizon: rgb(0.80, 0.90, 0.97), mid: rgb(0.30, 0.62, 0.92), zenith: rgb(0.05, 0.28, 0.70), sun: rgb(1.0, 0.92, 0.72), deep: rgb(0.02, 0.28, 0.46), shallow: rgb(0.13, 0.72, 0.74), refl: rgb(0.67, 0.81, 0.93), haze: rgb(0.80, 0.90, 0.97), tint: rgb(1, 1, 1), cloudLit: rgb(1.0, 0.99, 0.96), cloudShade: rgb(0.80, 0.86, 0.94), light: rgb(1.0, 0.945, 0.84), lightI: 2.4, hemiI: 1.5, lamp: 0, night: 0 },
  { p: 0.3, az: 0.15, elev: 0.22, horizon: rgb(0.88, 0.92, 0.95), mid: rgb(0.36, 0.62, 0.88), zenith: rgb(0.10, 0.30, 0.66), sun: rgb(1.0, 0.88, 0.62), deep: rgb(0.03, 0.30, 0.46), shallow: rgb(0.18, 0.70, 0.70), refl: rgb(0.72, 0.80, 0.88), haze: rgb(0.86, 0.90, 0.93), tint: rgb(1, 0.98, 0.94), cloudLit: rgb(1.0, 0.97, 0.9), cloudShade: rgb(0.80, 0.84, 0.92), light: rgb(1.0, 0.9, 0.7), lightI: 2.3, hemiI: 1.4, lamp: 0, night: 0 },
  { p: 0.62, az: -0.05, elev: 0.09, horizon: rgb(1.0, 0.78, 0.52), mid: rgb(0.62, 0.62, 0.78), zenith: rgb(0.18, 0.28, 0.55), sun: rgb(1.0, 0.72, 0.38), deep: rgb(0.04, 0.24, 0.38), shallow: rgb(0.30, 0.58, 0.58), refl: rgb(0.95, 0.72, 0.55), haze: rgb(0.98, 0.76, 0.55), tint: rgb(1.0, 0.84, 0.66), cloudLit: rgb(1.0, 0.82, 0.6), cloudShade: rgb(0.72, 0.62, 0.7), light: rgb(1.0, 0.79, 0.54), lightI: 2.0, hemiI: 1.1, lamp: 0.3, night: 0 },
  { p: 0.85, az: -0.2, elev: 0.02, horizon: rgb(1.0, 0.55, 0.30), mid: rgb(0.78, 0.42, 0.52), zenith: rgb(0.16, 0.18, 0.42), sun: rgb(1.0, 0.55, 0.25), deep: rgb(0.05, 0.15, 0.28), shallow: rgb(0.28, 0.38, 0.45), refl: rgb(0.95, 0.50, 0.38), haze: rgb(0.95, 0.52, 0.34), tint: rgb(0.95, 0.62, 0.5), cloudLit: rgb(1.0, 0.6, 0.42), cloudShade: rgb(0.5, 0.36, 0.5), light: rgb(1.0, 0.6, 0.35), lightI: 1.4, hemiI: 0.8, lamp: 0.9, night: 0.1 },
  { p: 1.0, az: -0.25, elev: -0.08, horizon: rgb(0.55, 0.38, 0.52), mid: rgb(0.22, 0.22, 0.42), zenith: rgb(0.04, 0.07, 0.20), sun: rgb(1.0, 0.4, 0.2), deep: rgb(0.02, 0.07, 0.14), shallow: rgb(0.08, 0.16, 0.26), refl: rgb(0.35, 0.30, 0.45), haze: rgb(0.40, 0.30, 0.45), tint: rgb(0.34, 0.32, 0.46), cloudLit: rgb(0.55, 0.42, 0.55), cloudShade: rgb(0.22, 0.2, 0.34), light: rgb(0.5, 0.55, 0.75), lightI: 0.5, hemiI: 0.5, lamp: 1.6, night: 0.9 },
];

function createEnv() {
  const V = () => ({ value: new THREE.Color() });
  const shared = {
    uSunDir: { value: new THREE.Vector3(0.3, 0.3, -1).normalize() },
    uSunCol: V(),
  };
  const sky = { uTime: { value: 0 }, ...shared, uHorizon: V(), uMid: V(), uZenith: V(), uCloudLit: V(), uCloudShade: V(), uNight: { value: 0 } };
  const ocean = { uTime: { value: 0 }, uShore: { value: SHORE_Z }, ...shared, uDeep: V(), uShallow: V(), uRefl: V(), uHaze: V(), uTint: V() };
  const lamp = new THREE.MeshStandardMaterial({ color: "#fff2c9", emissive: new THREE.Color("#ffe6a8"), emissiveIntensity: 0 });
  return { sky, ocean, shared, lamp, night: 0 };
}

const smooth = (t) => t * t * (3 - 2 * t);
const scratchColor = new THREE.Color();

// Blends the two nearest looks for scroll position p and writes the result into every uniform.
function applyLook(env, lights, p) {
  let i = 0;
  while (i < LOOKS.length - 2 && p > LOOKS[i + 1].p) i += 1;
  const a = LOOKS[i];
  const b = LOOKS[i + 1];
  const t = smooth(Math.min(Math.max((p - a.p) / (b.p - a.p), 0), 1));
  const mix = (x, y) => x + (y - x) * t;
  const blend = (target, key) => target.copy(a[key]).lerp(b[key], t);

  env.shared.uSunDir.value.set(mix(a.az, b.az), mix(a.elev, b.elev), -1).normalize();
  blend(env.shared.uSunCol.value, "sun");

  const { sky, ocean } = env;
  blend(sky.uHorizon.value, "horizon");
  blend(sky.uMid.value, "mid");
  blend(sky.uZenith.value, "zenith");
  blend(sky.uCloudLit.value, "cloudLit");
  blend(sky.uCloudShade.value, "cloudShade");
  sky.uNight.value = mix(a.night, b.night);
  env.night = sky.uNight.value;

  blend(ocean.uDeep.value, "deep");
  blend(ocean.uShallow.value, "shallow");
  blend(ocean.uRefl.value, "refl");
  blend(ocean.uHaze.value, "haze");
  blend(ocean.uTint.value, "tint");

  env.lamp.emissiveIntensity = mix(a.lamp, b.lamp);
  if (lights.fog) lights.fog.color.copy(ocean.uHaze.value);
  if (lights.sun) {
    lights.sun.color.copy(blend(scratchColor, "light"));
    lights.sun.intensity = mix(a.lightI, b.lightI);
    lights.sun.position.copy(env.shared.uSunDir.value).multiplyScalar(60);
  }
  if (lights.hemi) lights.hemi.intensity = mix(a.hemiI, b.hemiI);
}

// --- Camera path: along the sand, up onto the pier, then out toward the sunset ---
const CAM_POS = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 2.1, 9.5),
  new THREE.Vector3(2.2, 2.0, 8.6),
  new THREE.Vector3(5.6, 2.5, 7.5),
  new THREE.Vector3(6.9, 3.3, 3),
  new THREE.Vector3(6.9, 3.3, -12),
  new THREE.Vector3(6.9, 3.4, -26),
  new THREE.Vector3(6.9, 3.5, -34),
]);
const CAM_LOOK = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 1.2, -40),
  new THREE.Vector3(6, 1.6, -30),
  new THREE.Vector3(7.5, 2.6, -20),
  new THREE.Vector3(7.2, 3.0, -40),
  new THREE.Vector3(0, 2.4, -60),
  new THREE.Vector3(-8, 2.2, -70),
  new THREE.Vector3(-14, 2.6, -80),
]);

function Sky({ env }) {
  const mat = useRef();
  useFrame(({ clock }) => {
    mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  const uniforms = env.sky;
  return (
    <mesh renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
      <shaderMaterial ref={mat} side={THREE.BackSide} depthWrite={false} uniforms={uniforms} vertexShader={skyVertex} fragmentShader={skyFragment} />
    </mesh>
  );
}

function Ocean({ env, segments }) {
  const mat = useRef();
  useFrame(({ clock }) => {
    mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  const uniforms = env.ocean;
  return (
    // Once rotated flat, the plane runs from z = -160 (far sea) to z = +40 (behind the camera, sand).
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, -60]} frustumCulled={false}>
      <planeGeometry args={[400, 200, segments, Math.round(segments / 2)]} />
      <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={oceanVertex} fragmentShader={oceanFragment} />
    </mesh>
  );
}


// A wooden pier running out into the surf: deck, pilings, railings, lamps and an end building.
const PIER = { x: 7.5, startZ: 7, endZ: -52, deckY: 1.7, width: 2.6 };

function Pier({ lampMaterial }) {
  const length = PIER.startZ - PIER.endZ;
  const midZ = (PIER.startZ + PIER.endZ) / 2;
  const bays = Math.floor(length / 2.4);
  const wood = "#8a6540";
  const darkWood = "#4a3524";

  const posts = useMemo(() => {
    const list = [];
    for (let i = 0; i <= bays; i += 1) list.push(PIER.startZ - i * (length / bays));
    return list;
  }, [bays, length]);

  return (
    <group position={[PIER.x, 0, 0]}>
      {/* Deck */}
      <mesh position={[0, PIER.deckY, midZ]}>
        <boxGeometry args={[PIER.width, 0.16, length]} />
        <meshStandardMaterial color={wood} roughness={0.9} />
      </mesh>
      {/* Cross beams under the deck */}
      {posts.map((z) => (
        <mesh key={`beam-${z}`} position={[0, PIER.deckY - 0.24, z]}>
          <boxGeometry args={[PIER.width + 0.3, 0.14, 0.2]} />
          <meshStandardMaterial color={darkWood} roughness={1} />
        </mesh>
      ))}
      {/* Pilings, in pairs, running from the sea floor up to the deck */}
      {posts.flatMap((z) =>
        [-1, 1].map((side) => (
          <mesh key={`pile-${z}-${side}`} position={[side * (PIER.width / 2 - 0.15), (PIER.deckY - 2.2) / 2, z]}>
            <cylinderGeometry args={[0.13, 0.15, PIER.deckY + 2.2, 8]} />
            <meshStandardMaterial color={darkWood} roughness={1} />
          </mesh>
        )),
      )}
      {/* Railings and lamps */}
      {[-1, 1].map((side) => (
        <group key={`rail-${side}`} position={[side * (PIER.width / 2 - 0.05), PIER.deckY, 0]}>
          <mesh position={[0, 0.95, midZ]}>
            <boxGeometry args={[0.07, 0.07, length]} />
            <meshStandardMaterial color={wood} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.5, midZ]}>
            <boxGeometry args={[0.04, 0.04, length]} />
            <meshStandardMaterial color={wood} roughness={0.9} />
          </mesh>
          {posts.map((z) => (
            <mesh key={`post-${z}`} position={[0, 0.5, z]}>
              <boxGeometry args={[0.08, 1.0, 0.08]} />
              <meshStandardMaterial color={wood} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {posts
        .filter((_, i) => i % 3 === 0)
        .map((z) => (
          <group key={`lamp-${z}`} position={[0, PIER.deckY, z]}>
            <mesh position={[0, 1.4, 0]}>
              <cylinderGeometry args={[0.04, 0.05, 2.8, 6]} />
              <meshStandardMaterial color="#2c2c30" roughness={0.6} />
            </mesh>
            <mesh position={[0, 2.85, 0]} material={lampMaterial}>
              <sphereGeometry args={[0.16, 12, 8]} />
            </mesh>
          </group>
        ))}
      {/* Building and widened platform at the end of the pier */}
      <mesh position={[0, PIER.deckY, PIER.endZ - 4]}>
        <boxGeometry args={[8, 0.16, 9]} />
        <meshStandardMaterial color={wood} roughness={0.9} />
      </mesh>
      {[-3.4, 3.4].flatMap((x) =>
        [-3.4, 3.4].map((dz) => (
          <mesh key={`end-pile-${x}-${dz}`} position={[x, (PIER.deckY - 2.2) / 2, PIER.endZ - 4 + dz]}>
            <cylinderGeometry args={[0.16, 0.18, PIER.deckY + 2.2, 8]} />
            <meshStandardMaterial color={darkWood} roughness={1} />
          </mesh>
        )),
      )}
      <mesh position={[0, PIER.deckY + 1.5, PIER.endZ - 4]}>
        <boxGeometry args={[5.2, 3, 5.2]} />
        <meshStandardMaterial color="#e9dcc3" roughness={0.85} />
      </mesh>
      <mesh position={[0, PIER.deckY + 3.55, PIER.endZ - 4]} rotation-y={Math.PI / 4}>
        <coneGeometry args={[4.3, 1.5, 4]} />
        <meshStandardMaterial color="#b4523a" roughness={0.8} />
      </mesh>
    </group>
  );
}

// --- Palm trees: a bent trunk and drooping fronds, built from a handful of shapes each ---
function makeFrondGeometry(length, width) {
  const rows = 8;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= rows; i += 1) {
    const t = i / rows;
    const w = Math.sin(Math.PI * (t * 0.92 + 0.04)) * width;
    const y = -t * t * length * 0.5;
    pos.push(-w, y, t * length, w, y, t * length);
    if (i < rows) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function Palm({ position, scale = 1, lean = 0.2, phase = 0 }) {
  const crown = useRef();
  const trunk = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean * 0.4, 1.6, 0),
      new THREE.Vector3(lean * 1.2, 3.2, 0),
      new THREE.Vector3(lean * 2.2, 4.6, 0),
    ]);
    return { geo: new THREE.TubeGeometry(curve, 10, 0.13, 7, false), top: curve.getPoint(1) };
  }, [lean]);
  const frond = useMemo(() => makeFrondGeometry(2.3, 0.3), []);
  const fronds = useMemo(() => Array.from({ length: 9 }, (_, i) => ({ yaw: (i / 9) * Math.PI * 2 + i * 0.3, tilt: 0.25 + (i % 3) * 0.1 })), []);

  useFrame(({ clock }) => {
    if (crown.current) crown.current.rotation.z = Math.sin(clock.elapsedTime * 0.8 + phase) * 0.03;
  });

  return (
    <group position={position} scale={scale}>
      <mesh geometry={trunk.geo}>
        <meshStandardMaterial color="#7b5b3d" roughness={1} />
      </mesh>
      <group ref={crown} position={trunk.top}>
        {fronds.map((f, i) => (
          <group key={i} rotation={[0, f.yaw, 0]}>
            <mesh geometry={frond} rotation={[-f.tilt, 0, 0]}>
              <meshStandardMaterial color={i % 2 ? "#3f8a3d" : "#2f7a35"} roughness={0.8} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -0.12, 0]}>
          <sphereGeometry args={[0.2, 8, 6]} />
          <meshStandardMaterial color="#5a4128" roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

// --- Seagulls: a few birds circling over the water, wings flapping ---
const GULLS = [
  { cx: -2, cz: -18, r: 9, y: 6.2, speed: 0.22, phase: 0 },
  { cx: 4, cz: -26, r: 12, y: 8.0, speed: 0.17, phase: 2 },
  { cx: -6, cz: -14, r: 6, y: 4.6, speed: 0.3, phase: 4 },
  { cx: 1, cz: -34, r: 14, y: 9.5, speed: 0.14, phase: 1 },
  { cx: -9, cz: -24, r: 8, y: 7.2, speed: 0.2, phase: 5 },
];

function Gulls({ env }) {
  const birds = useRef([]);
  const wingGeo = useMemo(() => {
    // One wing as a swept triangle strip; the mirrored wing reuses it with a negative scale.
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.18, 0, 0, 0.22, 1.1, 0.05, 0.25], 3));
    geo.setIndex([0, 1, 2]);
    geo.computeVertexNormals();
    return geo;
  }, []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    birds.current.forEach((bird, i) => {
      if (!bird) return;
      const g = GULLS[i];
      const a = t * g.speed + g.phase;
      bird.position.set(g.cx + Math.cos(a) * g.r, g.y + Math.sin(a * 2.3) * 0.5, g.cz + Math.sin(a) * g.r * 0.6);
      bird.rotation.y = -a + Math.PI; // face the direction of travel
      bird.visible = env.night < 0.5;
      const flap = Math.sin(t * 5.5 + g.phase * 3) * 0.55;
      bird.children[1].rotation.z = flap;
      bird.children[2].rotation.z = -flap;
    });
  });

  return (
    <group>
      {GULLS.map((g, i) => (
        <group key={i} ref={(el) => { birds.current[i] = el; }} scale={0.9}>
          <mesh scale={[0.35, 0.16, 0.16]}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.55} roughness={0.9} />
          </mesh>
          <mesh geometry={wingGeo}>
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.45} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
          <mesh geometry={wingGeo} scale={[-1, 1, 1]}>
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.45} roughness={0.9} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// --- Pier reflection: soft dark streaks on the water under the pier, wobbling with the swell ---
const reflectionVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const reflectionFragment = /* glsl */ `
  uniform float uTime;
  uniform float uHalfWidth;
  uniform float uLength;
  varying vec2 vUv;
  ${NOISE}
  void main() {
    float x = (vUv.x - 0.5) * 2.0 * uHalfWidth; // metres from the pier centre line
    float along = vUv.y * uLength;              // metres along the pier from the beach end
    float wob = (noise(vec2(along * 1.6, uTime * 0.7)) - 0.5) * 0.35 + sin(along * 0.9 - uTime * 1.4) * 0.08;
    float pile = 1.15;
    float streaks = exp(-pow((x - pile + wob) / 0.17, 2.0)) + exp(-pow((x + pile + wob) / 0.17, 2.0));
    float deck = exp(-pow((x + wob * 0.6) / 1.3, 2.0)) * 0.45;
    float breakup = smoothstep(0.25, 0.75, noise(vec2(x * 3.0, along * 0.8 - uTime * 0.5)));
    float fade = smoothstep(0.0, 0.08, vUv.y) * (1.0 - smoothstep(0.55, 1.0, vUv.y));
    float a = (streaks * 0.5 + deck * 0.5) * (0.5 + 0.5 * breakup) * fade;
    gl_FragColor = vec4(vec3(0.02, 0.10, 0.16), a * 0.55);
    #include <colorspace_fragment>
  }
`;

function PierReflection() {
  const mat = useRef();
  const length = PIER.startZ - PIER.endZ - 4;
  useFrame(({ clock }) => {
    mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uHalfWidth: { value: 3 }, uLength: { value: length } }), [length]);
  return (
    <mesh rotation-x={-Math.PI / 2} position={[PIER.x, 0.35, 1.5 - length / 2]} renderOrder={2} frustumCulled={false}>
      <planeGeometry args={[6, length]} />
      <shaderMaterial ref={mat} transparent depthWrite={false} uniforms={uniforms} vertexShader={reflectionVertex} fragmentShader={reflectionFragment} />
    </mesh>
  );
}

function Rig({ env, lights }) {
  const { camera } = useThree();
  const pointer = useRef({ x: 0, y: 0 });
  const eased = useRef({ x: 0, y: 0, p: 0 });
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const onMove = (e) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  useFrame((_, delta) => {
    const scrollable = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    const target = Math.min(Math.max(window.scrollY / scrollable, 0), 1);
    const k = 1 - Math.pow(0.002, delta);
    eased.current.x += (pointer.current.x - eased.current.x) * k * 0.6;
    eased.current.y += (pointer.current.y - eased.current.y) * k * 0.6;
    eased.current.p += (target - eased.current.p) * k * 0.9;
    const { x, y, p } = eased.current;

    CAM_POS.getPoint(p, pos);
    CAM_LOOK.getPoint(p, look);
    camera.position.set(pos.x + x * 0.35, pos.y - y * 0.12, pos.z);
    camera.lookAt(look.x + x * 3.0, look.y - y * 0.5, look.z);

    applyLook(env, lights.current, p);
  });
  return null;
}

function hasWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function BeachScene() {
  const [ready, setReady] = useState(false);
  const [supported] = useState(() => hasWebGL());
  const env = useMemo(() => createEnv(), []);
  const lights = useRef({});
  const small = typeof window !== "undefined" && window.innerWidth < 760;

  // Tells the page stylesheet that the scene is running so it can switch to the "story" layout.
  useEffect(() => {
    if (!ready) return undefined;
    document.body.classList.add("scene-on");
    return () => document.body.classList.remove("scene-on");
  }, [ready]);

  if (!supported) return null;

  return (
    <div className={`bg-scene${ready ? " is-ready" : ""}`} aria-hidden="true">
      <Canvas
        dpr={[1, small ? 1.25 : 1.75]}
        camera={{ fov: 58, near: 0.1, far: 1000, position: [0, 2.1, 9.5] }}
        gl={{ antialias: !small, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }}
        onCreated={() => requestAnimationFrame(() => setReady(true))}
      >
        <fog ref={(f) => { lights.current.fog = f; }} attach="fog" args={[0xcce6f7, 45, 150]} />
        <hemisphereLight ref={(l) => { lights.current.hemi = l; }} args={["#bfe0ff", "#d9c29a", 1.5]} />
        <directionalLight ref={(l) => { lights.current.sun = l; }} position={[18, 18, -60]} intensity={2.4} color="#fff1d6" />
        <Sky env={env} />
        <Pier lampMaterial={env.lamp} />
        <PierReflection />
        <Palm position={[2.7, 0, 4.2]} scale={0.5} lean={0.3} phase={0} />
        <Palm position={[4.1, 0, 3.8]} scale={0.38} lean={-0.25} phase={1.7} />
        <Gulls env={env} />
        <Ocean env={env} segments={small ? 128 : 256} />
        <Rig env={env} lights={lights} />
      </Canvas>
    </div>
  );
}
