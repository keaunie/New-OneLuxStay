import { Link } from "react-router-dom";
import PhotoImage from "./PhotoImage.jsx";
import { resizePhoto } from "../lib/residences.js";
import { SITE } from "../data/content.js";

const MAX_CARDS = 3;

// All of the homes at a glance in the hero, so guests see every unit as soon as the page opens.
// Wide screens: a column beside the headline. Smaller screens: a swipeable row under the buttons.
export default function HeroCards({ residences }) {
  const cards = residences.slice(0, MAX_CARDS);
  if (!cards.length) return null;

  return (
    <div className="hero-cards" role="group" aria-label="Our residences">
      {cards.map((residence) => {
        const cover = residence.photos[0];
        return (
          <Link
            key={residence.slug}
            to={`/residences/${residence.slug}`}
            className="hero-card"
            aria-label={`View ${residence.title}`}
          >
            <span className="hero-card__media">
              {cover ? (
                <PhotoImage key={cover} src={resizePhoto(cover, 800)} alt="" eager />
              ) : (
                <span className="hero-card__placeholder">OneLuxStay</span>
              )}
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
