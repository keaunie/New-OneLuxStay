// 3D hero: a sunny Redondo Beach shoreline rendered with Three.js (via React Three Fiber).
// Ocean, sand, sky, clouds and sun are all procedural shaders, so there are no model or texture
// downloads. The camera drifts with the mouse and moves down the beach as you scroll.
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
  varying vec3 vDir;
  ${NOISE}
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 horizon = vec3(0.80, 0.90, 0.97);
    vec3 mid = vec3(0.30, 0.62, 0.92);
    vec3 zenith = vec3(0.05, 0.28, 0.70);
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
    col = mix(col, zenith, smoothstep(0.18, 0.85, h));

    float sd = max(dot(dir, uSunDir), 0.0);
    col += vec3(1.0, 0.84, 0.55) * pow(sd, 10.0) * 0.18;
    col += vec3(1.0, 0.92, 0.72) * pow(sd, 70.0) * 0.7;
    col = mix(col, vec3(1.0, 0.98, 0.92), smoothstep(0.9990, 0.9995, sd));

    // Clouds: project the view ray onto a plane overhead and drift it with the wind.
    if (dir.y > 0.01) {
      vec2 uv = dir.xz / (dir.y + 0.25) * 1.6 + vec2(uTime * 0.012, 0.0);
      float c = fbm(uv * 1.4);
      float cover = smoothstep(0.58, 0.82, c) * smoothstep(0.0, 0.22, dir.y);
      float shade = fbm(uv * 1.4 + uSunDir.xz * 0.35);
      vec3 cloud = mix(vec3(0.80, 0.86, 0.94), vec3(1.0, 0.99, 0.96), smoothstep(0.35, 0.8, shade));
      cloud += vec3(1.0, 0.85, 0.6) * pow(sd, 8.0) * 0.25;
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
  varying vec3 vWorld;
  varying float vHeight;
  ${NOISE}
  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (n.y < 0.0) n = -n;

    // Fine ripples perturb the normal so sun glitter breaks up.
    vec2 rp = vWorld.xz * 1.7 + vec2(uTime * 0.25, uTime * 0.18);
    n = normalize(n + vec3(noise(rp) - 0.5, 0.0, noise(rp + 7.3) - 0.5) * 0.35);

    // The shoreline wobbles along the beach and swells in and out like surf.
    float shoreZ = uShore + sin(uTime * 0.55 + vWorld.x * 0.12) * 0.7 + sin(uTime * 0.9 + vWorld.x * 0.31) * 0.25;
    float d = shoreZ - vWorld.z; // metres of water in front of the sand line

    vec3 deep = vec3(0.02, 0.28, 0.46);
    vec3 shallow = vec3(0.13, 0.72, 0.74);
    vec3 water = mix(deep, shallow, smoothstep(-26.0, uShore, vWorld.z));

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
    vec3 skyRefl = mix(vec3(0.85, 0.90, 0.92), vec3(0.45, 0.72, 0.93), 0.45);
    vec3 col = mix(water, skyRefl, clamp(fres * 0.85 + 0.06, 0.0, 1.0));

    vec3 r = reflect(-viewDir, n);
    float sd = max(dot(r, uSunDir), 0.0);
    col += vec3(1.0, 0.93, 0.78) * pow(sd, 260.0) * 2.2;
    col += vec3(1.0, 0.85, 0.6) * pow(sd, 28.0) * 0.28;

    // Foam on wave crests.
    float crest = smoothstep(0.28, 0.56, vHeight + (noise(vWorld.xz * 1.2 + uTime * 0.2) - 0.5) * 0.22);
    col = mix(col, vec3(0.97, 0.99, 1.0), crest * 0.55);

    vec3 haze = vec3(0.80, 0.90, 0.97);
    float dist = length(cameraPosition - vWorld);

    if (d > 0.0) {
      // Foam wash and the trailing lines left by each wave.
      float band = smoothstep(0.0, 0.25, d) * smoothstep(1.1, 0.35, d);
      float lace = noise(vWorld.xz * 3.2 + uTime * 0.3);
      col = mix(col, vec3(1.0), band * (0.55 + 0.45 * lace));
      float lines = smoothstep(0.72, 0.9, sin(d * 3.3 - uTime * 0.9) * 0.5 + 0.5) * smoothstep(5.5, 1.0, d) * smoothstep(0.9, 2.0, d);
      col = mix(col, vec3(0.95, 0.99, 1.0), lines * 0.35 * lace);
      col = mix(col, shallow * 1.1, smoothstep(2.8, 0.2, d) * 0.25);
    } else {
      // Dry and damp sand.
      float grain = noise(vWorld.xz * 14.0) * 0.5 + noise(vWorld.xz * 40.0) * 0.5;
      vec3 sand = mix(vec3(0.93, 0.78, 0.54), vec3(1.0, 0.90, 0.68), grain);
      float wet = smoothstep(-2.6, 0.0, d);
      sand = mix(sand, sand * vec3(0.74, 0.66, 0.56), wet);
      sand += vec3(1.0, 0.95, 0.85) * wet * pow(sd, 18.0) * 0.12;
      float rim = smoothstep(0.0, -0.18, d) * smoothstep(-0.5, -0.05, d);
      col = mix(sand, vec3(1.0), rim * 0.45);
    }

    col = mix(col, haze, clamp((dist - 45.0) / 110.0, 0.0, 1.0) * 0.5);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

function Sky({ sunDir }) {
  const mat = useRef();
  useFrame(({ clock }) => {
    mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uSunDir: { value: sunDir } }), [sunDir]);
  return (
    <mesh renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[400, 32, 16]} />
      <shaderMaterial ref={mat} side={THREE.BackSide} depthWrite={false} uniforms={uniforms} vertexShader={skyVertex} fragmentShader={skyFragment} />
    </mesh>
  );
}

