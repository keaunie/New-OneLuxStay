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
        <Sky sunDir={sunDir} />
        <Ocean sunDir={sunDir} segments={small ? 128 : 256} />
        <Rig heroRef={heroRef} />
      </Canvas>
    </div>
  );
}
