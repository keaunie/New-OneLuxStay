import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import SiteFooter from "./components/SiteFooter";
import { CONTACT_EMAIL, CONTACT_REGION_MAP } from "./utils/contactConfig";
import { trackCtaClick, trackPhoneCallClick } from "./lib/analytics";
import apiBase from "./utils/apiBase";
import "./HealthcareProfessionalsPage.css";

const primaryPhone = CONTACT_REGION_MAP.us.phone;
const healthcareEmailHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "Healthcare professional stay inquiry",
)}`;

const initialInquiryForm = {
  bedrooms: "1",
  city: "",
  companyName: "",
  inquiringFor: "Booking for myself",
  fullName: "",
  email: "",
  phone: "",
  budget: "",
  checkIn: "",
  checkOut: "",
  adults: "1",
  children: "0",
  parking: false,
  pets: false,
  notes: "",
};

const bedroomOptions = ["1", "2", "3", "4"];
const guestCountOptions = ["0", "1", "2", "3", "4", "5", "6", "7", "8"];
const inquiryForOptions = ["Booking for myself", "Booking for an employee", "Booking for a team", "Booking for a patient family"];

const buildInquiryEmailHref = (form) => {
  const lines = [
    "Healthcare professional stay inquiry",
    "",
    `Number of bedrooms: ${form.bedrooms || "-"}`,
    `City: ${form.city || "-"}`,
    `Company name: ${form.companyName || "-"}`,
    `Inquiring for: ${form.inquiringFor || "-"}`,
    `Full name: ${form.fullName || "-"}`,
    `Email: ${form.email || "-"}`,
    `Phone: ${form.phone || "-"}`,
    `Budget per night: ${form.budget || "-"}`,
    `Check in: ${form.checkIn || "-"}`,
    `Check out: ${form.checkOut || "-"}`,
    `Adults: ${form.adults || "-"}`,
    `Children under 18: ${form.children || "0"}`,
    `Parking: ${form.parking ? "Yes" : "No"}`,
    `Pets: ${form.pets ? "Yes" : "No"}`,
    "",
    "Anything else?",
    form.notes || "-",
  ];

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Healthcare professional stay inquiry")}&body=${encodeURIComponent(
    lines.join("\n"),
  )}`;
};

const healthcareFeatures = [
  {
    icon: "pin",
    title: "Close to the Work That Matters",
    body:
      "We help prioritize residences with practical access to hospitals, clinics, and city medical districts, so more of your time can go to rest between demanding shifts.",
  },
  {
    icon: "home",
    title: "Residences Built for Living",
    body:
      "Fully furnished homes with kitchens, laundry access, work-friendly Wi-Fi, and room to decompress beyond what a standard hotel room can offer.",
  },
  {
    icon: "wellness",
    title: "Comfort Between Shifts",
    body:
      "Select properties offer amenities such as fitness centers, pools, outdoor areas, and quiet spaces that support a healthier rhythm while you are away from home.",
  },
  {
    icon: "card",
    title: "Clear Direct-Booking Pricing",
    body:
      "Utilities, fees, and property-specific inclusions are presented before you commit, with direct-booking support for longer assignments and group needs.",
  },
  {
    icon: "star",
    title: "Prepared and Professionally Managed",
    body:
      "Every stay is handled by the OneLuxStay team with guest-ready preparation, responsive communication, and standards shaped for extended private living.",
  },
  {
    icon: "calendar",
    title: "Flexible Assignment Support",
    body:
      "Assignment dates can change. We help with extensions, shorter stays, and transitions whenever availability allows.",
  },
  {
    icon: "team",
    title: "Support for Individuals and Teams",
    body:
      "Whether you are traveling solo or placing a healthcare team, our reservations team can help coordinate options by city, date, budget, and property needs.",
  },
];

const healthcareStats = [
  { value: "5", label: "Curated Cities" },
  { value: "1-4", label: "Bedroom Options" },
  { value: "Direct", label: "Booking Support" },
  { value: "Clear", label: "Pricing Guidance" },
];

