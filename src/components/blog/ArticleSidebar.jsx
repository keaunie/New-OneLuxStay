import { Link } from "react-router-dom";
import TableOfContents from "./TableOfContents";

const CITY_CTA = {
  dubai: { emoji: "🌆", title: "Stay in Dubai", desc: "Luxury apartments in Marina, Downtown & Palm Jumeirah.", href: "/dubai", label: "View Dubai Properties" },
  antwerp: { emoji: "💎", title: "Stay in Antwerp", desc: "Premium apartments in Zurenborg, Het Eilandje & Zuid.", href: "/antwerp", label: "View Antwerp Properties" },
  miami: { emoji: "🌊", title: "Stay in Miami", desc: "Beachfront residences in South Beach & Brickell.", href: "/miami", label: "View Miami Properties" },
  "redondo-beach": { emoji: "🏄", title: "Stay in Redondo Beach", desc: "Coastal apartments steps from the Pacific.", href: "/redondo-beach", label: "View Redondo Beach Properties" },
  "los-angeles": { emoji: "✨", title: "Stay in Los Angeles", desc: "Luxury apartments across the best LA neighborhoods.", href: "/los-angeles", label: "View LA Properties" },
};

const DEFAULT_CTA = {
  emoji: "🏠",
  title: "Book a Luxury Stay",
  desc: "Explore OneLuxStay's curated apartments across five cities.",
  href: "/reserve",
  label: "Browse All Properties",
};

export default function ArticleSidebar({ toc = [], relatedCities = [] }) {
  const primaryCity = relatedCities?.[0];
  const cta = CITY_CTA[primaryCity] || DEFAULT_CTA;

  return (
    <aside className="article-sidebar" aria-label="Article sidebar">
      {toc.length > 0 && <TableOfContents items={toc} />}

      <div className="article-sidebar__box sidebar-cta">
        <div className="sidebar-cta__emoji" aria-hidden="true">{cta.emoji}</div>
        <p className="sidebar-cta__title">{cta.title}</p>
        <p className="sidebar-cta__desc">{cta.desc}</p>
        <Link to={cta.href} className="sidebar-cta__btn">
          {cta.label}
        </Link>
      </div>

      <div className="article-sidebar__box">
        <p className="article-sidebar__title">Reserve Your Stay</p>
        <p style={{ fontSize: "0.85rem", color: "var(--landing-muted)", lineHeight: 1.6, marginBottom: "1rem" }}>
          Need help choosing the right property? Our team responds within 2 hours.
        </p>
        <Link
          to="/reserve"
          style={{
            display: "block",
            border: "1px solid var(--landing-stroke)",
            borderRadius: "9px",
            padding: "0.65rem 1rem",
            textAlign: "center",
            fontSize: "0.88rem",
            fontWeight: 600,
            color: "var(--ink)",
            textDecoration: "none",
            transition: "background 0.18s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--landing-amber-soft)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          Request a Reservation →
        </Link>
      </div>
    </aside>
  );
}
