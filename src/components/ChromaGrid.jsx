import { Link } from "react-router-dom";
import "./ChromaGrid.css";

const DEFAULT_ITEMS = [
  {
    title: "Los Angeles",
    subtitle: "Skyline penthouses",
    href: "/losangeles",
    image:
      "https://assets.guesty.com/image/upload/v1729880354/production/666b3af27fc6d5653142b0af/yc51idfkqenc81wnse8n.jpg",
  },
  {
    title: "Dubai",
    subtitle: "Desert glamour",
    href: "/dubai",
    image:
      "https://assets.guesty.com/image/upload/v1729089198/production/666b3af27fc6d5653142b0af/ksjnj1kppnbajljv9csi.jpg",
  },
  {
    title: "Redondo Beach",
    subtitle: "Coastal luxury stays",
    href: "/redondo-beach",
    image:
      "https://assets.guesty.com/image/upload/v1732914973/production/666b3af27fc6d5653142b0af/jpotm8nwcbvufegnbcnx.jpg",
  },
  {
    title: "Antwerp",
    subtitle: "Design-led stays",
    href: "/antwerp",
    image:
      "https://assets.guesty.com/image/upload/v1730119087/production/666b3af27fc6d5653142b0af/npeczkhmy9wff4lzuyvr.jpg",
  },
];

export default function ChromaGrid({ items = DEFAULT_ITEMS }) {
  return (
    <section
      aria-label="Featured destinations"
      style={{ marginTop: "6rem", marginBottom: "6rem", maxWidth: "1100px", marginInline: "auto" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 400px)",
          gap: "18px",
          justifyContent: "center",
        }}
      >
        {items.map((item) => (
          <Link
            key={item.title}
            to={item.href || "/"}
            aria-label={`Explore ${item.title}`}
            className="chroma-grid-card"
            style={{
              position: "relative",
              width: "400px",
              height: "400px",
            }}
          >
            <img
              src={item.image}
              alt={item.title}
              loading="lazy"
              className="chroma-grid-card__image"
              style={{
                position: "absolute",
                inset: 0,
              }}
            />
            <div
              className="chroma-grid-card__overlay"
              style={{
                position: "absolute",
                inset: 0,
              }}
            />
            <div
              className="chroma-grid-card__label"
              style={{
                position: "absolute",
                left: "14px",
                right: "14px",
                bottom: "12px",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: "1.18rem",
                  fontWeight: 800,
                  color: "#fff",
                  textShadow: "0 2px 8px rgba(0,0,0,0.85)",
                }}
              >
                {item.title}
              </h3>
              <p
                style={{
                  margin: "4px 0 0",
                  fontSize: "0.92rem",
                  color: "#fff",
                  textShadow: "0 2px 8px rgba(0,0,0,0.85)",
                }}
              >
                {item.subtitle}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
