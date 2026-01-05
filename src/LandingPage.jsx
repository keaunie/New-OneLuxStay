import { Link, useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState, useMemo } from "react";
import "./App.css";

const parseDate = (value) => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const stays = [
  {
    label: "Hollywood",
    headline: "Skyline Lofts",
    copy: "Sunset-ready terraces, floor-to-ceiling glass, and artful interiors a heartbeat from the Walk of Fame.",
    image:
      "https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    label: "Los Angeles",
    headline: "Hillside Residences",
    copy: "Glass walls, twinkling LA skyline views, and private decks made for golden-hour gatherings.",
    image:
      "https://assets.guesty.com/image/upload/v1729880354/production/666b3af27fc6d5653142b0af/yc51idfkqenc81wnse8n.jpg",
  },
  {
    label: "Redondo Beach",
    headline: "Ocean Residences",
    copy: "Salt-air mornings, curated surf setups, and expansive decks designed for golden-hour dinners.",
    image:
      "https://assets.guesty.com/image/upload/v1760535614/production/666b3af27fc6d5653142b0af/t7p3cc6hqez89wsmj1gt.jpg",
  },
  {
    label: "Dubai",
    headline: "Marina Heights",
    copy: "Glassy marina views, spa-inspired ensuites, and concierge access to the city's most exclusive tables.",
    image:
      "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    label: "Antwerp",
    headline: "Cathedral Quarters",
    copy: "Historic facades, cobblestone promenades, and modern interiors beside the Scheldt.",
    image:
      "https://assets.guesty.com/image/upload/v1740605753/production/666b3af27fc6d5653142b0af/hzvwqjuhjpwkkmyea38s.jpg",
  },
  {
    label: "Miami",
    headline: "Bayfront Suites",
    copy: "Tropical light, private balconies, and poolside ease minutes from the sand.",
    image:
      "https://assets.guesty.com/image/upload/v1729089198/production/666b3af27fc6d5653142b0af/ksjnj1kppnbajljv9csi.jpg",
  },
];

const highlights = [
  { title: "Design-first homes", body: "Warm lighting, tactile textures, and cinematic views in every address." },
  { title: "Hotel-grade service", body: "Concierge, daily refresh, and in-home experiences tailored to you." },
  { title: "Instant availability", body: "Real-time calendars for every unit across our locations." },
];

const DateRangePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const [view, setView] = useState(() => parseDate(value.checkIn) || today);
  const containerRef = useRef(null);

  const startDate = parseDate(value.checkIn);
  const endDate = parseDate(value.checkOut);

  useEffect(() => {
    const handleClick = (e) => {
      if (!open) return;
      if (containerRef.current && containerRef.current.contains(e.target)) return;
      setOpen(false);
    };
    const handleEsc = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open, containerRef]);

  useEffect(() => {
    if (!open) return;
    const base = startDate || today;
    setView((prev) => {
      const sameMonth = prev.getFullYear() === base.getFullYear() && prev.getMonth() === base.getMonth();
      return sameMonth ? prev : base;
    });
  }, [open, startDate, today]);

  const buildMonth = (baseDate) => {
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const first = new Date(year, month, 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array(startOffset).fill(null);
    for (let i = 1; i <= daysInMonth; i += 1) cells.push(new Date(year, month, i));
    return { year, month, cells };
  };

  const isSameDay = (a, b) =>
    a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const inRange = (day) => {
    if (!day || !startDate) return false;
    if (startDate && endDate) return day >= startDate && day <= endDate;
    return isSameDay(day, startDate);
  };

  const handleDayClick = (day) => {
    if (!day || day < today) return;
    let nextStart = startDate;
    let nextEnd = endDate;
    if (!startDate || (startDate && endDate)) {
      nextStart = day;
      nextEnd = null;
    } else if (day < startDate) {
      nextStart = day;
      nextEnd = null;
    } else {
      nextEnd = day;
    }
    onChange({
      checkIn: nextStart ? toISODate(nextStart) : "",
      checkOut: nextEnd ? toISODate(nextEnd) : "",
    });
    if (nextStart && nextEnd) setOpen(false);
  };

  const { year, month, cells } = buildMonth(view);

  useLayoutEffect(() => {
    if (!open) return;
    const base = startDate || today;
    setView((prev) => {
      const sameMonth = prev.getFullYear() === base.getFullYear() && prev.getMonth() === base.getMonth();
      return sameMonth ? prev : base;
    });
  }, [open, startDate, today]);

  return (
    <div className="landing-date-picker" ref={containerRef}>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-200/80">Check-in</label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {startDate ? startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Add date"}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-[0.14em] text-slate-200/80">Check-out</label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {endDate ? endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Add date"}
          </button>
        </div>
      </div>

      {open && (
        <div
          className="absolute left-1/2 top-full z-[9999] mt-3 w-[660px] max-w-[94vw] -translate-x-1/2 rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl pointer-events-auto landing-date-dropdown"
        >
            <div className="flex items-center justify-between px-4 py-3 text-white">
              <div className="font-semibold text-lg">
                {new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                  className="h-9 w-9 rounded-md bg-amber-400 text-slate-900 font-bold"
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  onClick={() => setView((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                  className="h-9 w-9 rounded-md bg-amber-400 text-slate-900 font-bold"
                >
                  {">"}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-4 px-4 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[buildMonth(view), buildMonth(new Date(view.getFullYear(), view.getMonth() + 1, 1))].map((monthObj) => (
                  <div key={`${monthObj.year}-${monthObj.month}`} className="space-y-2">
                    <div className="flex items-center justify-between text-white font-semibold">
                      <span>
                        {new Date(monthObj.year, monthObj.month, 1).toLocaleDateString(undefined, {
                          month: "long",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-300">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                        <div key={d}>{d}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {monthObj.cells.map((day, idx) => {
                        const disabled = !day || day < today;
                        const selected = (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
                        const between = inRange(day) && !selected;
                        return (
                          <button
                            key={`${monthObj.year}-${monthObj.month}-${idx}`}
                            type="button"
                            disabled={disabled}
                            onClick={() => handleDayClick(day)}
                            className={`h-10 rounded-lg border text-sm transition ${
                              disabled
                                ? "border-transparent text-slate-600"
                                : selected
                                  ? "border-amber-300 bg-amber-400 text-slate-900 font-semibold"
                                  : between
                                    ? "border-amber-400/50 bg-amber-400/10 text-white"
                                    : "border-slate-700 bg-slate-800 text-white hover:border-amber-300"
                            }`}
                          >
                            {day ? day.getDate() : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-300">
                <button
                  type="button"
                  onClick={() => onChange({ checkIn: "", checkOut: "" })}
                  className="rounded-md border border-white/10 bg-slate-800 px-3 py-2 hover:border-amber-300"
                >
                  Clear dates
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md bg-amber-400 px-3 py-2 font-semibold text-slate-900 hover:bg-amber-300"
                >
                  Done
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const steps = [
  { title: "Plan", detail: "Tell us your dates and vibe—we\'ll shortlist the right residences." },
  { title: "Reserve", detail: "Live availability, transparent pricing, and concierge on standby." },
  { title: "Unwind", detail: "Arrive to a prepared home with optional chef, spa, or driver." },
];

function LandingPage() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("All");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll(".landing-animate"));
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("is-visible");
        });
      },
      { threshold: 0.18 },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const handleHeroSubmit = (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    const cityParam = destination && destination !== "All" ? destination : "";
    if (cityParam) params.set("city", cityParam);
    if (checkIn) params.set("checkIn", checkIn);
    if (checkOut) params.set("checkOut", checkOut);
    if (guests) {
      params.set("guests", String(guests));
      params.set("adults", String(guests));
    }
    const query = params.toString();
    navigate(`/stay${query ? `?${query}` : ""}#listings`);
  };

  return (
    <div className="landing-page text-white">
      <header className="landing-hero relative overflow-hidden landing-animate">
        <div
          className="hero-media hero-media__image"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1505761671935-60b3a7427bad?auto=format&fit=crop&w=1800&q=70)",
          }}
        />
        <div className="hero-media__overlay" />
        <div className="landing-hero-inner">
          <div className="landing-logo-mark">OneLuxStay</div>
          <p className="landing-kicker text-amber-300 tracking-[0.34em]">The art of luxurious stays</p>
          <h1 className="landing-display text-4xl md:text-5xl leading-tight text-center">
            Experience Timeless Luxury Living
          </h1>
          <p className="text-lg text-slate-100/90 max-w-3xl text-center">
            Curated penthouses, skyline suites, and oceanfront sanctuaries across Antwerp, Dubai, Los Angeles, Miami,
            and Redondo Beach.
          </p>

          <div className="landing-chip-row">
            {["Antwerp", "Dubai", "Los Angeles", "Hollywood", "Redondo Beach", "Miami Beach"].map((city) => (
              <span key={city} className="landing-chip">
                {city.toUpperCase()}
              </span>
            ))}
          </div>

          <form className="landing-hero-form glass" onSubmit={handleHeroSubmit}>
            <div className="landing-form-field">
              <label>Destination</label>
              <select value={destination} onChange={(e) => setDestination(e.target.value)}>
                {["All", "Hollywood", "Redondo Beach", "Los Angeles", "Dubai", "Antwerp", "Miami Beach"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="landing-form-field">
              <DateRangePicker
                value={{ checkIn, checkOut }}
                onChange={(next) => {
                  setCheckIn(next.checkIn);
                  setCheckOut(next.checkOut);
                }}
              />
            </div>
            <div className="landing-form-field">
              <label>Guests</label>
              <select value={guests} onChange={(e) => setGuests(Number(e.target.value) || 1)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="landing-cta-primary w-full md:w-auto">Book</button>
          </form>
        </div>
      </header>

      <section id="collection" className="max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20 landing-animate">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="landing-kicker">Signature stays</p>
            <h2 className="landing-display text-3xl md:text-4xl">Choose your backdrop.</h2>
            <p className="text-slate-300 mt-2">Residences with cinematic views, curated art, and hotel-grade touches.</p>
          </div>
          <Link to="/stay" className="landing-link hidden sm:inline-flex">Book your dates</Link>
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

      <section className="landing-fullbleed landing-stack landing-animate">
        {stays.map((stay, idx) => (
          <div
            key={`${stay.label}-full`}
            className="landing-city-card"
            style={{
              backgroundImage: `linear-gradient(140deg, rgba(5,6,7,0.62), rgba(5,6,7,0.18)), url(${stay.image})`,
              zIndex: idx + 1,
            }}
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

      <section id="experience" className="landing-band border-y border-white/5 landing-animate">
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
            <h3 className="landing-display text-3xl md:text-4xl">Tell us your dates. We'll handle the rest.</h3>
            <p className="text-slate-200 max-w-2xl">
              City skyline, ocean breeze, private workspace, or space for the whole crew—share your stay goals and we'll reply with tailored options.
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







