import { Link, useNavigate } from "react-router-dom";
import { useEffect, useLayoutEffect, useRef, useState, useMemo, useId } from "react";
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
    label: "The OneLuxStay way",
    headline: "Luxury with a rhythm that matches yours.",
    copy: "Every detail is intentional - layered lighting, tactile materials, silent climate control, and seamless tech. Your concierge orchestrates arrivals, perks, and departures.",
    image:
      "https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1170&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  },
  {
    label: "Seamless arrivals",
    headline: "Design-first homes",
    copy: "Warm lighting, tactile textures, and cinematic views in every address.",
    image:
      "https://assets.guesty.com/image/upload/v1730119087/production/666b3af27fc6d5653142b0af/npeczkhmy9wff4lzuyvr.jpg",
  },
  {
    label: "Hotel-grade service",
    headline: "Concierge, daily refresh",
    copy: "In-home experiences tailored to you with on-call support for every stay.",
    image:
      "https://assets.guesty.com/image/upload/v1760535614/production/666b3af27fc6d5653142b0af/t7p3cc6hqez89wsmj1gt.jpg",
  },
  {
    label: "Instant availability",
    headline: "Real-time calendars",
    copy: "Stay dates and pricing update live across every unit in our collection.",
    image:
      "https://assets.guesty.com/image/upload/v1732914973/production/666b3af27fc6d5653142b0af/jpotm8nwcbvufegnbcnx.jpg",
  },
  {
    label: "How it works",
    headline: "Plan",
    copy: "Tell us your dates and vibe - we'll shortlist the right residences.",
    image:
      "https://assets.guesty.com/image/upload/v1740605753/production/666b3af27fc6d5653142b0af/hzvwqjuhjpwkkmyea38s.jpg",
  },
  {
    label: "How it works",
    headline: "Reserve + Unwind",
    copy: "Live availability, transparent pricing, and concierge on standby. Arrive to a prepared home with optional chef, spa, or driver.",
    image:
      "https://assets.guesty.com/image/upload/v1729089198/production/666b3af27fc6d5653142b0af/ksjnj1kppnbajljv9csi.jpg",
  },
];

const heroSlides = [
  "https://images.unsplash.com/photo-1534253893894-10d024888e49?q=80&w=1800&auto=format&fit=crop&ixlib=rb-4.1.0",
  "https://assets.guesty.com/image/upload/v1729880354/production/666b3af27fc6d5653142b0af/yc51idfkqenc81wnse8n.jpg",
  "https://assets.guesty.com/image/upload/v1760535614/production/666b3af27fc6d5653142b0af/t7p3cc6hqez89wsmj1gt.jpg",
];

const cityShowcaseTones = [
  "linear-gradient(180deg, rgba(249, 248, 246, 0.95), rgba(239, 233, 227, 0.92))",
  "linear-gradient(180deg, rgba(239, 233, 227, 0.9), rgba(249, 248, 246, 0.9))",
  "linear-gradient(180deg, rgba(217, 207, 199, 0.45), rgba(249, 248, 246, 0.92))",
];

const offers = [
  {
    kicker: "Starring you, somewhere new",
    headline: "Save on our seasonal edit",
    body: "Enjoy up to 20% off select stays in Antwerp, Dubai, and Los Angeles.",
    cta: "Book now",
    tone: "dark",
  },
  {
    kicker: "Extend your stay",
    headline: "Stay longer for less",
    body: "Up to 25% off for 7+ nights in our signature residences.",
    cta: "Explore offer",
    tone: "sand",
  },
  {
    kicker: "Member benefits",
    headline: "Priority perks, always",
    body: "Early check-in, late check-out, and concierge credits on repeat stays.",
    cta: "Join perks",
    tone: "clay",
  },
  {
    kicker: "Advance booking",
    headline: "Plan ahead, save more",
    body: "Unlock special pricing when you reserve 45+ days in advance.",
    cta: "View details",
    tone: "sand",
  },
  {
    kicker: "Last-minute escape",
    headline: "Spontaneous stay deals",
    body: "Limited-time rates on select homes for arrivals within 7 days.",
    cta: "See last-minute",
    tone: "dark",
  },
  {
    kicker: "Signature suites",
    headline: "Upgrade on us",
    body: "Complimentary room upgrades on eligible midweek bookings.",
    cta: "Check upgrades",
    tone: "clay",
  },
];

