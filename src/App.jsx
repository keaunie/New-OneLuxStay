import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import "./App.css";

const defaultApiBase =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:4000"
    : "/.netlify/functions/index";
const apiBase = import.meta.env.VITE_API_BASE || defaultApiBase;

const formatCurrency = (value, currency = "USD") =>
  typeof value === "number"
    ? value.toLocaleString("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    : "--";

const KNOWN_CITIES = ["hollywood", "los angeles", "antwerp", "antwerpen", "dubai", "redondo beach", "miami beach"];

const normalizeCity = (listing) => {
  const titleLower = typeof listing.title === "string" ? listing.title.toLowerCase() : "";
  if (titleLower.includes("hollywood")) return "Hollywood";

  const primary = listing.city || listing.address?.city;
  if (primary) return primary.trim();

  const tagCity =
    Array.isArray(listing.tags) &&
    listing.tags.find((t) => typeof t === "string" && KNOWN_CITIES.includes(t.toLowerCase()));
  if (tagCity) return tagCity.trim();

  if (titleLower) {
    const match = KNOWN_CITIES.find((c) => titleLower.includes(c));
    if (match) {
      return match
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
    }
  }

  return (listing.address?.full || "").trim();
};

const initialSearch = {
  checkIn: "",
  checkOut: "",
  adults: 1,
  children: 0,
};

const parseDate = (value) => {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

const parseHiddenList = (value = "") =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const HIDDEN_LISTING_IDS = parseHiddenList(import.meta.env.VITE_HIDDEN_LISTING_IDS);
const HIDDEN_LISTING_TITLES = parseHiddenList(import.meta.env.VITE_HIDDEN_LISTING_TITLES).map((t) =>
  t.toLowerCase(),
);

const FEATURE_GROUPS = [
  {
    title: "Elevated essentials",
    blurb: "Arrive to plush bedding, spa-grade towels, and fully stocked bathrooms.",
    bullets: ["Premium linens + blackout shades", "Ritual-level bath amenities", "Pro cleaning before every stay"],
  },
  {
    title: "Work + play ready",
    blurb: "Every unit supports focus time and downtime without compromise.",
    bullets: ["High-speed Wi-Fi and ergonomic seating", "Smart TVs with streaming", "Dedicated coffee & tea bar"],
  },
  {
    title: "Host-level kitchens",
    blurb: "Cook, graze, or entertain with thoughtful tools and serving pieces.",
    bullets: ["Full-size appliances and cookware", "Filtered water + ice", "Tableware for groups"],
  },
];

const LANDMARKS = [
  { name: "Runyon Canyon Park", distance: "0.6 mi", type: "Park trails", detail: "Sunset hikes with skyline views." },
  { name: "Dolby Theatre", distance: "1.2 mi", type: "Landmark", detail: "Iconic Hollywood awards venue." },
  { name: "Santa Monica Beach", distance: "11 mi", type: "Beachfront", detail: "Oceanfront paths and pier rides." },
  { name: "LACMA", distance: "6.5 mi", type: "Museum", detail: "Urban Light, modern art, and rotating exhibits." },
];

const toISODate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const formatDisplayDate = (value) => {
  const d = parseDate(value);
  if (!d) return "Add date";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

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
  }, [open]);

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

  return (
    <div className="relative" ref={containerRef}>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-300">Check-in</label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {formatDisplayDate(value.checkIn)}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-slate-300">Check-out</label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full rounded-lg border border-white/15 bg-slate-900/70 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {formatDisplayDate(value.checkOut)}
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute left-0 z-50 mt-3 w-[320px] rounded-2xl border border-slate-700/60 bg-slate-900 shadow-2xl">
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
              {[buildMonth(view), buildMonth(new Date(view.getFullYear(), view.getMonth() + 1, 1))].map(
                (monthObj) => (
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
                ),
              )}
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

const LandingPage = () => {
  const [activeDest, setActiveDest] = useState(0);
  const slideRefs = useRef([]);
  const stageRef = useRef(null);

  const destinations = [
    {
      id: "Antwerp",
      href: "/antwerp",
      img: "https://assets.guesty.com/image/upload/v1762983593/production/666b3af27fc6d5653142b0af/rhipugh4blshkdlknw0y.jpg",
      tag: "Heritage / Galleries",
      accent: "#f0d27d",
      desc: "Diamond-quarter penthouses, cathedral rooftops, and riverfront ateliers with private guides.",
      vibe: "Grand canal views • stone facades • galleries",
      features: ["Private guides + rooftops", "Chef dinners in historic spaces", "Butler-level housekeeping"],
    },
    {
      id: "Dubai",
      href: "/dubai",
      img: "https://assets.guesty.com/image/upload/v1762983594/production/666b3af27fc6d5653142b0af/og8pc3hk7dkvvowp3yxe.jpg",
      tag: "Skyline / Yacht",
      accent: "#f5c56a",
      desc: "Downtown and Palm sanctuaries with heli transfers, yacht sunsets, and private chef tastings.",
      vibe: "Sunset haze • modern glass • marina lights",
      features: ["Heli + yacht arrivals", "Penthouse screening lounges", "In-suite hammam rituals"],
    },
    {
      id: "Los Angeles",
      href: "/losangeles",
      img: "https://assets.guesty.com/image/upload/v1762983593/production/666b3af27fc6d5653142b0af/qswo8beahox41r5gaebf.jpg",
      tag: "Hills / Cinema",
      accent: "#f2b9a0",
      desc: "Hillside observatories and DTLA lofts with cinema lighting, vinyl bars, and gallery nights.",
      vibe: "Palm silhouettes • cinematic haze • gallery energy",
      features: ["Hillside observatories", "Cinema-grade projection", "Private gallery walk-throughs"],
    },
    {
      id: "Hollywood",
      href: "/hollywood",
      img: "https://images.unsplash.com/photo-1534253893894-10d024888e49?auto=format&fit=crop&q=80&w=1800",
      tag: "Studios / Night",
      accent: "#f2c081",
      desc: "Sunset Strip hideaways, speakeasy jazz, and after-hours studio tours curated for insiders.",
      vibe: "Neon glow • studio backlots • late-night jazz",
      features: ["After-hours studio tours", "Private mixology bars", "Soundproof suites + vinyl"],
    },
    {
      id: "Miami",
      href: "/miami",
      img: "https://assets.guesty.com/image/upload/v1762983593/production/666b3af27fc6d5653142b0af/jk89sv4gqd8hmnaiccpr.jpg",
      tag: "Ocean / Wellness",
      accent: "#7ae6d5",
      desc: "Oceanfront penthouses with sound baths, yacht slips, sunrise paddles, and wellness chefs.",
      vibe: "Turquoise water • sunrise rituals • palm breeze",
      features: ["Yacht slip + captain", "Sound bath + cold plunge", "Sunrise paddle concierge"],
    },
    {
      id: "Redondo",
      href: "/redondo",
      img: "https://assets.guesty.com/image/upload/v1762983593/production/666b3af27fc6d5653142b0af/nvwxruidl4cl3yopufrw.jpg",
      tag: "Coast / Slow",
      accent: "#f08c5a",
      desc: "Pacific-facing suites with firepits, cold plunges, and slow coastal itineraries at dawn.",
      vibe: "Salt air • amber sunsets • slow tide",
      features: ["Firepits + cold plunge decks", "Bike + surf outfitting", "Chef-led ceviche at sunset"],
    },
  ];

  const pillars = [
    { title: "Quiet Luxury", copy: "Muted palettes, natural textures, architectural light, calm acoustics." },
    { title: "Concierge Precision", copy: "Arrivals, dining, wellness, and culture handled end-to-end." },
    { title: "Comfort + Tech", copy: "Spa-grade bedding, filtered air, fast Wi‑Fi, secure digital keys." },
    { title: "Consistency", copy: "In-house teams for cleaning, linen, and maintenance across every city." },
  ];

  useEffect(() => {
    const elements = document.querySelectorAll(".luxe-home .animate-on-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add("visible");
        });
      },
      { threshold: 0.2 },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const layers = document.querySelectorAll(".luxe-home [data-parallax]");
    const orb = document.querySelector(".luxe-home .cursor-orb");
    const handleMouseMove = (e) => {
      const { innerWidth, innerHeight } = window;
      const x = (e.clientX / innerWidth - 0.5) * 2;
      const y = (e.clientY / innerHeight - 0.5) * 2;
      layers.forEach((layer) => {
        const depth = Number(layer.dataset.parallax || 0);
        layer.style.transform = `translate(${x * depth * 18}px, ${y * depth * 18}px)`;
      });
      if (orb) {
        orb.style.opacity = "1";
        orb.style.left = `${e.clientX}px`;
        orb.style.top = `${e.clientY}px`;
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  useEffect(() => {
    const slides = slideRefs.current.filter(Boolean);
    const root = stageRef.current;
    if (!root || !slides.length) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (top) {
          const idx = Number(top.target.dataset.index || 0);
          setActiveDest(idx);
        }
      },
      { root, threshold: 0.55 },
    );

    slides.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [destinations.length]);

  return (
    <section id="home-root" className="ols-home luxe-home" data-component="ols-home">
      <div className="cursor-orb" aria-hidden="true" />

      <section className="hero-shell" aria-label="Hero">
        <div className="hero-art" aria-hidden="true">
          <div className="hero-gradient" data-parallax="0.04" />
          <div className="hero-grid" data-parallax="0.08" />
          <div className="hero-photo" data-parallax="0.02">
            <img
              src="https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&q=80&w=1800"
              alt=""
              loading="eager"
              fetchPriority="high"
            />
          </div>
        </div>

        <div className="hero-inner container">
          <div className="hero-copy">
            <p className="eyebrow animate-on-scroll">One Lux Stay</p>
            <h1 className="headline animate-on-scroll">Minimal luxury. Fully choreographed stays.</h1>
            <p className="lede animate-on-scroll">
              Skyline suites, ocean sanctuaries, heritage lofts—each with muted palettes, sculpted light, and concierge
              precision from arrival to farewell.
            </p>
            <div className="hero-actions animate-on-scroll">
              <Link to="/listings" className="cta primary">
                View availability
              </Link>
              <a href="#destinations" className="cta ghost">
                Explore cities
              </a>
            </div>
            <div className="hero-points animate-on-scroll">
              <span>24/7 concierge + secure digital keys</span>
              <span>Pre-stocked pantries + private chefs on request</span>
              <span>Spa-grade bedding, filtered air & water</span>
            </div>
            <div className="hero-meta animate-on-scroll">
              <div>
                <p className="meta-kicker">Cities</p>
                <p className="meta-value">Antwerp · Dubai · Los Angeles · Miami · Redondo</p>
              </div>
              <div>
                <p className="meta-kicker">Included</p>
                <p className="meta-value">Arrival coordination, daily concierge, chef-grade kitchens, wellness partners</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="destinations" className="destinations">
        <div className="dest-bg" aria-hidden="true" />
        <div className="container">
          <div className="section-head animate-on-scroll">
            <p className="eyebrow">Destinations</p>
            <h2>Five cities. One understated standard.</h2>
          </div>
        </div>
        <div className="dest-fullbleed" style={{ ["--dest-count"]: destinations.length }}>
          <div className="dest-stage" ref={stageRef}>
            {destinations.map((d, idx) => (
              <a
                key={d.id}
                className={`dest-slide ${activeDest === idx ? "visible" : ""}`}
                href={d.href}
                data-link
                aria-label={`Explore ${d.id}`}
                style={{ ["--accent"]: d.accent }}
                ref={(el) => {
                  slideRefs.current[idx] = el;
                }}
                data-index={idx}
              >
                <div className="dest-slide__image">
                  <img src={d.img} alt={d.id} loading="lazy" />
                </div>
                <div className="dest-slide__veil" />
                <div className="dest-slide__glow" />
                <div className="dest-slide__content">
                  <div className="dest-labels">
                    <span className="dest-chip">{d.tag}</span>
                    <span className="dest-number">{String(idx + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="dest-titles">
                    <h3>{d.id}</h3>
                    <p className="dest-vibe">{d.vibe}</p>
                  </div>
                  <p className="dest-desc">{d.desc}</p>
                  <div className="dest-features">
                    {d.features.map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                  </div>
                  <span className="dest-cta">Enter {d.id}</span>
                </div>
              </a>
            ))}
            <div className="dest-progress">
              {destinations.map((d, idx) => (
                <button
                  key={`${d.id}-dot`}
                  type="button"
                  className={`dest-dot ${activeDest === idx ? "active" : ""}`}
                  onClick={() => {
                    const stage = stageRef.current;
                    const target = slideRefs.current[idx];
                    if (stage && target) {
                      stage.scrollTo({
                        top: target.offsetTop,
                        behavior: "smooth",
                      });
                    }
                  }}
                  aria-label={`Scroll to ${d.id}`}
                >
                  <span />
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="company-section">
        <div className="container">
          <div className="section-head animate-on-scroll">
            <p className="eyebrow">About One Lux Stay</p>
            <h2>Hospitality built for calm, discretion, and exacting standards.</h2>
            <p className="section-sub">
              We curate and operate residences in five cities, pairing architecture-forward spaces with concierge teams
              who anticipate the next move—arrivals, dining, wellness, and culture.
            </p>
          </div>
          <div className="about-grid">
            <article className="about-card animate-on-scroll">
              <h3>Operations</h3>
              <p>In-house housekeeping, linen, and maintenance teams keep every stay consistent and pristine.</p>
            </article>
            <article className="about-card animate-on-scroll">
              <h3>Concierge</h3>
              <p>Dedicated coordinators for airport transfers, reservations, wellness providers, chefs, security, and local hosts.</p>
            </article>
            <article className="about-card animate-on-scroll">
              <h3>Design</h3>
              <p>Muted palettes, natural textures, circadian lighting, and acoustics tuned for rest and focus.</p>
            </article>
            <article className="about-card animate-on-scroll">
              <h3>Technology</h3>
              <p>Secure digital keys, private Wi‑Fi, and guest profiles to preset climate, scent, and music on arrival.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="capabilities">
        <div className="container">
          <div className="section-head animate-on-scroll">
            <p className="eyebrow">What we arrange</p>
            <h2>Beyond the residence, we set the scene.</h2>
          </div>
          <div className="capability-grid">
            <div className="cap-card animate-on-scroll">
              <h3>Arrivals</h3>
              <p>Private driver, secure digital keys, pre-set climate, scent, and music per your profile.</p>
            </div>
            <div className="cap-card animate-on-scroll">
              <h3>Dining</h3>
              <p>Chef experiences, rooftop tastings, restaurant bookings, pantry pre-stock tailored to preferences.</p>
            </div>
            <div className="cap-card animate-on-scroll">
              <h3>Wellness</h3>
              <p>Massage, IV drip, yoga, trainers, cold plunge/sauna access, sleep setups with blackout and humidifiers.</p>
            </div>
            <div className="cap-card animate-on-scroll">
              <h3>Culture</h3>
              <p>Gallery walkthroughs, yacht sunsets, studio tours, and neighborhood itineraries led by trusted hosts.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="signature-section">
        <div className="container">
          <div className="section-head animate-on-scroll">
            <p className="eyebrow">Essentials, perfected</p>
            <h2>Everything you need, nothing loud.</h2>
          </div>
          <div className="signature-grid">
            <article className="sig-card animate-on-scroll">
              <h3>Arrival</h3>
              <p>Private driver, pre-set climate and scent, pantry arranged to your ritual.</p>
            </article>
            <article className="sig-card animate-on-scroll">
              <h3>Stay</h3>
              <p>Spa-grade bedding, filtered air and water, hushed acoustics, thoughtful lighting.</p>
            </article>
            <article className="sig-card animate-on-scroll">
              <h3>Concierge</h3>
              <p>Dining, drivers, wellness, and culture—handled quietly in the background.</p>
            </article>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <div className="container cta-inner">
          <div>
            <p className="eyebrow">Concierge ready</p>
            <h2>Tell us the mood. We’ll set the scene.</h2>
            <p className="section-sub">From arrival to farewell, every detail is choreographed—quietly.</p>
          </div>
          <div className="cta-actions">
            <Link to="/listings" className="cta primary">
              Book direct
            </Link>
            <a href="/contactus" className="cta ghost" data-link>
              Speak to concierge
            </a>
          </div>
        </div>
      </section>
    </section>
  );
};

const ListingsPage = () => {
  const [listings, setListings] = useState([]);
  const [loadingListings, setLoadingListings] = useState(true);
  const [listingsError, setListingsError] = useState("");
  const [search, setSearch] = useState(initialSearch);
  const [availability, setAvailability] = useState({});
  const [activeListingId, setActiveListingId] = useState("");
  const [bookingInfo, setBookingInfo] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    notes: "",
  });
  const [bookingState, setBookingState] = useState({ status: "idle", message: "" });
  const [cityFilter, setCityFilter] = useState("All");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalListing, setModalListing] = useState(null);
  const [modalHero, setModalHero] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${apiBase}/api/listings`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Listings failed: ${res.status}`);
        const json = await res.json();
        const sanitizedListings = (json.results || []).filter((listing) => {
          const id = listing.id || listing._id;
          const title = typeof listing.title === "string" ? listing.title.toLowerCase() : "";
          if (id && HIDDEN_LISTING_IDS.includes(id)) return false;
          if (title && HIDDEN_LISTING_TITLES.some((hidden) => title.includes(hidden))) return false;
          return true;
        });

        setListings(sanitizedListings);
        setActiveListingId(sanitizedListings[0]?.id || "");
      } catch {
        setListingsError("Unable to load units from Guesty?");
      } finally {
        setLoadingListings(false);
      }
    };
    load();
  }, []);

  const nights = useMemo(() => {
    if (!search.checkIn || !search.checkOut) return 0;
    const start = parseDate(search.checkIn);
    const end = parseDate(search.checkOut);
    if (!start || !end) return 0;
    return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
  }, [search.checkIn, search.checkOut]);

  const selectedListing = useMemo(
    () => listings.find((l) => l.id === activeListingId || l._id === activeListingId),
    [activeListingId, listings],
  );

  const cityOptions = useMemo(() => {
    const map = new Map();
    const forced = ["Hollywood", "Redondo Beach"];
    listings.forEach((l) => {
      const city = normalizeCity(l);
      if (!city) return;
      if (!map.has(city)) {
        const img =
          l.picture ||
          (Array.isArray(l.pictures) && l.pictures[0]?.thumbnail) ||
          (Array.isArray(l.pictures) && l.pictures[0]?.original) ||
          "";
        map.set(city, { city, image: img });
      }
    });
    forced.forEach((city) => {
      if (!map.has(city)) map.set(city, { city, image: "" });
    });
    return [{ city: "All", image: "" }, ...Array.from(map.values())];
  }, [listings]);

  const filteredListings = useMemo(() => {
    if (cityFilter === "All") return listings;
    const match = cityFilter.toLowerCase();
    return listings.filter((l) => normalizeCity(l).toLowerCase() === match);
  }, [cityFilter, listings]);
  const availableCount = filteredListings.length;

  const modalAvailability = useMemo(() => {
    if (!modalListing) return null;
    return availability[modalListing.id] || null;
  }, [modalListing, availability]);

  useEffect(() => {
    if (!activeListingId && filteredListings[0]) {
      setActiveListingId(filteredListings[0].id);
      return;
    }
    const exists = filteredListings.some((l) => l.id === activeListingId);
    if (!exists && filteredListings[0]) {
      setActiveListingId(filteredListings[0].id);
    }
  }, [filteredListings, activeListingId]);

  const handleSearchChange = (key, value) => {
    setSearch((prev) => ({ ...prev, [key]: value }));
  };

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { cache: "no-store", ...options, signal: controller.signal });
      return res;
    } finally {
      clearTimeout(id);
    }
  };

  const checkAvailability = async (listing) => {
    if (!search.checkIn || !search.checkOut) {
      alert("Pick check-in and check-out dates first.");
      return;
    }
    const requestKey = `${listing.id}:${search.checkIn}:${search.checkOut}:${search.adults}:${search.children}`;
    const existing = availability[listing.id];
    const isSameQuery =
      existing &&
      existing.lastQuery &&
      existing.lastQuery === requestKey;
    const isFresh =
      isSameQuery && existing.timestamp && Date.now() - existing.timestamp < 2 * 60 * 1000;
    if (isFresh || (existing && existing.status === "loading" && isSameQuery)) {
      return;
    }
    const adultsNum = Number.parseInt(search.adults, 10);
    const childrenNum = Number.parseInt(search.children, 10);
    const adults = Number.isFinite(adultsNum) ? Math.max(1, adultsNum) : 1;
    const children = Number.isFinite(childrenNum) ? Math.max(0, childrenNum) : 0;
    const guests = adults + children;

    setAvailability((prev) => ({
      ...prev,
      [listing.id]: { status: "loading", lastQuery: requestKey, timestamp: Date.now() },
    }));

    try {
      let availJson = null;
      try {
        const availRes = await fetchWithTimeout(
          `${apiBase}/api/listings/${listing.id}/availability?${new URLSearchParams({
            startDate: search.checkIn,
            endDate: search.checkOut,
            minOccupancy: guests,
          }).toString()}`,
        );
        if (availRes.ok) {
          availJson = await availRes.json();
        }
      } catch {
        // ignore availability failure; fall back to quote result
      }

      const quoteRes = await fetchWithTimeout(`${apiBase}/api/reservations/quotes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId: listing.id,
          checkInDateLocalized: search.checkIn,
          checkOutDateLocalized: search.checkOut,
          guestsCount: guests,
        }),
      });

      if (!quoteRes.ok) {
        const errText = await quoteRes.text();
        throw new Error(errText || `Quote failed with ${quoteRes.status}`);
      }

      const quoteJson = await quoteRes.json();
      const quoteData = quoteJson?.results?.[0] || quoteJson?.results || quoteJson;

      const isAvailable =
        availJson?.isAvailable ??
        availJson?.available ??
        (typeof availJson?.status === "string" ? availJson.status === "AVAILABLE" : undefined) ??
        (Array.isArray(availJson?.availability)
          ? availJson.availability.every((d) => (d?.isAvailable ?? d?.available ?? true) !== false)
          : undefined);

      const ratePlan = quoteData?.rates?.ratePlans?.[0];
      const rpMoney =
        ratePlan?.money?.money ||
        ratePlan?.money ||
        quoteData?.money?.money ||
        quoteData?.money ||
        null;
      const quoteMoney = rpMoney || null;

      const quoteDays = ratePlan?.days || [];
      const quoteCurrency = quoteMoney?.currency || quoteDays[0]?.currency || listing.currency || "USD";

      const quotedNights = Array.isArray(quoteDays) && quoteDays.length > 0 ? quoteDays.length : nights;
      const daySum = Array.isArray(quoteDays)
        ? quoteDays.reduce((sum, d) => {
          const price = d?.price ?? d?.manualPrice ?? d?.basePrice;
          return sum + (typeof price === "number" ? price : 0);
        }, 0)
        : null;

      const quoteTotalRaw =
        quoteMoney?.subTotalPrice ??
        quoteMoney?.totalPrice ??
        quoteMoney?.total ??
        quoteData?.total ??
        quoteData?.price?.total ??
        quoteData?.price?.totalAmount ??
        quoteData?.price?.totalPrice ??
        (typeof quoteData?.price?.total === "object" ? quoteData.price.total.amount : null) ??
        (typeof quoteData?.amount === "number" ? quoteData.amount : null) ??
        (typeof daySum === "number" && quotedNights ? daySum + (listing.cleaningFee || 0) : null);

      const quoteTotal = typeof quoteTotalRaw === "number" ? quoteTotalRaw : null;

      const quoteNightly =
        (quoteTotal && quotedNights ? quoteTotal / quotedNights : undefined) ??
        (typeof daySum === "number" && quotedNights ? daySum / quotedNights : undefined) ??
        (quoteDays[0]?.price ?? quoteDays[0]?.manualPrice ?? quoteDays[0]?.basePrice);

      const nightly = quoteNightly ?? listing.basePrice;
      const total = quoteTotal ?? (nightly && nights ? nightly * nights + (listing.cleaningFee || 0) : null);

      const hostPayout =
        typeof quoteMoney?.hostPayout === "number"
          ? quoteMoney.hostPayout
          : typeof quoteMoney?.hostPayoutUsd === "number"
            ? quoteMoney.hostPayoutUsd
            : null;

      const breakdown = (() => {
        const items = quoteMoney?.invoiceItems;
        if (!Array.isArray(items)) return null;
        const acc = { accommodation: 0, cleaning: 0, taxes: 0, fees: 0, deposit: 0 };
        items.forEach((item) => {
          const amt = typeof item?.amount === "number" ? item.amount : null;
          if (amt === null) return;
          const t = (item?.normalType || item?.type || "").toUpperCase();
          if (t === "AF" || t === "ACCOMMODATION_FARE") acc.accommodation += amt;
          else if (t === "CF" || t === "CLEANING_FEE") acc.cleaning += amt;
          else if (t === "OCT" || t === "TAX" || t === "OCCUPANCY_TAX") acc.taxes += amt;
          else if (t === "AFE" || t === "ADDITIONAL") {
            const second = (item?.secondIdentifier || "").toUpperCase();
            if (second === "DEPOSIT") acc.deposit += amt;
            else acc.fees += amt;
          } else {
            acc.fees += amt;
          }
        });
        return acc;
      })();

      setAvailability((prev) => ({
        ...prev,
        [listing.id]: {
          status: "ready",
          available: isAvailable,
          nightly,
          total,
          hostPayout,
          breakdown,
          currency: quoteCurrency,
          lastQuery: requestKey,
          timestamp: Date.now(),
          raw: { availability: availJson, quote: quoteData },
        },
      }));
    } catch (err) {
      setAvailability((prev) => ({
        ...prev,
        [listing.id]: {
          status: "error",
          lastQuery: requestKey,
          timestamp: Date.now(),
          message:
            err?.name === "AbortError"
              ? "Guesty timed out. Please retry."
              : "Could not reach Guesty right now. Please retry.",
        },
      }));
    }
  };

  const handleOpenModal = (listing) => {
    setModalListing(listing);
    setModalHero(listing.picture);
    setIsModalOpen(true);
    setActiveListingId(listing.id);
    checkAvailability(listing);
  };

  const handleBook = async () => {
    if (!activeListingId) {
      alert("Select a unit first.");
      return;
    }
    if (!search.checkIn || !search.checkOut) {
      alert("Pick dates before booking.");
      return;
    }
    if (!bookingInfo.firstName || !bookingInfo.lastName || !bookingInfo.email) {
      alert("Fill in guest name and email.");
      return;
    }

    const avail = availability[activeListingId];
    if (!avail || avail.status !== "ready" || avail.available === false) {
      alert("This unit is not available for the selected dates yet.");
      return;
    }

    const amount = avail.hostPayout ?? avail.total;
    const currency = avail.currency || selectedListing?.currency || "USD";
    if (!amount || amount <= 0) {
      alert("Pricing is missing. Please refresh availability.");
      return;
    }

    const guestsTotal =
      (Number.isFinite(Number(search.adults)) ? Number(search.adults) : 1) +
      (Number.isFinite(Number(search.children)) ? Number(search.children) : 0);

    setBookingState({ status: "loading", message: "" });

    try {
      const res = await fetch(`${apiBase}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: activeListingId,
          listingTitle: selectedListing?.title,
          checkIn: search.checkIn,
          checkOut: search.checkOut,
          guests: guestsTotal,
          amount,
          currency,
          guest: bookingInfo,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.message || "Booking failed");
      }

      if (json.url) {
        window.location.href = json.url;
        return;
      }

      setBookingState({ status: "success", message: "Redirecting to payment..." });
    } catch (err) {
      setBookingState({ status: "error", message: err.message });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#050505] via-[#0a0a0a] to-[#050505] text-[#f6f0e5]">
      <div className="absolute inset-0 -z-10 opacity-50 bg-[radial-gradient(circle_at_15%_20%,#b68d2d_0,#0a0a0a_38%),radial-gradient(circle_at_80%_0,#f1c55d_0,#0a0a0a_42%),radial-gradient(circle_at_50%_82%,#d4b04c_0,#050505_48%)]" />
      <header className="relative z-10 max-w-6xl mx-auto px-6 pt-12 pb-8">
        <div className="flex flex-col gap-4 md:gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-amber-300">OneLuxStay</p>
            <h1 className="text-3xl md:text-4xl font-semibold text-white leading-tight">
              Direct booking portal connected to Guesty
            </h1>
            <p className="text-slate-300 mt-2 max-w-2xl">
              Live inventory, real-time price checks, and fast booking even on slow connections.
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm text-slate-200 backdrop-blur">
            <p className="font-semibold text-white">API status</p>
            <p className="text-amber-300">Connected to Guesty Booking API</p>
            <p className="text-xs text-slate-400">Token cached to reduce bandwidth + rate limits</p>
          </div>
        </div>

        <div className="mt-6">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur relative">
            <p className="text-sm font-semibold text-white mb-3">Search dates</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <DateRangePicker
                  value={search}
                  onChange={(val) =>
                    setSearch((prev) => ({
                      ...prev,
                      checkIn: val.checkIn,
                      checkOut: val.checkOut,
                    }))
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">Adults</label>
                <input
                  type="number"
                  min="1"
                  value={search.adults}
                  onChange={(e) => handleSearchChange("adults", Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-300">Children</label>
                <input
                  type="number"
                  min="0"
                  value={search.children}
                  onChange={(e) => handleSearchChange("children", Number(e.target.value))}
                  className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none focus:border-amber-400"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              <p>
                {nights > 0 ? `${nights} night stay selected` : "Select dates to check availability & rates"}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-6xl mx-auto px-6 pb-14">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">
            Available units {availableCount > 0 ? `(${availableCount})` : ""}
          </h2>
        </div>

        {cityOptions.length > 1 && (
          <div className="mb-5 flex flex-wrap gap-3">
            {cityOptions.map(({ city, image }) => {
              const active = cityFilter === city;
              return (
                <button
                  key={city}
                  onClick={() => setCityFilter(city)}
                  className={`group inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold tracking-wide transition ${
                    active
                      ? "border-amber-400 bg-amber-500/15 text-amber-100 shadow-lg shadow-amber-500/20"
                      : "border-white/10 bg-white/5 text-slate-200 hover:border-amber-300/50 hover:text-white"
                  }`}
                >
                  {image && (
                    <span className="h-8 w-8 overflow-hidden rounded-full border border-white/15 bg-slate-800">
                      <img src={image} alt={city} className="h-full w-full object-cover" loading="lazy" />
                    </span>
                  )}
                  <span>{city.toUpperCase()}</span>
                </button>
              );
            })}
          </div>
        )}

        {loadingListings && (
          <div className="grid gap-4 sm:grid-cols-2">
            {[1, 2].map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 animate-pulse">
                <div className="h-40 rounded-xl bg-white/10" />
                <div className="mt-3 h-4 w-2/3 bg-white/10 rounded" />
                <div className="mt-2 h-3 w-1/2 bg-white/5 rounded" />
              </div>
            ))}
          </div>
        )}

        {listingsError && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
            {listingsError}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          {filteredListings.map((listing) => {
            const status = availability[listing.id] || {};
            const displayTotal = status.hostPayout ?? status.total;
            const displayNightly = status.nightly ?? listing.basePrice;
            const canBook = status.status === "ready" && status.available !== false;

            return (
              <article
                key={listing.id}
                className="group rounded-2xl border border-white/10 bg-white/5 p-4 shadow-lg transition hover:border-amber-400/40"
              >
                <div className="relative overflow-hidden rounded-xl bg-slate-900">
                  {listing.picture ? (
                    <img
                      src={listing.picture}
                      alt={listing.title}
                      loading="lazy"
                      className="h-48 w-full object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="h-48 w-full bg-slate-800" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 to-transparent" />
                  <div className="absolute bottom-3 left-3 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-200 backdrop-blur">
                    Sleeps {listing.accommodates} {listing.bedrooms} BR  ·  {listing.bathrooms} BA
                  </div>
                </div>
                <div className="mt-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-amber-200">
                      {listing.location || listing.timezone || "OneLuxStay"}
                    </p>
                    <h3 className="text-lg font-semibold text-white leading-tight">{listing.title}</h3>
                    <p className="text-sm text-slate-300">
                      From {formatCurrency(listing.basePrice, listing.currency)} / night  ·  Cleaning: {formatCurrency(listing.cleaningFee, listing.currency)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-2 text-sm text-slate-200">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  {status.status === "ready" && status.available !== false && (
                    <span>
                      Available  ·  {formatCurrency(displayNightly, status.currency)} avg/night{" "}
                      {displayTotal ? ` ·  ${formatCurrency(displayTotal, status.currency)} total` : ""}
                      {status.hostPayout ? " " : ""}
                    </span>
                  )}
                  {status.status === "ready" && status.available === false && <span>Not available for your dates</span>}
                  {status.status === "loading" && <span>Checking Guesty · </span>}
                  {status.status === "error" && <span className="text-rose-200">{status.message}</span>}
                  {status.status === undefined && <span>Click  · Check price ·  to fetch live availability</span>}
                </div>

                {status.status === "ready" && status.available !== false && status.breakdown && (
                  <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
                    {status.breakdown.accommodation > 0 && (
                      <span>Stay: {formatCurrency(status.breakdown.accommodation, status.currency)}</span>
                    )}
                    {status.breakdown.cleaning > 0 && (
                      <span>Cleaning: {formatCurrency(status.breakdown.cleaning, status.currency)}</span>
                    )}
                    {status.breakdown.taxes > 0 && (
                      <span>Taxes: {formatCurrency(status.breakdown.taxes, status.currency)}</span>
                    )}
                    {status.breakdown.fees > 0 && (
                      <span>Fees: {formatCurrency(status.breakdown.fees, status.currency)}</span>
                    )}
                    {status.breakdown.deposit > 0 && (
                      <span>Deposit: {formatCurrency(status.breakdown.deposit, status.currency)}</span>
                    )}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleOpenModal(listing)}
                    className="rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white border border-white/10 hover:border-amber-400/60 transition"
                  >
                    Check price & availability
                  </button>
                  {canBook && (
                    <button
                      onClick={() => {
                        setActiveListingId(listing.id);
                        handleBook();
                      }}
                      className="rounded-lg bg-amber-400 px-3 py-2 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/30 transition hover:bg-amber-300"
                    >
                      Book this stay
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>

      {isModalOpen && modalListing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overflow-x-hidden bg-[#020202]/80 px-3 py-6 sm:px-4 sm:py-10 backdrop-blur">
          <div className="relative w-full max-w-full sm:max-w-5xl rounded-2xl border border-amber-400/25 bg-[#0a0a0a]/95 shadow-[0_20px_80px_rgba(0,0,0,0.8)] overflow-hidden">
            <button
              onClick={() => {
                setIsModalOpen(false);
                setModalListing(null);
              }}
              className="absolute right-3 top-3 rounded-full border border-amber-300/50 bg-white/5 px-3 py-1 text-xs font-semibold text-white hover:border-amber-400 hover:bg-amber-400/10"
            >
              Close
            </button>
            <div className="p-4 sm:p-6 space-y-4">
              <div className="flex flex-col gap-1">
                <p className="text-xs uppercase tracking-[0.2em] text-amber-300">Listing details</p>
                <h3 className="text-2xl font-semibold text-white">{modalListing.title}</h3>
                <p className="text-sm text-amber-100/80">
                  {normalizeCity(modalListing) || modalListing.location || modalListing.propertyType || "OneLuxStay"}
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[3fr,2fr]">
                <div className="space-y-4 min-w-0">
                  <div className="overflow-hidden rounded-xl border border-amber-300/20 bg-black/40">
                    <img
                      src={modalHero || modalListing.picture}
                      alt={modalListing.title}
                      className="h-56 w-full min-w-0 object-cover sm:h-80"
                      loading="lazy"
                    />
                  </div>
                  {Array.isArray(modalListing.pictures) && modalListing.pictures.length > 0 && (
                    <div className="rounded-xl border border-amber-300/20 bg-black/30 p-3 overflow-hidden">
                      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        {modalListing.pictures.map((pic) => {
                          const src = pic.original || pic.thumbnail || modalListing.picture;
                          return (
                            <button
                              key={pic._id || pic.original || pic.thumbnail}
                              onClick={() => setModalHero(src)}
                              className="h-20 w-28 flex-shrink-0 overflow-hidden rounded-lg border border-amber-200/20 bg-[#0f0f0f] focus:outline-none focus:ring-2 focus:ring-amber-400"
                            >
                              <img
                                src={src}
                                alt={pic.caption || modalListing.title}
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4 rounded-xl border border-amber-300/20 bg-[#0d0d0d]/95 p-4 text-sm text-amber-50">
                  <div>
                    <p className="font-semibold text-amber-200">Description</p>
                    <p className="mt-1 whitespace-pre-line text-amber-100/80">
                      {modalListing.publicDescription?.summary || "No description provided."}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-amber-100/80">
                    <span>Bedrooms: {modalListing.bedrooms ?? "--"}</span>
                    <span>Bathrooms: {modalListing.bathrooms ?? "--"}</span>
                    <span>Accommodates: {modalListing.accommodates ?? "--"}</span>
                    <span>Property type: {modalListing.propertyType || "--"}</span>
                  </div>
                  <div className="text-sm text-amber-100/90">
                    <p className="font-semibold text-amber-200">Dates</p>
                    <p className="mt-1">
                      {search.checkIn && search.checkOut
                        ? `${formatDisplayDate(search.checkIn)} → ${formatDisplayDate(search.checkOut)}${nights
                          ? ` (${nights} night${nights === 1 ? "" : "s"})`
                          : ""
                        }`
                        : "No dates selected"}
                    </p>
                  </div>
                  {modalAvailability?.status === "ready" && modalAvailability?.available !== false && (
                    <div className="mt-2 space-y-1 text-sm">
                      <p className="text-amber-300">
                        Available  ·  {formatCurrency(modalAvailability.nightly, modalAvailability.currency)} avg/night{" "}
                        {modalAvailability.hostPayout
                          ? ` ·  ${formatCurrency(modalAvailability.hostPayout, modalAvailability.currency)} total`
                          : modalAvailability.total
                            ? ` ·  ${formatCurrency(modalAvailability.total, modalAvailability.currency)} total`
                            : ""}
                      </p>
                      {modalAvailability.breakdown && (
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-amber-100/80">
                          {modalAvailability.breakdown.accommodation > 0 && (
                            <span>Stay: {formatCurrency(modalAvailability.breakdown.accommodation, modalAvailability.currency)}</span>
                          )}
                          {modalAvailability.breakdown.cleaning > 0 && (
                            <span>Cleaning: {formatCurrency(modalAvailability.breakdown.cleaning, modalAvailability.currency)}</span>
                          )}
                          {modalAvailability.breakdown.taxes > 0 && (
                            <span>Taxes: {formatCurrency(modalAvailability.breakdown.taxes, modalAvailability.currency)}</span>
                          )}
                          {modalAvailability.breakdown.fees > 0 && (
                            <span>Fees: {formatCurrency(modalAvailability.breakdown.fees, modalAvailability.currency)}</span>
                          )}
                          {modalAvailability.breakdown.deposit > 0 && (
                            <span>Deposit: {formatCurrency(modalAvailability.breakdown.deposit, modalAvailability.currency)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {modalAvailability?.status === "ready" && modalAvailability?.available === false && (
                    <p className="text-rose-300">Not available for your dates.</p>
                  )}
                  {modalAvailability?.status === "loading" && <p className="text-amber-100/80">Checking Guesty · </p>}

                  {modalAvailability?.status === "ready" && modalAvailability?.available !== false && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-semibold text-amber-200">Booking</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                        <input
                          placeholder="First name"
                          value={bookingInfo.firstName}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, firstName: e.target.value }))}
                          className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                        <input
                          placeholder="Last name"
                          value={bookingInfo.lastName}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, lastName: e.target.value }))}
                          className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                        <input
                          type="email"
                          placeholder="Email"
                          value={bookingInfo.email}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, email: e.target.value }))}
                          className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                        <input
                          placeholder="Phone"
                          value={bookingInfo.phone}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, phone: e.target.value }))}
                          className="rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                        <input
                          placeholder="Notes / requests"
                          value={bookingInfo.notes}
                          onChange={(e) => setBookingInfo((p) => ({ ...p, notes: e.target.value }))}
                          className="sm:col-span-2 rounded-lg border border-white/10 bg-slate-900/70 px-3 py-2 text-white placeholder:text-slate-500 outline-none focus:border-amber-400"
                        />
                      </div>
                      <button
                        onClick={handleBook}
                        disabled={bookingState.status === "loading"}
                        className="w-full rounded-lg bg-amber-400 px-4 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-amber-500/30 transition hover:bg-amber-300 disabled:opacity-60"
                      >
                        {bookingState.status === "loading" ? "Sending to Guesty..." : "Book this stay"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const NavBar = () => {
  const location = useLocation();
  return (
    <div className="navbar-shell">
      <div className="navbar">
        <Link to="/" className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-amber-200 shadow-lg shadow-amber-500/30" />
          OneLuxStay
        </Link>
        <div className="flex items-center gap-2 text-sm font-semibold">
          {[
            { path: "/", label: "Home" },
            { path: "/listings", label: "Residences" },
          ].map((item) => {
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`rounded-full px-3 py-2 transition ${
                  active
                    ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/30"
                    : "text-white hover:text-amber-100 hover:bg-white/10"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#050505] text-white">
        <NavBar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/listings" element={<ListingsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