const healthcareLocations = [
  "Antwerp, Belgium",
  "Dubai, UAE",
  "Hollywood, CA",
  "Los Angeles, CA",
  "Redondo Beach, CA",
];

const healthcareFaqs = [
  {
    question: "How do I book a suite for a healthcare assignment?",
    answer:
      "Share your assignment city, preferred dates, guest count, and any must-have requirements. Our reservations team will help match you with available OneLuxStay options and confirm the details before you book.",
  },
  {
    question: "Can I extend if my assignment changes?",
    answer:
      "Often, yes. Extensions depend on property availability and the booking terms for your stay. Contact us as early as possible so we can protect your current residence or help find a smooth alternative.",
  },
  {
    question: "Do your residences include parking?",
    answer:
      "Parking varies by property. Some residences include parking, while others offer it at an additional cost or nearby. We disclose those details during inquiry and booking.",
  },
  {
    question: "Can you accommodate a healthcare team traveling together?",
    answer:
      "Yes, where availability allows. We can help coordinate multiple suites in the same building or nearby properties for healthcare organizations and travel teams.",
  },
  {
    question: "What is included in the rate?",
    answer:
      "Inclusions vary by property, but stays commonly include furnishings, utilities, Wi-Fi, kitchen essentials, and access to listed amenities. Any property-specific fees or exclusions are shared before confirmation.",
  },
  {
    question: "Are pet-friendly options available?",
    answer:
      "Some properties may allow pets, subject to building rules, size limits, breed restrictions, and cleaning fees. Mention your pet during inquiry so we can guide you to suitable options.",
  },
];

const Icon = ({ kind }) => {
  if (kind === "pin") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3C10.5 3 6 7.5 6 13c0 8 10 16 10 16s10-8 10-16C26 7.5 21.5 3 16 3z" />
        <circle cx="16" cy="13" r="3.5" />
      </svg>
    );
  }
  if (kind === "home") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M3 17 16 6l13 11" />
        <path d="M7 14.5V27h6v-7h6v7h6V14.5" />
      </svg>
    );
  }
  if (kind === "wellness") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="M16 3c-4.4 5-9 9-9 14a9 9 0 0 0 18 0c0-5-4.6-9-9-14z" />
        <path d="M16 15v6M13 18h6" />
      </svg>
    );
  }
  if (kind === "card") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="3" y="8" width="26" height="18" rx="2" />
        <path d="M3 14h26M7 20h6M17 20h4" />
      </svg>
    );
  }
  if (kind === "star") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <path d="m16 3 3.5 7.5 8 1.2-5.8 5.6 1.4 8L16 21.5l-7.1 3.8 1.4-8-5.8-5.6 8-1.2L16 3z" />
      </svg>
    );
  }
  if (kind === "calendar") {
    return (
      <svg viewBox="0 0 32 32" aria-hidden="true">
        <rect x="3" y="5" width="26" height="24" rx="2" />
        <path d="M3 13h26M11 3v4M21 3v4M9 19h6M9 24h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="12" r="5.5" />
      <path d="M5.5 28c0-5.8 4.7-10.5 10.5-10.5S26.5 22.2 26.5 28" />
      <path d="M24.5 17c2.8 1.1 4.8 3.7 4.8 6.8M7.5 17c-2.8 1.1-4.8 3.7-4.8 6.8" />
    </svg>
  );
};