const DateRangePicker = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const checkInLabelId = useId();
  const checkOutLabelId = useId();
  const dialogId = useId();
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
          <label id={checkInLabelId} className="text-[11px] uppercase tracking-[0.14em] text-slate-200/80">
            Check-in
          </label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkInLabelId}
            aria-label={`Check-in date, ${startDate
              ? startDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : "no date selected"
              }`}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {startDate ? startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Add date"}
          </button>
        </div>
        <div className="flex flex-col gap-1">
          <label id={checkOutLabelId} className="text-[11px] uppercase tracking-[0.14em] text-slate-200/80">
            Check-out
          </label>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-controls={dialogId}
            aria-labelledby={checkOutLabelId}
            aria-label={`Check-out date, ${endDate
              ? endDate.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })
              : "no date selected"
              }`}
            className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {endDate ? endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Add date"}
          </button>
        </div>
      </div>

      {open && (
        <div
          id={dialogId}
          role="dialog"
          aria-modal="true"
          aria-label="Choose dates"
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
                  <div className="grid grid-cols-7 gap-2 text-center text-xs text-slate-300" role="row">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                      <div key={d} role="columnheader">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-2" role="grid">
                    {monthObj.cells.map((day, idx) => {
                      const disabled = !day || day < today;
                      const selected = (startDate && isSameDay(day, startDate)) || (endDate && isSameDay(day, endDate));
                      const between = inRange(day) && !selected;
                      const dayLabel = day
                        ? day.toLocaleDateString(undefined, {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })
                        : "";
                      return (
                        <button
                          key={`${monthObj.year}-${monthObj.month}-${idx}`}
                          type="button"
                          disabled={disabled}
                          aria-selected={selected}
                          aria-disabled={disabled}
                          aria-label={dayLabel}
                          aria-hidden={day ? undefined : true}
                          onClick={() => handleDayClick(day)}
                          className={`h-10 rounded-lg border text-sm transition ${disabled
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

function LandingPage() {
  const navigate = useNavigate();
  const [destination, setDestination] = useState("All");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(1);
  const showcaseRef = useRef(null);
  const offersRef = useRef(null);
  const [activeShowcase, setActiveShowcase] = useState(0);
  const [isHeroPaused, setIsHeroPaused] = useState(false);
  const patienceQuotes = [
    "We are working on this. “Greatest things come to those who wait.”",
    "We are working on this. “Patience is not the ability to wait, but the ability to keep a good attitude while waiting.”",
    "We are working on this. “All things are difficult before they are easy.”",
    "We are working on this. “The two most powerful warriors are patience and time.”",
    "We are working on this. “Slow and steady wins the race.”",
  ];
  const [cityNoticeIndex, setCityNoticeIndex] = useState(0);
  const [cityNotice, setCityNotice] = useState("");

  const cityRoutes = {
    Antwerp: "/antwerp",
    "Los Angeles": "/losangeles",
  };

  const handleCityClick = (city) => {
    const route = cityRoutes[city];
    if (route) {
      setCityNotice("");
      navigate(route);
      return;
    }
    const next = (cityNoticeIndex + 1) % patienceQuotes.length;
    setCityNoticeIndex(next);
    setCityNotice(patienceQuotes[next]);
  };

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

  useEffect(() => {
    const el = showcaseRef.current;
    if (!el) return;
    const handleScroll = () => {
      const half = el.scrollWidth / 2;
      if (el.scrollLeft >= half) {
        el.scrollLeft -= half;
      } else if (el.scrollLeft <= 0) {
        el.scrollLeft += half;
      }
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const el = showcaseRef.current;
    if (!el) return;
    const cards = () => Array.from(el.querySelectorAll(".landing-showcase-card"));
    let raf = 0;

    const updateActive = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const list = cards();
        if (list.length === 0) return;
        const viewportCenter = el.scrollLeft + el.clientWidth / 2;
        let closestIdx = 0;
        let closestDistance = Infinity;
        list.forEach((card, idx) => {
          const cardCenter = card.offsetLeft + card.offsetWidth / 2;
          const distance = Math.abs(viewportCenter - cardCenter);
          if (distance < closestDistance) {
            closestDistance = distance;
            closestIdx = idx;
          }
        });
        setActiveShowcase(closestIdx);
      });
    };

    updateActive();
    el.addEventListener("scroll", updateActive, { passive: true });
    window.addEventListener("resize", updateActive);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("scroll", updateActive);
      window.removeEventListener("resize", updateActive);
    };
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
          aria-hidden="true"
          className="hero-media hero-media__slideshow"
          style={{ "--slide-count": heroSlides.length, "--slide-duration": "6s" }}
        >
          {heroSlides.map((src, idx) => (
            <div
              key={src}
              className={`hero-slide${isHeroPaused ? " is-paused" : ""}`}
              style={{ backgroundImage: `url(${src})`, "--slide-delay": `${idx * 6}s` }}
            />
          ))}
        </div>
        <div className="hero-media__overlay" aria-hidden="true" />
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
          <button
            type="button"
            className="landing-hero-control"
            aria-pressed={isHeroPaused}
            aria-label={isHeroPaused ? "Play background slideshow" : "Pause background slideshow"}
            title={isHeroPaused ? "Play slideshow" : "Pause slideshow"}
            onClick={() => setIsHeroPaused((prev) => !prev)}
          >
            <span className="landing-hero-control__icon" aria-hidden="true">
              {isHeroPaused ? (
                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                  <path d="M8 6.25v11.5a.75.75 0 0 0 1.16.62l9-5.75a.75.75 0 0 0 0-1.24l-9-5.75A.75.75 0 0 0 8 6.25z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" role="presentation" focusable="false">
                  <path d="M7 6.5c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v11c0 .55-.45 1-1 1H8c-.55 0-1-.45-1-1v-11zm6 0c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v11c0 .55-.45 1-1 1h-2c-.55 0-1-.45-1-1v-11z" />
                </svg>
              )}
            </span>
          </button>

          <div className="landing-chip-row">
            {["Antwerp", "Dubai", "Los Angeles", "Hollywood", "Redondo Beach", "Miami Beach"].map((city) => (
              <button
                key={city}
                type="button"
                className={`landing-chip${cityRoutes[city] ? "" : " landing-chip--disabled"}`}
                onClick={() => handleCityClick(city)}
              >
                {city.toUpperCase()}
              </button>
            ))}
          </div>
          {cityNotice && (
            <div className="landing-chip-notice" role="status" aria-live="polite">
              {cityNotice}
            </div>
          )}

          <form className="landing-hero-form glass" onSubmit={handleHeroSubmit}>
            <div className="landing-form-field">
              <label htmlFor="landing-destination">Destination</label>
              <select id="landing-destination" value={destination} onChange={(e) => setDestination(e.target.value)}>
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
              <label htmlFor="landing-guests">Guests</label>
              <select id="landing-guests" value={guests} onChange={(e) => setGuests(Number(e.target.value) || 1)}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="landing-cta-primary w-full md:w-auto">Book</button>
          </form>
        </div>
      </header>

      <main>
        <section id="collection" className="landing-showcase-section py-16 md:py-20 landing-animate">
          <div className="landing-showcase-inner px-6 md:px-10">
            <div className="landing-section-head flex items-center justify-between gap-6 flex-col md:flex-row">
              <div className="max-w-2xl">
                <p className="landing-kicker">Signature stays</p>
                <h2 className="landing-display text-3xl md:text-4xl">
                  Iconic cities, <span className="landing-title-italic">unforgettable stays</span>
                </h2>
                <p className="text-slate-300 mt-2">
                  A world of refined penthouses and skyline suites, each curated to match the rhythm of its city.
                </p>
              </div>
              <Link to="/stay" className="landing-link">Book your dates</Link>
            </div>
          </div>
          <div className="landing-showcase landing-showcase--carousel mt-10" aria-label="Featured city stays">
            <div className="landing-showcase-scroll" ref={showcaseRef} aria-live="off">
              <div className="landing-showcase-track">
                {stays.concat(stays).map((stay, idx) => (
                  <div
                    key={`${stay.headline}-${idx}`}
                    className={`landing-showcase-card ${idx === activeShowcase ? "is-center" : ""}`}
                    data-index={idx}
                    style={{ background: cityShowcaseTones[idx % cityShowcaseTones.length] }}
                  >
                    <div className="landing-showcase-image" style={{ backgroundImage: `url(${stay.image})` }} aria-hidden="true" />
                    <div className="landing-showcase-meta">
                      <p className="landing-showcase-kicker">{stay.label}</p>
                      <h3 className="landing-showcase-title">{stay.headline}</h3>
                      <p className="landing-showcase-copy">{stay.copy}</p>
                      <div className="landing-showcase-actions">
                        <Link to="/stay" className="landing-cta-secondary">View availability</Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="landing-showcase-controls">
              <button
                type="button"
                className="landing-showcase-btn"
                aria-label="Scroll left"
                onClick={() => showcaseRef.current?.scrollBy({ left: -360, behavior: "smooth" })}
              >
                {"<"}
              </button>
              <button
                type="button"
                className="landing-showcase-btn"
                aria-label="Scroll right"
                onClick={() => showcaseRef.current?.scrollBy({ left: 360, behavior: "smooth" })}
              >
                {">"}
              </button>
            </div>
          </div>
        </section>

        <section className="landing-fullbleed landing-stack landing-animate">
          {stays.map((stay, idx) => (
            <div
              key={`${stay.label}-full`}
              className="landing-city-card"
              style={{
                backgroundImage: `url(${stay.image})`,
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

        <section id="experience" className="landing-offers-section landing-animate">
          <div className="landing-offers-inner max-w-6xl mx-auto px-6 md:px-10 py-16 md:py-20">
            <div className="landing-offers-head">
              <div className="landing-offers-copy">
                <p className="landing-kicker">Our offers</p>
                <h2 className="landing-display text-3xl md:text-4xl">
                  Make a smart stay smoother.
                </h2>
                <p className="text-slate-300 mt-2">
                  Limited-time perks and always-on benefits, curated for your next OneLuxStay.
                </p>
              </div>
              <div className="landing-offers-controls">
                <button
                  type="button"
                  className="landing-showcase-btn"
                  aria-label="Scroll offers left"
                  onClick={() => offersRef.current?.scrollBy({ left: -420, behavior: "smooth" })}
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  className="landing-showcase-btn"
                  aria-label="Scroll offers right"
                  onClick={() => offersRef.current?.scrollBy({ left: 420, behavior: "smooth" })}
                >
                  {">"}
                </button>
              </div>
            </div>
          </div>
          <div className="landing-offers-row" ref={offersRef}>
            {offers.map((offer) => (
              <article key={offer.headline} className={`landing-offer-card offer-${offer.tone}`}>
                <p className="landing-offer-kicker">{offer.kicker}</p>
                <h3 className="landing-offer-title">{offer.headline}</h3>
                <p className="landing-offer-body">{offer.body}</p>
                <Link to="/stay" className="landing-offer-cta">{offer.cta}</Link>
              </article>
            ))}
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
                href="mailto:reservation@oneluxstay.com"
                className="landing-cta-secondary"
              >
                Email concierge
              </a>
            </div>
          </div>
        </section>
        <footer className="landing-footer">
          <div className="landing-footer-inner">
            <div className="landing-footer-brand">
              <p className="landing-logo-mark">OneLuxStay</p>
              <p className="landing-footer-copy">
                Curated stays, hotel-grade service, and concierge support in every city.
              </p>
            </div>
            <div className="landing-footer-links">
              <Link to="/stay">Browse stays</Link>
              <a href="mailto:reservation@oneluxstay.com">reservation@oneluxstay.com</a>
              <a href="tel:+1 213 866 3589">+1 (213) 866-3589</a>
            </div>
            <div className="landing-footer-meta">
              <p className="landing-footer-kicker">Concierge</p>
              <p>Available 24/7</p>
              <p className="landing-footer-kicker">Email</p>
              <p>Response within 24 hours</p>
            </div>
          </div>
          <div className="landing-footer-bottom">
            <p>© {new Date().getFullYear()} OneLuxStay. All rights reserved.</p>
            <div className="landing-footer-legal">
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default LandingPage;
