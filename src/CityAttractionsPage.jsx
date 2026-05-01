import { useEffect, useRef, useState } from "react";
import { Link, useParams, Navigate } from "react-router-dom";
import SiteFooter from "./components/SiteFooter";
import { getCityAttractions } from "./data/cityAttractions";
import "./App.css";
import "./CityAttractionsPage.css";

const ROMAN = ["I", "II", "III", "IV", "V"];

const CategoryIcon = ({ kind }) => {
  const base = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "1.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
    className: "attract-icon",
  };
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

const AttractionCard = ({ attraction, index, accentColor }) => {
  const cardRef = useRef(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    if (!("IntersectionObserver" in window)) {
      el.dataset.revealed = "true";
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.dataset.revealed = "true";
          obs.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <article
      className="attract-card"
      ref={cardRef}
      style={{ "--card-delay": `${index * 85}ms`, "--accent": accentColor }}
    >
      <div className="attract-card-accent-bar" />
      <div className="attract-card-num" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </div>
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
};

function CityAttractionsPage() {
  const { citySlug } = useParams();
  const data = getCityAttractions(citySlug);
  const [activeCategory, setActiveCategory] = useState(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const bgRef = useRef(null);

  useEffect(() => {
    if (!data) return;
    const prev = document.title;
    document.title = `Things to Do in ${data.cityName} — One Lux Stay`;
    return () => { document.title = prev; };
  }, [data]);

  /* ── Scroll: parallax + progress bar ─────────────────────────────────── */
  useEffect(() => {
    if (!data) return;
    const bg = bgRef.current;
    let ticking = false;
    const prefersReducedMotion = !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    const update = () => {
      const y = window.scrollY;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (bg && !prefersReducedMotion) {
        bg.style.transform = `translateY(${Math.min(y * 0.28, 180)}px)`;
      }
      setScrollProgress(total > 0 ? (y / total) * 100 : 0);
      ticking = false;
    };

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, [data]);

  /* ── Scroll spy: active category pill ────────────────────────────────── */
  useEffect(() => {
    if (!data) return;
    const observers = [];
    data.categories.forEach((cat) => {
      const el = document.getElementById(cat.id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveCategory(cat.id); },
        { rootMargin: "-80px 0px -58% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [data]);

  /* ── Section + CTA reveal on scroll ─────────────────────────────────── */
  useEffect(() => {
    if (!data) return;
    const targets = document.querySelectorAll(".attract-section, .attract-cta-section");

    if (!("IntersectionObserver" in window)) {
      targets.forEach((t) => t.classList.add("is-visible"));
      return;
    }

    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add("is-visible");
      }),
      { threshold: 0.05, rootMargin: "0px 0px -40px 0px" }
    );
    targets.forEach((t) => obs.observe(t));
    return () => obs.disconnect();
  }, [data]);

  if (!data) return <Navigate to="/" replace />;

  const { cityName, country, tagline, intro, cityPath, bookPath,
          heroGradient, heroImage, accentColor, categories } = data;

  return (
    <div className="attract-page">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <header className="attract-hero" style={{ background: heroGradient }}>

        {/* Parallax background image */}
        {heroImage && (
          <img
            ref={bgRef}
            src={heroImage}
            alt=""
            aria-hidden="true"
            className="attract-hero-bg-img"
            loading="eager"
            onError={(e) => { e.target.style.display = "none"; }}
          />
        )}

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
              Begin Exploring ↓
            </a>
          </div>
        </div>

        {/* Chapter index */}
        <div className="attract-hero-index" aria-hidden="true">
          {categories.map((cat, i) => (
            <a key={cat.id} href={`#${cat.id}`} className="attract-hero-index-item">
              <span className="attract-hero-index-num" style={{ color: accentColor }}>{ROMAN[i]}</span>
              <span className="attract-hero-index-label">{cat.label}</span>
            </a>
          ))}
        </div>
      </header>

      {/* ── Sticky category nav ──────────────────────────────────────── */}
      <nav className="attract-category-nav" aria-label="Category navigation" id="attractions">
        {/* Scroll progress bar */}
        <div
          className="attract-scroll-bar"
          style={{ width: `${scrollProgress}%`, background: accentColor }}
          aria-hidden="true"
        />
        {categories.map((cat) => (
          <a
            key={cat.id}
            href={`#${cat.id}`}
            className={`attract-category-pill${activeCategory === cat.id ? " is-active" : ""}`}
            style={activeCategory === cat.id
              ? { background: accentColor, borderColor: accentColor, color: "#1a1a1a" }
              : {}}
          >
            <CategoryIcon kind={cat.icon} />
            {cat.label}
          </a>
        ))}
      </nav>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="attract-main">
        {categories.map((cat, catIndex) => (
          <section key={cat.id} id={cat.id} className="attract-section">

            {/* Section header */}
            <div className="attract-section-header">
              <div className="attract-section-chapter" aria-hidden="true" style={{ color: accentColor }}>
                {ROMAN[catIndex]}
              </div>
              <div className="attract-section-header-content">
                <div className="attract-section-title-row">
                  <div className="attract-section-icon" style={{ color: accentColor }}>
                    <CategoryIcon kind={cat.icon} />
                  </div>
                  <h2 className="attract-section-title">{cat.label}</h2>
                </div>
                {cat.narrative && (
                  <p className="attract-section-narrative">{cat.narrative}</p>
                )}
                <p className="attract-section-count">{cat.attractions.length} places to discover</p>
              </div>
            </div>

            {/* Cinematic scene image */}
            {cat.image && (
              <div className="attract-section-scene">
                <img
                  src={cat.image}
                  alt={cat.label}
                  loading="lazy"
                  className="attract-scene-img"
                  onError={(e) => {
                    const wrap = e.target.closest(".attract-section-scene");
                    if (wrap) wrap.style.display = "none";
                  }}
                />
                <div className="attract-scene-overlay" style={{ "--accent": accentColor }}>
                  <span className="attract-scene-roman" aria-hidden="true">{ROMAN[catIndex]}</span>
                  <span className="attract-scene-label">{cat.label}</span>
                </div>
              </div>
            )}

            {/* Cards */}
            <div className="attract-grid">
              {cat.attractions.map((attraction, i) => (
                <AttractionCard
                  key={attraction.name}
                  attraction={attraction}
                  index={i}
                  accentColor={accentColor}
                />
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* ── CTA ──────────────────────────────────────────────────────── */}
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