function Ocean({ sunDir, segments }) {
  const mat = useRef();
  useFrame(({ clock }) => {
    mat.current.uniforms.uTime.value = clock.elapsedTime;
  });
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uShore: { value: SHORE_Z }, uSunDir: { value: sunDir } }), [sunDir]);
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

function Pier() {
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
            <mesh position={[0, 2.85, 0]}>
              <sphereGeometry args={[0.16, 12, 8]} />
              <meshStandardMaterial color="#fff2c9" emissive="#ffe6a8" emissiveIntensity={0.9} />
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

function Gulls() {
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

function Rig({ heroRef }) {
  const { camera } = useThree();
  const pointer = useRef({ x: 0, y: 0 });
  const eased = useRef({ x: 0, y: 0, p: 0 });
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
    const hero = heroRef.current;
    const height = hero ? hero.offsetHeight : window.innerHeight;
    const target = Math.min(Math.max(window.scrollY / height, 0), 1);
    const k = 1 - Math.pow(0.001, delta);
    eased.current.x += (pointer.current.x - eased.current.x) * k * 0.6;
    eased.current.y += (pointer.current.y - eased.current.y) * k * 0.6;
    eased.current.p += (target - eased.current.p) * k;
    const { x, y, p } = eased.current;

    // Walk down the beach toward the surf, lift the gaze to the sky as you scroll.
    camera.position.set(x * 1.4, 2.1 - p * 1.0 - y * 0.15, 9.5 - p * 4.5);
    look.set(x * 3.0, 1.2 + p * 5.5 - y * 0.6, -40);
    camera.lookAt(look);
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
  const wrapRef = useRef(null);
  const heroRef = useRef(null);
  const [active, setActive] = useState(true);
  const [ready, setReady] = useState(false);
  const [supported] = useState(() => hasWebGL());
  const sunDir = useMemo(() => new THREE.Vector3(0.30, 0.30, -1).normalize(), []);
  const small = typeof window !== "undefined" && window.innerWidth < 760;

  useEffect(() => {
    heroRef.current = wrapRef.current?.parentElement ?? null;
    const io = new IntersectionObserver(([entry]) => setActive(entry.isIntersecting), { threshold: 0 });
    if (wrapRef.current) io.observe(wrapRef.current);
    return () => io.disconnect();
  }, [supported]);

  if (!supported) return null;

  return (
    <div ref={wrapRef} className={`hero__canvas${ready ? " is-ready" : ""}`} aria-hidden="true">
      <Canvas
        frameloop={active ? "always" : "never"}
        dpr={[1, small ? 1.25 : 1.75]}
        camera={{ fov: 58, near: 0.1, far: 1000, position: [0, 2.1, 9.5] }}
        gl={{ antialias: !small, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }}
        onCreated={() => requestAnimationFrame(() => setReady(true))}
      >
        <fog attach="fog" args={[new THREE.Color().setRGB(0.8, 0.9, 0.97, THREE.LinearSRGBColorSpace), 45, 150]} />
        <hemisphereLight args={["#bfe0ff", "#d9c29a", 1.5]} />
        <directionalLight position={[sunDir.x * 60, sunDir.y * 60, sunDir.z * 60]} intensity={2.4} color="#fff1d6" />
        <Sky sunDir={sunDir} />
        <Pier />
        <PierReflection />
        <Palm position={[2.7, 0, 4.2]} scale={0.5} lean={0.3} phase={0} />
        <Palm position={[4.1, 0, 3.8]} scale={0.38} lean={-0.25} phase={1.7} />
        <Gulls />
        <Ocean sunDir={sunDir} segments={small ? 128 : 256} />
        <Rig heroRef={heroRef} />
      </Canvas>
    </div>
  );
}
