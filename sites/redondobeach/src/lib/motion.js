// Page motion for the Redondo Beach site, built on anime.js (v4).
// Everything is wired up by selector so pages stay plain markup. Nothing runs (and nothing is
// hidden) when the visitor prefers reduced motion.
import { animate, createTimeline, onScroll, splitText, stagger, svg, utils } from "animejs";

const REVEAL = [
  ".section__head",
  ".info-card",
  ".place-card",
  ".residence-card",
  ".explore-tile",
  ".tick-list li",
  ".steps li",
  ".faq details",
  ".panel",
  ".booking-card",
  ".split > div",
].join(",");

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function initMotion(root = document) {
  if (prefersReducedMotion()) return () => {};

  const revertibles = [];
  const track = (item) => {
    revertibles.push(item);
    return item;
  };

  // --- Hero: headline words rise in, supporting copy follows, background drifts on scroll ---
  const hero = root.querySelector(".hero");
  const heroTitle = hero?.querySelector("h1");
  if (hero && heroTitle) {
    const split = track(splitText(heroTitle, { words: { wrap: "clip" } }));
    const intro = track(createTimeline({ defaults: { ease: "outExpo" } }));
    utils.set(hero.querySelectorAll(".eyebrow, .hero__lead, .hero__actions > *"), { opacity: 0 });
    intro
      .add(hero.querySelector(".eyebrow"), { opacity: [0, 1], translateY: [16, 0], duration: 700 })
      .add(split.words, { translateY: ["110%", "0%"], duration: 1100, delay: stagger(70) }, "-=450")
      .add(hero.querySelector(".hero__lead"), { opacity: [0, 1], translateY: [20, 0], duration: 800 }, "-=700")
      .add(hero.querySelectorAll(".hero__actions > *"), { opacity: [0, 1], translateY: [20, 0], duration: 700, delay: stagger(110) }, "-=550");

    track(
      animate(hero, {
        backgroundPositionY: ["50%", "85%"],
        ease: "linear",
        autoplay: onScroll({ target: hero, enter: "top top", leave: "bottom top", sync: true }),
      }),
    );
  }

  // --- Header settles in once per page load ---
  const header = root.querySelector(".site-header");
  if (header && !header.dataset.motion) {
    header.dataset.motion = "1";
    track(animate(header, { opacity: [0, 1], translateY: [-16, 0], duration: 800, ease: "outCubic" }));
  }

  // --- Facts bar: leading numbers count up ---
  root.querySelectorAll(".facts-bar__value").forEach((el) => {
    const match = el.textContent.match(/^(\d+)(.*)$/);
    if (!match || el.dataset.motion) return;
    el.dataset.motion = "1";
    const [, target, rest] = match;
    const counter = { value: 0 };
    el.style.fontVariantNumeric = "tabular-nums";
    el.textContent = `0${rest}`;
    track(
      animate(counter, {
        value: Number(target),
        duration: 1400,
        ease: "outExpo",
        modifier: utils.round(0),
        onUpdate: () => { el.textContent = `${counter.value}${rest}`; },
        autoplay: onScroll({ target: el, enter: "bottom-=40 top" }),
      }),
    );
  });

  // --- Steps: the connector line draws as you scroll, numbers pop in ---
  const stepsLine = root.querySelector(".steps__line path");
  const steps = root.querySelector(".steps");
  if (stepsLine && steps && !steps.dataset.motion) {
    steps.dataset.motion = "1";
    track(
      animate(svg.createDrawable(stepsLine), {
        draw: ["0 0", "0 1"],
        ease: "linear",
        autoplay: onScroll({ target: steps, enter: "bottom-=120 top", leave: "top+=240 bottom", sync: 0.4 }),
      }),
    );
  }

  // --- Scroll reveals for everything else, staggered within each row ---
  const seen = new WeakSet();
  const io = new IntersectionObserver(
    (entries) => {
      const visible = entries.filter((e) => e.isIntersecting);
      visible.forEach((entry, i) => {
        io.unobserve(entry.target);
        track(
          animate(entry.target, {
            opacity: [0, 1],
            translateY: [32, 0],
            duration: 900,
            delay: i * 90,
            ease: "outCubic",
          }),
        );
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );

  const register = () => {
    root.querySelectorAll(REVEAL).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      el.style.opacity = "0";
      io.observe(el);
    });
  };
  register();

  // Residence cards arrive after the listings request resolves, so watch for late additions.
  const main = root.querySelector("#main") || root.body || root;
  const mo = new MutationObserver(register);
  mo.observe(main, { childList: true, subtree: true });

  return () => {
    mo.disconnect();
    io.disconnect();
    revertibles.forEach((item) => item.revert?.());
  };
}