function HealthcareProfessionalsPage() {
  const sourcePage = "/healthcare-professionals";
  const [inquiryForm, setInquiryForm] = useState(initialInquiryForm);
  const [inquiryStatus, setInquiryStatus] = useState({ type: "", message: "" });
  const [isInquirySubmitting, setIsInquirySubmitting] = useState(false);
  const inquiryEmailFallbackHref = useMemo(() => buildInquiryEmailHref(inquiryForm), [inquiryForm]);

  const setInquiryField = (field) => (event) => {
    const { type, checked, value } = event.target;
    setInquiryForm((current) => ({
      ...current,
      [field]: type === "checkbox" ? checked : value,
    }));
  };

  const handleInquirySubmit = async (event) => {
    event.preventDefault();
    setInquiryStatus({ type: "", message: "" });

    if (!inquiryForm.fullName.trim() || !inquiryForm.email.trim() || !inquiryForm.checkIn || !inquiryForm.checkOut) {
      setInquiryStatus({
        type: "error",
        message: "Please add your full name, email, check-in, and check-out dates.",
      });
      return;
    }

    if (inquiryForm.checkOut <= inquiryForm.checkIn) {
      setInquiryStatus({
        type: "error",
        message: "Check-out must be after check-in.",
      });
      return;
    }

    setIsInquirySubmitting(true);
    try {
      const response = await fetch(`${apiBase}/healthcare-inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inquiryForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to send inquiry right now.");

      trackCtaClick({
        ctaText: "submit healthcare inquiry",
        location: "healthcare_inquiry_form",
        sourcePage,
      });
      setInquiryStatus({
        type: "success",
        message: "Your inquiry has been sent. Our reservations team will follow up by email.",
      });
      setInquiryForm(initialInquiryForm);
    } catch (error) {
      setInquiryStatus({
        type: "error",
        message: `${error?.message || "Unable to send inquiry right now."} You can still open an email draft below.`,
      });
    } finally {
      setIsInquirySubmitting(false);
    }
  };

  return (
    <div className="healthcare-page">
      <nav className="healthcare-nav" aria-label="Healthcare professionals navigation">
        <Link to="/" className="healthcare-nav__brand">
          <span className="healthcare-nav__logo">OneLuxStay</span>
          <span className="healthcare-nav__tagline">The Art of Luxurious Stays</span>
        </Link>
        <ul className="healthcare-nav__links">
          <li><Link to="/global">Properties</Link></li>
          <li><a href="#healthcare-benefits">Benefits</a></li>
          <li><a href="#healthcare-locations">Destinations</a></li>
          <li><a href="#healthcare-faq">FAQ</a></li>
        </ul>
        <a
          href="#healthcare-contact"
          className="healthcare-nav__cta"
          onClick={() =>
            trackCtaClick({
              ctaText: "book a stay",
              location: "healthcare_nav",
              sourcePage,
            })
          }
        >
          Book a Stay
        </a>
      </nav>

      <main>
        <section className="healthcare-hero">
          <p className="healthcare-eyebrow">For Healthcare Professionals</p>
          <h1>
            Where Rest Is <em>Part of the Treatment</em>
          </h1>
          <p className="healthcare-lead">
            Curated private residences for traveling nurses, physicians, allied health workers, and healthcare teams,
            designed around the recovery you deserve between the shifts that matter most.
          </p>
          <div className="healthcare-btn-row">
            <Link
              to="/global"
              className="healthcare-btn healthcare-btn--dark"
              onClick={() =>
                trackCtaClick({
                  ctaText: "explore suites",
                  location: "healthcare_hero",
                  sourcePage,
                })
              }
            >
              Explore Suites
            </Link>
            <a
              href={primaryPhone.telHref}
              className="healthcare-btn healthcare-btn--ghost"
              onClick={() => {
                trackPhoneCallClick({
                  phone: primaryPhone.telHref.replace(/^tel:/i, ""),
                  sourcePage,
                  location: "healthcare_hero",
                });
                trackCtaClick({
                  ctaText: "speak with a coordinator",
                  location: "healthcare_hero",
                  sourcePage,
                });
              }}
            >
              Speak with a Coordinator
            </a>
          </div>
        </section>

        <hr className="healthcare-rule" />

        <section className="healthcare-intro" aria-label="Healthcare accommodation introduction">
          <p>
            Healthcare assignments demand focus, stamina, and flexibility. Your accommodation should make the work
            easier, not heavier. OneLuxStay provides furnished, professionally managed residences that feel like a true
            sanctuary wherever your assignment takes you.
          </p>
        </section>

        <section id="healthcare-benefits" className="healthcare-features">
          <h2>Why Healthcare Professionals Choose OneLuxStay</h2>
          <div className="healthcare-features__grid">
            {healthcareFeatures.map((feature) => (
              <article key={feature.title} className="healthcare-feature-card">
                <span className="healthcare-feature-card__icon">
                  <Icon kind={feature.icon} />
                </span>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="healthcare-stats" aria-label="Healthcare stay highlights">
          <div className="healthcare-stats__grid">
            {healthcareStats.map((stat) => (
              <div key={stat.label} className="healthcare-stat">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="healthcare-quote" aria-label="Healthcare stay promise">
          <div className="healthcare-quote__mark" aria-hidden="true">"</div>
          <blockquote>
            After a long shift, the right residence gives you more than a place to sleep. It gives you privacy, routine,
            and enough quiet to return ready for the people depending on you.
          </blockquote>
          <cite>OneLuxStay Healthcare Stays</cite>
        </section>

        <hr className="healthcare-rule" />

        <section id="healthcare-locations" className="healthcare-locations">
          <h2>Where We Operate</h2>
          <p>OneLuxStay residences are available across six curated destinations worldwide.</p>
          <div className="healthcare-pills" aria-label="OneLuxStay destinations">
            {healthcareLocations.map((location) => (
              <span key={location}>{location}</span>
            ))}
          </div>
        </section>

        <hr className="healthcare-rule" />

        <section id="healthcare-faq" className="healthcare-faq">
          <h2>Frequently Asked Questions</h2>
          {healthcareFaqs.map((item) => (
            <details key={item.question} className="healthcare-faq__item">
              <summary>
                <span>{item.question}</span>
                <span className="healthcare-faq__plus" aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>

        <section id="healthcare-contact" className="healthcare-cta healthcare-inquiry-section">
          <div className="healthcare-inquiry-shell">
            <div className="healthcare-inquiry-copy">
              <p className="healthcare-eyebrow">Ready to Begin</p>
              <h2>Let's Find Your Suite</h2>
              <p>
                Tell us your assignment city, preferred dates, and any special requirements. We will prepare a tailored
                response for your healthcare stay.
              </p>
              <div className="healthcare-inquiry-proof" aria-label="Inquiry support details">
                <span>Special rates reviewed when available</span>
                <span>Team and individual placements</span>
                <span>Direct reservations support</span>
              </div>
              <a
                className="healthcare-cta__phone"
                href={primaryPhone.telHref}
                onClick={() =>
                  trackPhoneCallClick({
                    phone: primaryPhone.telHref.replace(/^tel:/i, ""),
                    sourcePage,
                    location: "healthcare_inquiry_copy",
                  })
                }
              >
                Prefer to talk? Call {primaryPhone.display}
              </a>
            </div>

            <form className="healthcare-inquiry-form" onSubmit={handleInquirySubmit}>
              <div className="healthcare-inquiry-form__glow" aria-hidden="true" />

              <div className="healthcare-form-field">
                <label htmlFor="healthcare-bedrooms">Number of Bedrooms</label>
                <select id="healthcare-bedrooms" value={inquiryForm.bedrooms} onChange={setInquiryField("bedrooms")}>
                  {bedroomOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="healthcare-form-field">
                <label htmlFor="healthcare-city">City</label>
                <select id="healthcare-city" value={inquiryForm.city} onChange={setInquiryField("city")}>
                  <option value="">Select a City</option>
                  {healthcareLocations.map((location) => (
                    <option key={location} value={location}>{location}</option>
                  ))}
                </select>
              </div>

              <div className="healthcare-form-field healthcare-form-field--company">
                <label htmlFor="healthcare-company">Company Name</label>
                <input
                  id="healthcare-company"
                  type="text"
                  value={inquiryForm.companyName}
                  onChange={setInquiryField("companyName")}
                  autoComplete="organization"
                />
                <p>We will check to see if your company has special rates with us.</p>
              </div>

              <div className="healthcare-form-field">
                <label htmlFor="healthcare-inquiring-for">Inquiring for</label>
                <select
                  id="healthcare-inquiring-for"
                  value={inquiryForm.inquiringFor}
                  onChange={setInquiryField("inquiringFor")}
                >
                  {inquiryForOptions.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div className="healthcare-form-field">
                <label htmlFor="healthcare-full-name">Full Name*</label>
                <input
                  id="healthcare-full-name"
                  type="text"
                  value={inquiryForm.fullName}
                  onChange={setInquiryField("fullName")}
                  autoComplete="name"
                  required
                />
              </div>

              <div className="healthcare-form-field">
                <label htmlFor="healthcare-email">Email*</label>
                <input
                  id="healthcare-email"
                  type="email"
                  value={inquiryForm.email}
                  onChange={setInquiryField("email")}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="healthcare-form-field">
                <label htmlFor="healthcare-phone">Phone</label>
                <input
                  id="healthcare-phone"
                  type="tel"
                  value={inquiryForm.phone}
                  onChange={setInquiryField("phone")}
                  autoComplete="tel"
                />
              </div>

              <div className="healthcare-form-field">
                <label htmlFor="healthcare-budget">Budget (per night)</label>
                <input
                  id="healthcare-budget"
                  type="text"
                  value={inquiryForm.budget}
                  onChange={setInquiryField("budget")}
                  inputMode="decimal"
                />
              </div>

              <div className="healthcare-form-grid healthcare-form-grid--two">
                <div className="healthcare-form-field">
                  <label htmlFor="healthcare-check-in">Check In *</label>
                  <input
                    id="healthcare-check-in"
                    type="date"
                    value={inquiryForm.checkIn}
                    onChange={setInquiryField("checkIn")}
                    required
                  />
                </div>
                <div className="healthcare-form-field">
                  <label htmlFor="healthcare-check-out">Check Out *</label>
                  <input
                    id="healthcare-check-out"
                    type="date"
                    value={inquiryForm.checkOut}
                    onChange={setInquiryField("checkOut")}
                    required
                  />
                </div>
              </div>
              <p className="healthcare-form-note">Dates subject to availability</p>

              <div className="healthcare-form-grid healthcare-form-grid--guest">
                <div className="healthcare-form-field">
                  <label htmlFor="healthcare-adults">Adults</label>
                  <select id="healthcare-adults" value={inquiryForm.adults} onChange={setInquiryField("adults")}>
                    {guestCountOptions.filter((option) => option !== "0").map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
                <div className="healthcare-form-field">
                  <label htmlFor="healthcare-children">Children (under 18)</label>
                  <select id="healthcare-children" value={inquiryForm.children} onChange={setInquiryField("children")}>
                    {guestCountOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="healthcare-form-checks">
                <label>
                  <input type="checkbox" checked={inquiryForm.parking} onChange={setInquiryField("parking")} />
                  <span>Parking</span>
                </label>
                <p>Parking subject to availability</p>
                <label>
                  <input type="checkbox" checked={inquiryForm.pets} onChange={setInquiryField("pets")} />
                  <span>Pets</span>
                </label>
              </div>

              <div className="healthcare-form-field healthcare-form-field--notes">
                <label htmlFor="healthcare-notes">Anything else?</label>
                <textarea
                  id="healthcare-notes"
                  rows="5"
                  value={inquiryForm.notes}
                  onChange={setInquiryField("notes")}
                  placeholder="Hospital or facility, assignment length, arrival timing, accessibility needs, or anything our reservations team should know."
                />
              </div>

              {inquiryStatus.message && (
                <div className={`healthcare-form-status is-${inquiryStatus.type}`} role="status">
                  {inquiryStatus.message}
                </div>
              )}

              <div className="healthcare-form-actions">
                <button type="submit" disabled={isInquirySubmitting}>
                  {isInquirySubmitting ? "Sending..." : "Send Inquiry"}
                </button>
                <a
                  href={inquiryEmailFallbackHref || healthcareEmailHref}
                  onClick={() =>
                    trackCtaClick({
                      ctaText: "open healthcare email draft",
                      location: "healthcare_inquiry_form",
                      sourcePage,
                    })
                  }
                >
                  Open email draft
                </a>
              </div>
            </form>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

export default HealthcareProfessionalsPage;
