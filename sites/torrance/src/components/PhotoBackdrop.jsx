import { useEffect, useRef } from "react";

// Coastal photos as a fixed backdrop. Scrolling pushes the camera in, cross-fades from the
// golden surf to the open beach, and grades the daylight photos through golden hour, sunset and dusk.
const BEACH = "/images/torrance-waves.jpg";
const SECOND = "/images/torrance-coast.jpg";

// Grade keyframes by scroll progress. tint = multiply colour (top, bottom), glow = screen colour at the
// horizon, dim = brightness of the photo, night = navy wash, stars = star opacity.
const LOOKS = [
  { p: 0.0, tintA: [255, 255, 255], tintB: [255, 255, 255], glow: 0.0, dim: 1.0, sat: 1.0, night: 0.0, stars: 0.0 },
  { p: 0.3, tintA: [255, 246, 232], tintB: [255, 240, 220], glow: 0.0, dim: 1.0, sat: 1.03, night: 0.0, stars: 0.0 },
  { p: 0.62, tintA: [255, 196, 130], tintB: [255, 220, 170], glow: 0.35, dim: 0.96, sat: 1.12, night: 0.0, stars: 0.0 },
  { p: 0.85, tintA: [255, 128, 112], tintB: [255, 176, 130], glow: 0.7, dim: 0.78, sat: 1.15, night: 0.12, stars: 0.0 },
  { p: 1.0, tintA: [60, 72, 150], tintB: [96, 96, 140], glow: 0.35, dim: 0.5, sat: 0.85, night: 0.5, stars: 1.0 },
];

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const mixRgb = (a, b, t) => a.map((v, i) => Math.round(mix(v, b[i], t)));
const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

function look(p) {
  let i = 0;
  while (i < LOOKS.length - 2 && p > LOOKS[i + 1].p) i += 1;
  const a = LOOKS[i];
  const b = LOOKS[i + 1];
  const t = smooth(a.p, b.p, p);
  return {
    tintA: mixRgb(a.tintA, b.tintA, t),
    tintB: mixRgb(a.tintB, b.tintB, t),
    glow: mix(a.glow, b.glow, t),
    dim: mix(a.dim, b.dim, t),
    sat: mix(a.sat, b.sat, t),
    night: mix(a.night, b.night, t),
    stars: mix(a.stars, b.stars, t),
  };
}

// Deterministic star field so it does not jump between renders.
const STARS = Array.from({ length: 70 }, (_, i) => {
  const r = (n) => { const x = Math.sin(i * 91.7 + n * 17.3) * 43758.5453; return x - Math.floor(x); };
  return { x: r(1) * 100, y: r(2) * 42, s: 1 + r(3) * 1.6, o: 0.4 + r(4) * 0.6 };
});

export default function PhotoBackdrop() {
  const root = useRef(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    document.body.classList.add("scene-on");

    let target = 0;
    let shown = -1;
    let mx = 0;
    let my = 0;
    let sx = 0;
    let sy = 0;
    let raf = 0;
    let running = true;

    const readScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      target = max > 0 ? clamp(window.scrollY / max) : 0;
    };
    const onMouse = (e) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
    };

    const frame = () => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      sx += (mx - sx) * 0.05;
      sy += (my - sy) * 0.05;
      const next = shown < 0 ? target : shown + (target - shown) * 0.08;
      if (Math.abs(next - shown) < 0.00005 && Math.abs(mx - sx) < 0.0005 && Math.abs(my - sy) < 0.0005) return;
      shown = next;
      const g = look(shown);
      const fade = smooth(0.14, 0.4, shown);
      const zoom = 1.06 + shown * 0.16;
      const style = el.style;
      style.setProperty("--pb-fade", fade.toFixed(4));
      style.setProperty("--pb-tx", `${(-sx * 22).toFixed(2)}px`);
      style.setProperty("--pb-ty", `${(-sy * 14 - shown * 36).toFixed(2)}px`);
      style.setProperty("--pb-zoom", zoom.toFixed(4));
      style.setProperty("--pb-filter", `brightness(${g.dim.toFixed(3)}) saturate(${g.sat.toFixed(3)})`);
      style.setProperty("--pb-tint-a", rgb(g.tintA));
      style.setProperty("--pb-tint-b", rgb(g.tintB));
      style.setProperty("--pb-glow", g.glow.toFixed(3));
      style.setProperty("--pb-night", g.night.toFixed(3));
      style.setProperty("--pb-stars", g.stars.toFixed(3));
    };

    const onVisibility = () => {
      const visible = !document.hidden;
      if (visible && !running) { running = true; raf = requestAnimationFrame(frame); }
      if (!visible) { running = false; cancelAnimationFrame(raf); }
    };

    readScroll();
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("resize", readScroll);
    window.addEventListener("pointermove", onMouse, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    const ro = new ResizeObserver(readScroll);
    ro.observe(document.body);
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", readScroll);
      window.removeEventListener("resize", readScroll);
      window.removeEventListener("pointermove", onMouse);
      document.removeEventListener("visibilitychange", onVisibility);
      document.body.classList.remove("scene-on");
    };
  }, []);

  return (
    <div className="bg-scene bg-photo is-ready" ref={root} aria-hidden="true">
      <div className="bg-photo__stack">
        <img className="bg-photo__img" src={BEACH} alt="" decoding="async" />
        <img className="bg-photo__img bg-photo__img--second" src={SECOND} alt="" decoding="async" />
      </div>
      <div className="bg-photo__tint" />
      <div className="bg-photo__glow" />
      <div className="bg-photo__night" />
      <div className="bg-photo__stars">
        {STARS.map((s, i) => (
          <span key={i} style={{ left: `${s.x}%`, top: `${s.y}%`, width: s.s, height: s.s, opacity: s.o }} />
        ))}
      </div>
    </div>
  );
}
