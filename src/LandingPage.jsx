import { Link } from "react-router-dom";
import "./App.css";

const stays = [
  {
    label: "Hollywood",
    headline: "Skyline Lofts",
    copy: "Sunset-ready terraces, floor-to-ceiling glass, and artful interiors a heartbeat from the Walk of Fame.",
    image:
      "https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=1600&q=80",
  },
  {
    label: "Redondo Beach",
    headline: "Ocean Residences",
    copy: "Salt-air mornings, curated surf setups, and expansive decks designed for golden-hour dinners.",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1600&q=80",
  },
  {
    label: "Dubai",
    headline: "Marina Heights",
    copy: "Glassy marina views, spa-inspired ensuites, and concierge access to the city’s most exclusive tables.",
    image:
      "https://images.unsplash.com/photo-1504274066651-8d31a536b11a?auto=format&fit=crop&w=1600&q=80",
  },
];

const highlights = [
  { title: "Design-first homes", body: "Warm lighting, tactile textures, and cinematic views in every address." },
  { title: "Hotel-grade service", body: "Concierge, daily refresh, and in-home experiences tailored to you." },
  { title: "Instant availability", body: "Live Guesty connection for real-time prices and confident booking." },
];

const steps = [
  { title: "Plan", detail: "Tell us your dates and vibe—we’ll shortlist the right residences." },
  { title: "Reserve", detail: "Live availability, transparent pricing, and concierge on standby." },
  { title: "Unwind", detail: "Arrive to a prepared home with optional chef, spa, or driver." },
];

