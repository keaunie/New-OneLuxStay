import { Link } from "react-router-dom";
import "./ChromaGrid.css";
import { trackGuestCityClick } from "../utils/guestAnalytics";

const optimizeChromaImage = (url, width = 900) => {
  if (!url) return "";
  const value = String(url);
  const marker = "/image/upload/";
  if (value.includes("assets.guesty.com") && value.includes(marker)) {
    if (/\/image\/upload\/(?:[^/]*,)?(?:f_|q_|w_)/.test(value)) return value;
    return value.replace(marker, `${marker}f_auto,q_auto:good,w_${width}/`);
  }
  return value;
};

const DEFAULT_ITEMS = [
  {
    title: "Los Angeles",
    subtitle: "Skyline penthouses",
    href: "/losangeles",
    image:
      "https://assets.guesty.com/image/upload/v1729697715/production/666b3af27fc6d5653142b0af/t9xacjoibl7vpywhi6jf.jpg",
  },
  {
    title: "Dubai",
    subtitle: "Desert glamour",
    href: "/dubai",
    image:
      "https://assets.guesty.com/image/upload/v1732915502/production/666b3af27fc6d5653142b0af/r4h0yzxzbjsirfh77ygb.jpg",
  },
  {
    title: "Redondo Beach",
    subtitle: "Coastal luxury stays",
    href: "/redondo-beach",
    image:
      "https://assets.guesty.com/image/upload/v1760726898/production/666b3af27fc6d5653142b0af/anjv8iafdjmf6knycd8n.jpg",
  },
  {
    title: "Antwerp",
    subtitle: "Design-led stays",
    href: "/antwerp",
    image:
      "https://assets.guesty.com/image/upload/v1747520363/production/666b3af27fc6d5653142b0af/ihcbdtwkdiaq9xyezgrs.jpg",
  },
];

export default function ChromaGrid({ items = DEFAULT_ITEMS }) {
  return (
    <section className="chroma-grid" aria-label="Featured destinations">
      <ul className="chroma-grid__list" role="list">
        {items.map((item, index) => (
          <li key={item.title} className="chroma-grid__item">
            <Link
              to={item.href || "/"}
              aria-label={`Explore ${item.title}`}
              className="chroma-grid-card"
              onClick={() =>
                trackGuestCityClick({
                  city: item.title,
                  destinationPath: item.href || "/",
                  sourceSection: "featured_destinations",
                  sourceLabel: "chroma_grid",
                })
              }
            >
              <div className="chroma-grid-card__media">
                <img
                  src={optimizeChromaImage(item.image)}
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                  width="1200"
                  height="960"
                  sizes="(max-width: 680px) 100vw, (max-width: 1100px) 50vw, 25vw"
                  className="chroma-grid-card__image"
                />
                <div className="chroma-grid-card__overlay" />
                <span className="chroma-grid-card__index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="chroma-grid-card__body">
                <p className="chroma-grid-card__kicker">One Lux Stay</p>
                <h3 className="chroma-grid-card__title">{item.title}</h3>
                <p className="chroma-grid-card__subtitle">{item.subtitle}</p>
                <span className="chroma-grid-card__cta">
                  Explore destination <span aria-hidden="true">-&gt;</span>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
