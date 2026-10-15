import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PhotoImage from "./PhotoImage.jsx";
import { resizePhoto } from "../lib/residences.js";
import { prefersReducedMotion } from "../lib/motion.js";
import { SITE } from "../data/content.js";

const SHUFFLE_MS = 3800;
const LEAVE_MS = 520;
const MAX_CARDS = 5;

// A stack of the residences in the empty right side of the hero. Every few seconds the top card
// slides off and drops to the back of the pile. Pauses on hover/focus; stays still when the visitor
// prefers reduced motion. Hidden on small screens (see .hero-cards in styles.css).
export default function HeroCards({ residences }) {
  const cards = residences.slice(0, MAX_CARDS);
  const count = cards.length;
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState(null);
  const [paused, setPaused] = useState(false);
  const activeRef = useRef(0);
  const leaveTimer = useRef(null);

  useEffect(() => {
    if (count < 2 || paused || prefersReducedMotion()) return undefined;
    const tick = setInterval(() => {
      const current = activeRef.current;
      const next = (current + 1) % count;
      activeRef.current = next;
      setLeaving(current);
      setActive(next);
      clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(() => setLeaving(null), LEAVE_MS);
    }, SHUFFLE_MS);
    return () => clearInterval(tick);
  }, [count, paused]);

  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  if (!count) return null;

  return (
    <div
      className="hero-cards"
      role="group"
      aria-label="Featured residences"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {cards.map((residence, index) => {
        const position = (index - active + count) % count;
        const cover = residence.photos[0];
        const isTop = position === 0;
        return (
          <Link
            key={residence.slug}
            to={`/residences/${residence.slug}`}
            className={`hero-card${index === leaving ? " is-leaving" : ""}`}
            data-pos={Math.min(position, 3)}
            style={{ zIndex: count - position }}
            tabIndex={isTop ? 0 : -1}
            aria-hidden={isTop ? undefined : true}
            aria-label={`View ${residence.title}`}
          >
            <span className="hero-card__media">
              {cover ? (
                <PhotoImage key={cover} src={resizePhoto(cover, 800)} alt="" eager={index < 2} />
              ) : (
                <span className="hero-card__placeholder">OneLuxStay</span>
              )}
              <span className="hero-card__badge">{SITE.minNights}+ nights</span>
            </span>
            <span className="hero-card__body">
              <span className="hero-card__eyebrow">{residence.building.name}</span>
              <span className="hero-card__title">1-Bedroom Residence</span>
              <span className="hero-card__price">{SITE.monthlyStarts}</span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
