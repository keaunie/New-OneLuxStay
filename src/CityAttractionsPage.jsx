import { useEffect } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import SiteFooter from "./components/SiteFooter";
import { getCityAttractions } from "./data/cityAttractions";
import "./App.css";
import "./CityAttractionsPage.css";

const CategoryIcon = ({ kind }) => {
  const base = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.6", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", className: "attract-icon" };
  if (kind === "museum") return (
    <svg {...base}><path d="M3 21h18"/><path d="M3 10h18"/><path d="M12 3 3 10h18L12 3z"/><path d="M6 10v11"/><path d="M18 10v11"/><path d="M10 10v11"/><path d="M14 10v11"/></svg>
  );
  if (kind === "nature") return (
    <svg {...base}><path d="M12 22V12"/><path d="M5 12c0-3.87 3.13-7 7-7s7 3.13 7 7"/><path d="M8 18c0-2.21 1.79-4 4-4s4 1.79 4 4"/></svg>
  );
  if (kind === "food") return (
    <svg {...base}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
  );
  if (kind === "shopping") return (
    <svg {...base}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
  );
  return (
    <svg {...base}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
  );
};

const AttractionCard = ({ attraction }) => (
  <article className="attract-card">
    <div className="attract-card-body">
      <header className="attract-card-header">
        <h3 className="attract-card-name">{attraction.name}</h3>
        <span className="attract-card-tag">{attraction.tag}</span>
      </header>
      <p className="attract-card-desc">{attraction.description}</p>
    </div>
    <footer className="attract-card-footer">
      <span className="attract-card-distance">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="attract-distance-icon">
          <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
        {attraction.distance}
      </span>
    </footer>
  </article>
);

function CityAttractionsPage() {
  const { citySlug } = useParams();
  const data = getCityAttractions(citySlug);

  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = `Things to Do in ${data.cityName} — One Lux Stay`;
    return () => { document.title = prev; };
  }, [data]);

  if (!data) return <Navigate to="/" replace />;

  const { cityName, country, tagline, intro, cityPath, bookPath, heroGradient, accentColor, categories } = data;

  return (
    <div className="attract-page">
      <header className="attract-hero" style={{ background: heroGradient }}>
        <div className="attract-topbar">
          <Link to="/" className="attract-logo">OneLuxStay</Link>
          <nav className="attract-breadcrumb" aria-label="Breadcrumb">
            <Link to={cityPath} className="attract-breadcrumb-link">← Back to {cityName}</Link>
          </nav>
        </div>

        <div className="attract-hero-inner">
          <p className="attract-hero-eyebrow" style={{ color: accentColor }}>
            {country} · Things to Do
          </p>
          <h1 className="attract-hero-title">
            Explore <span style={{ color: accentColor }}>{cityName}</span>
          </h1>
          <p className="attract-hero-tagline">{tagline}</p>
          <p className="attract-hero-intro">{intro}</p>
          <div className="attract-hero-actions">
            <Link to={bookPath} className="attract-hero-cta" style={{ background: accentColor, color: "#1a1a1a" }}>
              Book a Stay in {cityName}
            </Link>
            <a href="#attractions" className="attract-hero-scroll">
              Explore Attractions ↓
            </a>
          </div>
        </div>
      </header>

      <nav className="attract-category-nav" aria-label="Category navigation" id="attractions">
        {categories.map((cat) => (
          <a key={cat.id} href={`#${cat.id}`} className="attract-category-pill">
            <CategoryIcon kind={cat.icon} />
            {cat.label}
          </a>
        ))}
      </nav>

      <main className="attract-main">
        {categories.map((cat) => (
          <section key={cat.id} id={cat.id} className="attract-section">
            <div className="attract-section-header">
              <div className="attract-section-icon" style={{ color: accentColor }}>
                <CategoryIcon kind={cat.icon} />
              </div>
              <div>
                <h2 className="attract-section-title">{cat.label}</h2>
                <p className="attract-section-count">{cat.attractions.length} highlights</p>
              </div>
            </div>
            <div className="attract-grid">
              {cat.attractions.map((attraction) => (
                <AttractionCard key={attraction.name} attraction={attraction} />
              ))}
            </div>
          </section>
        ))}
      </main>

      <section className="attract-cta-section">
        <div className="attract-cta-inner">
          <p className="attract-cta-eyebrow">One Lux Stay · {cityName}</p>
          <h2 className="attract-cta-title">Ready to experience {cityName}?</h2>
          <p className="attract-cta-body">
            Stay in a curated One Lux Stay property and have everything on this page at your doorstep. Hotel standards. Private living.
          </p>
          <div className="attract-cta-actions">
            <Link to={bookPath} className="attract-cta-primary" style={{ background: accentColor, color: "#1a1a1a" }}>
              Browse {cityName} Units
            </Link>
            <Link to="/global" className="attract-cta-secondary">
              See All Destinations
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

export default CityAttractionsPage;
