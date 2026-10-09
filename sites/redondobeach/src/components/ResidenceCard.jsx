import { Link } from "react-router-dom";
import PhotoImage from "./PhotoImage.jsx";
import { resizePhoto } from "../lib/residences.js";
import { SITE } from "../data/content.js";

export default function ResidenceCard({ residence, loading = false }) {
  const cover = residence.photos[0];
  return (
    <article className="residence-card">
      <Link to={`/residences/${residence.slug}`} className="residence-card__media" aria-label={`View ${residence.title}`}>
        {cover ? (
          <PhotoImage key={cover} src={resizePhoto(cover, 800)} alt={`${residence.title} living area`} />
        ) : loading ? (
          <span className="photo photo--loading" aria-busy="true">
            <span className="photo__spinner" role="status" aria-label="Loading photo" />
          </span>
        ) : (
          <div className="residence-card__placeholder" aria-hidden="true">OneLuxStay</div>
        )}
        <span className="residence-card__badge">{SITE.minNights}+ nights</span>
      </Link>
      <div className="residence-card__body">
        <p className="eyebrow">{residence.building.name} &middot; Redondo Beach</p>
        <h3><Link to={`/residences/${residence.slug}`}>{residence.name}</Link></h3>
        <ul className="facts">
          <li>{residence.bedrooms} bed</li>
          <li>{residence.bathrooms} bath</li>
          <li>Sleeps {residence.sleeps}</li>
        </ul>
        {residence.amenities.length > 0 && (
          <p className="residence-card__amenities">{residence.amenities.slice(0, 4).join(" · ")}</p>
        )}
        <div className="residence-card__footer">
          <span className="residence-card__price">{SITE.monthlyRange}</span>
          <Link to={`/residences/${residence.slug}`} className="link-arrow">View residence</Link>
        </div>
      </div>
    </article>
  );
}
