import { Link } from "react-router-dom";
import "./ChromaGrid.css";

const DEFAULT_ITEMS = [
  {
    title: "Los Angeles",
    subtitle: "Skyline penthouses",
    href: "/losangeles",
    image:
      "https://assets.guesty.com/image/upload/v1733508976/production/666b3af27fc6d5653142b0af/uw8axioi311sthwkvv3u.jpg",
  },
  {
    title: "Dubai",
    subtitle: "Desert glamour",
    href: "/dubai",
    image:
      "https://assets.guesty.com/image/upload/v1732915608/production/666b3af27fc6d5653142b0af/hlppl3lhscwactabjegk.jpg",
  },
  {
    title: "Redondo Beach",
    subtitle: "Coastal luxury stays",
    href: "/redondo-beach",
    image:
      "https://assets.guesty.com/image/upload/v1760725510/production/666b3af27fc6d5653142b0af/chr4ozsvfyyjp1qguejn.jpg",
  },
  {
    title: "Antwerp",
    subtitle: "Design-led stays",
    href: "/antwerp",
    image:
      "https://assets.guesty.com/image/upload/v1747520363/production/666b3af27fc6d5653142b0af/sgsmqhdjhe0h6ij6cbfe.jpg",
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
            >
              <div className="chroma-grid-card__media">
                <img
                  src={item.image}
                  alt={item.title}
                  loading="lazy"
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