function LandingPage() {
  return (
    <div className="landing-page text-white">
      <header className="landing-hero relative overflow-hidden">
        <div className="hero-media">
          <div
            className="hero-media__image"
            style={{
              backgroundImage:
                "url(https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=70)",
            }}
          />
          <video
            className="hero-media__video"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            poster="https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=70"
          >
            <source src="https://cdn.coverr.co/videos/coverr-dubai-marina-1905/720p.mp4" type="video/mp4" />
          </video>
          <div className="hero-media__overlay" />
        </div>
        <div className="landing-glow landing-glow-one" />
        <div className="landing-glow landing-glow-two" />
        <div className="max-w-6xl mx-auto px-6 md:px-10 pt-10 pb-20 md:pb-24 relative">
          <div className="flex items-center justify-between">
            <div className="landing-mark text-lg tracking-[0.3em] uppercase">OneLuxStay</div>
            <div className="hidden md:flex items-center gap-3 text-sm">
              <Link to="/stay" className="landing-pill">Live booking</Link>
              <a href="#contact" className="landing-link">Concierge</a>
            </div>
          </div>

          <div className="landing-hero-grid mt-12 md:mt-16">
            <div className="space-y-7">
              <div className="flex items-center gap-3">
                <span className="landing-badge">Connected to Guesty</span>
                <span className="landing-dot">Live</span>
              </div>
              <h1 className="landing-display text-4xl md:text-5xl leading-tight">
                Elevated short stays with a concierge you can text.
              </h1>
              <p className="text-lg text-slate-200 max-w-2xl">
                A curated portfolio of design-forward residences—Hollywood heights, ocean decks, and skyline views—paired with hotel-grade service and real-time availability.
              </p>
              <div className="landing-actions">
                <Link to="/stay" className="landing-cta-primary">View live availability</Link>
                <a href="#collection" className="landing-cta-secondary">Browse the collection</a>
              </div>
              <div className="landing-metrics">
                <div>
                  <div className="metric-value">24/7</div>
                  <p className="metric-label">Concierge & support</p>
                </div>
                <div>
                  <div className="metric-value">12+ cities</div>
                  <p className="metric-label">Curated destinations</p>
                </div>
                <div>
                  <div className="metric-value">4.9★</div>
                  <p className="metric-label">Guest rating</p>
                </div>
              </div>
            </div>

            <div className="landing-hero-card glass hero-right-card space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="hero-card-kicker">Direct portal</p>
                  <p className="hero-card-title">Real-time booking, zero lag.</p>
                </div>
                <div className="landing-pill">API live</div>
              </div>
              <ul className="landing-list hero-card-list text-[0.98rem] leading-relaxed text-slate-100">
                <li>
                  <span className="landing-check">✓</span>
                  Guesty-connected pricing and availability in seconds.
                </li>
                <li>
                  <span className="landing-check">✓</span>
                  Concierge-to-suite flow: we prep, you arrive.
                </li>
                <li>
                  <span className="landing-check">✓</span>
                  Optional add-ons: chef, driver, spa, groceries.
                </li>
              </ul>
              <div className="landing-panel hero-quote rounded-xl border border-white/10 p-5 mt-1">
                <p className="text-[0.98rem] text-slate-100 leading-relaxed">
                  “Like checking into a five-star hotel that happens to be your own private residence.”
                </p>
                <p className="mt-4 text-xs text-amber-200 uppercase tracking-[0.24em]">OneLuxStay House Team</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section id="collection" className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="landing-kicker">Signature stays</p>
            <h2 className="landing-display text-3xl md:text-4xl">Choose your backdrop.</h2>
            <p className="text-slate-300 mt-2">Residences with cinematic views, curated art, and hotel-grade touches.</p>
          </div>
          <Link to="/stay" className="landing-link hidden sm:inline-flex">Book your dates →</Link>
        </div>
        <div className="landing-stay-grid mt-10">
          {stays.map((stay) => (
            <div key={stay.headline} className="landing-stay-card glass">
              <div className="landing-stay-top">
                <span className="landing-pill">{stay.label}</span>
                <h3 className="landing-display text-2xl mt-3">{stay.headline}</h3>
                <p className="text-slate-300 mt-2">{stay.copy}</p>
              </div>
              <div className="landing-stay-meta">
                <p className="text-sm text-slate-200">Hosted by OneLuxStay</p>
                <Link to="/stay" className="landing-link">View availability</Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-fullbleed">
        {stays.map((stay) => (
          <div
            key={`${stay.label}-full`}
            className="landing-city-card"
            style={{ backgroundImage: `linear-gradient(140deg, rgba(5,6,7,0.62), rgba(5,6,7,0.18)), url(${stay.image})` }}
          >
            <div className="landing-city-inner">
              <div className="landing-pill">{stay.label}</div>
              <h3 className="landing-display text-3xl md:text-4xl mt-4">{stay.headline}</h3>
              <p className="text-lg text-slate-100/90 mt-3 max-w-2xl">{stay.copy}</p>
              <div className="landing-actions mt-6">
                <Link to="/stay" className="landing-cta-primary">See live availability</Link>
                <Link to="/stay" className="landing-cta-secondary">View all {stay.label} stays</Link>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section id="experience" className="landing-band border-y border-white/5">
        <div className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20 space-y-10">
          <div className="flex items-start justify-between gap-6 flex-col md:flex-row">
            <div className="max-w-2xl space-y-4">
              <p className="landing-kicker">The OneLuxStay way</p>
              <h2 className="landing-display text-3xl md:text-4xl">Luxury with a rhythm that matches yours.</h2>
              <p className="text-slate-300">
                Every detail is intentional—layered lighting, tactile materials, silent climate control, and seamless tech. Your concierge orchestrates arrivals, perks, and departures.
              </p>
            </div>
            <div className="landing-badge">Seamless arrivals</div>
          </div>

          <div className="landing-feature-grid">
            {highlights.map((item) => (
              <div key={item.title} className="landing-chip glass">
                <p className="text-sm font-semibold text-white">{item.title}</p>
                <p className="text-sm text-slate-300 mt-1 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="landing-card glass space-y-4">
            <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">How it works</p>
            <div className="landing-steps">
              {steps.map((step, idx) => (
                <div key={step.title} className="landing-step-row">
                  <div className="landing-step">{idx + 1}</div>
                  <div>
                    <p className="font-semibold text-white">{step.title}</p>
                    <p className="text-sm text-slate-300">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-2">
              <Link to="/stay" className="landing-pill">Start your stay request</Link>
            </div>
          </div>
        </div>
      </section>

      <section id="contact" className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20">
        <div className="landing-cta">
          <div className="space-y-3">
            <p className="landing-kicker">Concierge on standby</p>
            <h3 className="landing-display text-3xl md:text-4xl">Tell us your dates. We’ll handle the rest.</h3>
            <p className="text-slate-200 max-w-2xl">
              City skyline, ocean breeze, private workspace, or space for the whole crew—share your stay goals and we’ll reply with tailored options.
            </p>
          </div>
          <div className="landing-actions mt-4">
            <Link
              to="/stay"
              className="landing-cta-primary"
            >
              See live availability
            </Link>
            <a
              href="mailto:stay@oneluxstay.com"
              className="landing-cta-secondary"
            >
              Email concierge
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default LandingPage;
