import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import SiteFooter from "./components/SiteFooter";
import { CONTACT_EMAIL, CONTACT_REGION_MAP } from "./utils/contactConfig";
import { trackCtaClick, trackPhoneCallClick } from "./lib/analytics";
import apiBase from "./utils/apiBase";
import "./HealthcareProfessionalsPage.css";

const primaryPhone = CONTACT_REGION_MAP.us.phone;

const IMAGE_POOL = [
  "https://assets.guesty.com/image/upload/v1729698123/production/666b3af27fc6d5653142b0af/gbfnbuvqtbreaw3100fk.jpg",
  "https://assets.guesty.com/image/upload/v1729698598/production/666b3af27fc6d5653142b0af/at1j16rqji4epdet5xna.jpg",
  "https://assets.guesty.com/image/upload/v1729698598/production/666b3af27fc6d5653142b0af/k9tkytawqqfeteq1y8rn.jpg",
  "https://assets.guesty.com/image/upload/v1729880354/production/666b3af27fc6d5653142b0af/yc51idfkqenc81wnse8n.jpg",
  "https://assets.guesty.com/image/upload/v1730118454/production/666b3af27fc6d5653142b0af/hhak8hklrbv2ewtdwuoy.jpg",
  "https://assets.guesty.com/image/upload/v1730118469/production/666b3af27fc6d5653142b0af/g0sswyq5a1macbegsp2p.jpg",
  "https://assets.guesty.com/image/upload/v1733508976/production/666b3af27fc6d5653142b0af/uw8axioi311sthwkvv3u.jpg",
  "https://assets.guesty.com/image/upload/v1760535614/production/666b3af27fc6d5653142b0af/t7p3cc6hqez89wsmj1gt.jpg",
];

const CLOUDINARY_MARKER = "/image/upload/";
const RESPONSIVE_WIDTHS = [480, 768, 1200, 1760];

const cloudinaryUrl = (url, width) => {
  if (!url || !url.includes(CLOUDINARY_MARKER)) return url;
  return url.replace(CLOUDINARY_MARKER, `${CLOUDINARY_MARKER}f_auto,q_auto:good,w_${width}/`);
};

const buildResponsiveImage = (url, { sizes = "100vw", widths = RESPONSIVE_WIDTHS } = {}) => ({
  src: cloudinaryUrl(url, widths[widths.length - 1]),
  srcSet: widths.map((width) => `${cloudinaryUrl(url, width)} ${width}w`).join(", "),
  sizes,
});

const businessProfiles = {
  healthcare: {
    path: "/healthcare-professionals",
    label: "Healthcare Professionals",
    audience: "traveling nurses, physicians, allied health workers, and healthcare teams",
    headline: "Where Rest Is Part of the Treatment",
    intro: "Healthcare assignments demand focus, stamina, and flexibility. Your accommodation should make the work easier, not heavier.",
    work: "hospitals, clinics, and medical districts",
    inquiryFor: ["Booking for myself", "Booking for an employee", "Booking for a team", "Booking for a patient family"],
  },
  construction: {
    path: "/business/construction-accommodations",
    label: "Construction Accommodations",
    audience: "project managers, engineers, skilled trades, supervisors, and construction crews",
    headline: "A Better Home Base for Every Project",
    intro: "Long project days call for dependable accommodations where crews can rest, cook, work, and recharge for the next shift.",
    work: "job sites, project offices, and transport routes",
    inquiryFor: ["Booking for myself", "Booking for an employee", "Booking for a crew", "Booking for subcontractors"],
  },
  corporate: {
    path: "/business/corporate-relocation",
    label: "Corporate Assignment & Relocation",
    audience: "relocating employees, executives, consultants, project teams, and business travelers",
    headline: "Arrive Ready. Live Exceptionally.",
    intro: "A successful assignment or relocation starts with a comfortable, professionally managed place that feels settled from day one.",
    work: "business districts, client offices, and key transport links",
    inquiryFor: ["Booking for myself", "Booking for an employee", "Booking for an executive", "Booking for a team"],
  },
  entertainment: {
    path: "/business/entertainment-industry",
    label: "Entertainment Industry",
    audience: "cast, crew, production teams, touring talent, and entertainment professionals",
    headline: "Private Stays Behind Every Great Production",
    intro: "Productions move quickly. We provide comfortable private residences that help talent and crews stay focused throughout a shoot or engagement.",
    work: "studios, sets, venues, and production hubs",
    inquiryFor: ["Booking for myself", "Booking for talent", "Booking for crew", "Booking for a production team"],
  },
  government: {
    path: "/business/government",
    label: "Government",
    audience: "government employees, contractors, consultants, delegations, and public-sector teams",
    headline: "Dependable Stays for Work That Serves",
    intro: "Official travel requires clarity, privacy, and dependable support. Our furnished residences offer a practical home base for short and extended assignments.",
    work: "government offices, civic centers, and assignment locations",
    inquiryFor: ["Booking for myself", "Booking for an employee", "Booking for a contractor", "Booking for a delegation"],
  },
};

const industryImages = Object.keys(businessProfiles).reduce((map, key, index) => {
  const offset = index * 3;
  const pick = (i) => IMAGE_POOL[(offset + i) % IMAGE_POOL.length];
  map[key] = {
    hero: pick(0),
    split: pick(4),
    gallery: [pick(1), pick(2), pick(3)],
  };
  return map;
}, {});

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
const buildInquiryEmailHref = (form, profile) => {
  const lines = [
    "ONELUXSTAY",
    "The Art of comfortable Stays",
    "==================================================",
    "",
    `${profile.label.toUpperCase()} STAY INQUIRY`,
    "",
    "CONTACT DETAILS",
    "--------------------------------------------------",
    `Name:              ${form.fullName || "-"}`,
    `Email:             ${form.email || "-"}`,
    `Phone:             ${form.phone || "-"}`,
    `Company:           ${form.companyName || "-"}`,
    `Inquiring for:     ${form.inquiringFor || "-"}`,
    "",
    "STAY REQUIREMENTS",
    "--------------------------------------------------",
    `Destination:       ${form.city || "-"}`,
    `Check-in:          ${form.checkIn || "-"}`,
    `Check-out:         ${form.checkOut || "-"}`,
    `Bedrooms:          ${form.bedrooms || "-"}`,
    `Adults:            ${form.adults || "-"}`,
    `Children under 18: ${form.children || "0"}`,
    `Budget per night:  ${form.budget || "-"}`,
    `Parking required:  ${form.parking ? "Yes" : "No"}`,
    `Traveling with pets: ${form.pets ? "Yes" : "No"}`,
    "",
    "ADDITIONAL INFORMATION",
    "--------------------------------------------------",
    form.notes || "-",
    "",
    "==================================================",
    "Submitted through OneLuxStay Professional Stays",
    "oneluxstay.com",
  ];

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${profile.label} stay inquiry`)}&body=${encodeURIComponent(
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

const inquiryStepLabels = ["Stay Details", "About You", "Finish Up"];

const PillGroup = ({ label, hint, options, value, onSelect, allowClear = false }) => (
  <div className="hcf-field">
    <span className="hcf-field__label">
      {label}
      {hint && <em>{hint}</em>}
    </span>
    <div className="hcf-pills" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`hcf-pill${value === option ? " is-active" : ""}`}
          aria-pressed={value === option}
          onClick={() => onSelect(value === option && allowClear ? "" : option)}
        >
          {option}
        </button>
      ))}
    </div>
  </div>
);

const CounterField = ({ label, hint, value, min, max, onChange }) => {
  const count = Number(value) || 0;
  return (
    <div className="hcf-counter">
      <span className="hcf-counter__label">
        {label}
        {hint && <em>{hint}</em>}
      </span>
      <div className="hcf-counter__controls">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={count <= min}
          onClick={() => onChange(String(count - 1))}
        >
          &minus;
        </button>
        <strong aria-live="polite">{count}</strong>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          disabled={count >= max}
          onClick={() => onChange(String(count + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
};

const ToggleField = ({ label, note, checked, onChange }) => (
  <label className="hcf-toggle">
    <input type="checkbox" checked={checked} onChange={onChange} />
    <span className="hcf-toggle__track" aria-hidden="true" />
    <span className="hcf-toggle__text">
      {label}
      {note && <em>{note}</em>}
    </span>
  </label>
);

const useRevealOnScroll = () => {
  const containerRef = useRef(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return undefined;
    const targets = root.querySelectorAll(".reveal");
    if (!targets.length) return undefined;

    if (typeof IntersectionObserver === "undefined") {
      targets.forEach((el) => el.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return containerRef;
};

const useCountUp = (rootRef) => {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const nodes = root.querySelectorAll("[data-count-to]");
    if (!nodes.length) return undefined;

    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const animate = (node) => {
      const target = Number(node.dataset.countTo);
      if (!Number.isFinite(target) || prefersReducedMotion) {
        node.textContent = node.dataset.countLabel;
        return;
      }
      const duration = 1100;
      const start = performance.now();
      const suffix = node.dataset.countSuffix || "";
      const step = (now) => {
        const progress = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        node.textContent = `${Math.round(target * eased)}${suffix}`;
        if (progress < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    if (typeof IntersectionObserver === "undefined") {
      nodes.forEach(animate);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            animate(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.6 },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [rootRef]);
};

function HealthcareProfessionalsPage({ industry = "healthcare" }) {
  const profile = businessProfiles[industry] || businessProfiles.healthcare;
  const images = industryImages[industry] || industryImages.healthcare;
  const heroImage = useMemo(() => buildResponsiveImage(images.hero, { sizes: "100vw" }), [images.hero]);
  const splitImage = useMemo(
    () => buildResponsiveImage(images.split, { sizes: "(max-width: 980px) 100vw, 50vw" }),
    [images.split],
  );
  const quoteImage = useMemo(() => buildResponsiveImage(images.gallery[0], { sizes: "100vw" }), [images.gallery]);
  const galleryImages = useMemo(
    () => images.gallery.map((url) => buildResponsiveImage(url, { sizes: "(max-width: 700px) 50vw, 33vw" })),
    [images.gallery],
  );
  const sourcePage = profile.path;
  const faqs = industry === "healthcare" ? healthcareFaqs : [
    {
      question: `How do I arrange ${profile.label.toLowerCase()} accommodations?`,
      answer: "Share the destination, dates, guest count, budget, and property requirements. Our reservations team will match your organization with suitable available residences.",
    },
    {
      question: "Can stays be extended if an assignment changes?",
      answer: "Often, yes. Extensions depend on availability and the terms of the original booking. Contact us early so we can help protect the current residence or arrange an alternative.",
    },
    {
      question: "Can you accommodate multiple employees or teams?",
      answer: "Yes, where availability allows. We can coordinate multiple residences in the same building or nearby properties and provide one point of contact for the placement.",
    },
    {
      question: "What is included in the rate?",
      answer: "Inclusions vary by property, but commonly include furnishings, utilities, Wi-Fi, kitchen essentials, and listed amenities. Property-specific fees and exclusions are shared before confirmation.",
    },
    {
      question: "Are parking and pet-friendly options available?",
      answer: "Availability varies by residence. Include parking or pet requirements in your inquiry so our team can identify appropriate options and disclose any applicable rules or fees.",
    },
  ];
  const [inquiryForm, setInquiryForm] = useState(() => ({
    ...initialInquiryForm,
    inquiringFor: profile.inquiryFor[0],
  }));
  const [inquiryStatus, setInquiryStatus] = useState({ type: "", message: "" });
  const [isInquirySubmitting, setIsInquirySubmitting] = useState(false);
  const [isFormMinimized, setIsFormMinimized] = useState(false);
  const [inquiryStep, setInquiryStep] = useState(0);
  const [inquiryStepError, setInquiryStepError] = useState("");
  const inquiryEmailFallbackHref = useMemo(() => buildInquiryEmailHref(inquiryForm, profile), [inquiryForm, profile]);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const inquiryNights = useMemo(() => {
    if (!inquiryForm.checkIn || !inquiryForm.checkOut) return 0;
    const nights = Math.round(
      (new Date(`${inquiryForm.checkOut}T00:00:00`) - new Date(`${inquiryForm.checkIn}T00:00:00`)) / 86400000,
    );
    return nights > 0 ? nights : 0;
  }, [inquiryForm.checkIn, inquiryForm.checkOut]);
  const revealRef = useRevealOnScroll();
  useCountUp(revealRef);

  const setInquiryField = (field) => (event) => {
    const { type, checked, value } = event.target;
    setInquiryForm((current) => ({
      ...current,
      [field]: type === "checkbox" ? checked : value,
    }));
  };

  const validateInquiryStep = (step) => {
    if (step === 0) {
      if (!inquiryForm.checkIn || !inquiryForm.checkOut) return "Please choose your check-in and check-out dates.";
      if (inquiryForm.checkOut <= inquiryForm.checkIn) return "Check-out must be after check-in.";
    }
    if (step === 1) {
      if (!inquiryForm.fullName.trim()) return "Please add your full name.";
      if (!/^\S+@\S+\.\S+$/.test(inquiryForm.email.trim())) return "Please add a valid email address.";
    }
    return "";
  };

  const goToInquiryStep = (step) => {
    setInquiryStepError("");
    setInquiryStatus((current) => (current.type === "error" ? { type: "", message: "" } : current));
    setInquiryStep(step);
  };

  const continueInquiryStep = () => {
    const error = validateInquiryStep(inquiryStep);
    if (error) {
      setInquiryStepError(error);
      return;
    }
    trackCtaClick({
      ctaText: `inquiry continue to ${inquiryStepLabels[inquiryStep + 1].toLowerCase()}`,
      location: "healthcare_inquiry_form",
      sourcePage,
    });
    goToInquiryStep(inquiryStep + 1);
  };

  const handleInquirySubmit = async (event) => {
    event.preventDefault();
    if (inquiryStep < inquiryStepLabels.length - 1) {
      continueInquiryStep();
      return;
    }
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
      const response = await fetch(`${apiBase}/professional-careers-inquiry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...inquiryForm, industry: profile.label }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to send inquiry right now.");

      trackCtaClick({
        ctaText: `submit ${profile.label.toLowerCase()} inquiry`,
        location: "healthcare_inquiry_form",
        sourcePage,
      });
      setInquiryStatus({
        type: "success",
        message: "Your inquiry has been sent. Our reservations team will follow up by email.",
      });
      setInquiryForm({ ...initialInquiryForm, inquiringFor: profile.inquiryFor[0] });
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
    <div className="healthcare-page" ref={revealRef}>
      <nav className="healthcare-nav" aria-label={`${profile.label} navigation`}>
        <Link to="/" className="healthcare-nav__brand">
          <span className="healthcare-nav__logo">OneLuxStay</span>
          <span className="healthcare-nav__tagline">The Art of comfortable Stays</span>
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
        <section className="healthcare-hero-media">
          <img
            className="healthcare-hero-media__img"
            src={heroImage.src}
            srcSet={heroImage.srcSet}
            sizes={heroImage.sizes}
            alt={`OneLuxStay residence for ${profile.label.toLowerCase()}`}
            loading="eager"
            fetchPriority="high"
            decoding="async"
          />
          <section className="healthcare-hero">
            <p className="healthcare-eyebrow">For {profile.label}</p>
            <h1>{profile.headline}</h1>
            <p className="healthcare-lead">
              Curated private residences for {profile.audience}, designed for privacy, flexibility, and a comfortable routine away from home.
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
        </section>

        <section className="healthcare-split" aria-label={`${profile.label} accommodation introduction`}>
          <div className="healthcare-split__media reveal">
            <img
              src={splitImage.src}
              srcSet={splitImage.srcSet}
              sizes={splitImage.sizes}
              alt={`OneLuxStay furnished residence living space`}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="healthcare-split__copy reveal">
            <p className="healthcare-eyebrow">The OneLuxStay Standard</p>
            <p className="healthcare-split__statement">
              {profile.intro}
            </p>
            <p className="healthcare-split__support">
              OneLuxStay provides furnished, professionally managed residences wherever your work takes you — prepared
              before arrival, supported throughout the stay, and flexible when plans change.
            </p>
            <Link
              to="/global"
              className="healthcare-split__link"
              onClick={() =>
                trackCtaClick({
                  ctaText: "view residences",
                  location: "healthcare_split",
                  sourcePage,
                })
              }
            >
              View Our Residences
            </Link>
          </div>
        </section>

        <section id="healthcare-benefits" className="healthcare-features">
          <p className="healthcare-eyebrow healthcare-features__eyebrow">Why OneLuxStay</p>
          <h2>Why {profile.label} Guests Choose OneLuxStay</h2>
          <div className="healthcare-features__grid">
            {healthcareFeatures.map((feature, index) => (
              <article
                key={feature.title}
                className="healthcare-feature-card reveal"
                style={{ transitionDelay: `${Math.min(index, 5) * 60}ms` }}
              >
                <span className="healthcare-feature-card__index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="healthcare-feature-card__icon">
                  <Icon kind={feature.icon} />
                </span>
                <h3>{index === 0 ? "Close to Where the Work Happens" : index === 2 && industry !== "healthcare" ? "Comfort After a Demanding Day" : index === 6 && industry !== "healthcare" ? "Support for Individuals and Teams" : feature.title}</h3>
                <p>{index === 0 ? `We help prioritize residences with practical access to ${profile.work}, reducing unnecessary travel during demanding assignments.` : index === 2 && industry !== "healthcare" ? "Select properties offer fitness centers, pools, outdoor areas, and quiet spaces that make an extended work stay feel balanced." : index === 6 && industry !== "healthcare" ? "Whether placing one traveler or a full team, our reservations staff can coordinate options by destination, date, budget, and property requirements." : feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="healthcare-stats" aria-label="Healthcare stay highlights">
          <div className="healthcare-stats__grid">
            {healthcareStats.map((stat) => {
              const numeric = /^\d+$/.test(stat.value);
              return (
                <div key={stat.label} className="healthcare-stat reveal">
                  <strong
                    {...(numeric
                      ? { "data-count-to": stat.value, "data-count-label": stat.value }
                      : {})}
                  >
                    {numeric ? "0" : stat.value}
                  </strong>
                  <span>{stat.label}</span>
                </div>
              );
            })}
          </div>
        </section>

        <section id="healthcare-gallery" className="healthcare-gallery" aria-label={`${profile.label} residence gallery`}>
          <div className="healthcare-gallery__head reveal">
            <p className="healthcare-eyebrow">Inside the Residences</p>
            <h2>A Home Base Worth Coming Back To</h2>
          </div>
          <div className="healthcare-gallery__grid">
            {galleryImages.map((image, index) => (
              <figure key={images.gallery[index]} className={`healthcare-gallery__item reveal healthcare-gallery__item--${index}`}>
                <img
                  src={image.src}
                  srcSet={image.srcSet}
                  sizes={image.sizes}
                  alt={`Furnished OneLuxStay residence interior for ${profile.label.toLowerCase()}`}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>{["Private Living Space", "Work-Ready Comfort", "Space to Recharge"][index]}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="healthcare-quote-media" aria-label="Healthcare stay promise">
          <img
            className="healthcare-quote-media__img"
            src={quoteImage.src}
            srcSet={quoteImage.srcSet}
            sizes={quoteImage.sizes}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
          <div className="healthcare-quote reveal">
            <div className="healthcare-quote__mark" aria-hidden="true">"</div>
            <blockquote>
              The right residence gives every professional more than a place to sleep. It provides privacy, routine,
              and enough quiet to return ready for the work ahead.
            </blockquote>
            <cite>OneLuxStay {profile.label} Stays</cite>
          </div>
        </section>

        <hr className="healthcare-rule" />

        <section id="healthcare-locations" className="healthcare-locations reveal">
          <h2>Where We Operate</h2>
          <p>OneLuxStay residences are available across six curated destinations worldwide.</p>
        </section>
        <div className="healthcare-marquee" aria-label="OneLuxStay destinations">
          <div className="healthcare-marquee__track">
            {[...healthcareLocations, ...healthcareLocations].map((location, index) => (
              <span key={`${location}-${index}`}>{location}</span>
            ))}
          </div>
        </div>

        <hr className="healthcare-rule" />

        <section id="healthcare-faq" className="healthcare-faq">
          <p className="healthcare-eyebrow">Good to Know</p>
          <h2>Frequently Asked Questions</h2>
          {faqs.map((item) => (
            <details key={item.question} className="healthcare-faq__item">
              <summary>
                <span>{item.question}</span>
                <span className="healthcare-faq__plus" aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </section>

        <section className="healthcare-industries" aria-label="Professional stay programs">
          <div className="healthcare-industries__inner">
            <p className="healthcare-eyebrow">Professional Stay Programs</p>
            <h2>Serving Every Kind of Assignment</h2>
            <div className="healthcare-industries__list">
              {Object.entries(businessProfiles).map(([key, program]) => (
                <Link
                  key={key}
                  to={program.path}
                  className={`healthcare-industries__item reveal${key === industry ? " is-current" : ""}`}
                  aria-current={key === industry ? "page" : undefined}
                  onClick={() =>
                    trackCtaClick({
                      ctaText: `industry link ${program.label.toLowerCase()}`,
                      location: "healthcare_industries",
                      sourcePage,
                    })
                  }
                >
                  <span className="healthcare-industries__label">{program.label}</span>
                  <span className="healthcare-industries__audience">{program.audience}</span>
                  <span className="healthcare-industries__arrow" aria-hidden="true">&rarr;</span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="healthcare-contact" className="healthcare-cta healthcare-inquiry-section">
          <div className="healthcare-inquiry-shell">
            <div className="healthcare-inquiry-copy">
              <p className="healthcare-eyebrow">Ready to Begin</p>
              <h2>Let's Find Your Suite</h2>
              <p>
                Tell us your assignment city, preferred dates, and any special requirements. We will prepare a tailored
                response for your {profile.label.toLowerCase()} stay.
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

            <form
              className={`healthcare-inquiry-form${isFormMinimized ? " is-minimized" : ""}`}
              onSubmit={handleInquirySubmit}
            >
              <div className="healthcare-inquiry-form__glow" aria-hidden="true" />

              <div className="healthcare-inquiry-form__header">
                <span>{isFormMinimized ? "Book a Stay" : "Send an Inquiry"}</span>
                <button
                  type="button"
                  className="healthcare-inquiry-form__toggle"
                  aria-expanded={!isFormMinimized}
                  aria-controls="healthcare-inquiry-form-body"
                  onClick={() => {
                    setIsFormMinimized((current) => {
                      const next = !current;
                      trackCtaClick({
                        ctaText: next ? "minimize inquiry form" : "expand inquiry form",
                        location: "healthcare_inquiry_form",
                        sourcePage,
                      });
                      return next;
                    });
                  }}
                >
                  <span aria-hidden="true" />
                  <span className="healthcare-inquiry-form__toggle-label">
                    {isFormMinimized ? "Expand" : "Minimize"}
                  </span>
                </button>
              </div>

              <div
                id="healthcare-inquiry-form-body"
                className="healthcare-inquiry-form__body"
                hidden={isFormMinimized}
              >
              {inquiryStatus.type === "success" ? (
                <div className="hcf-success" role="status">
                  <span className="hcf-success__mark" aria-hidden="true">
                    <svg viewBox="0 0 52 52">
                      <circle cx="26" cy="26" r="23" />
                      <path d="m16 27 7.5 7.5L36.5 19" />
                    </svg>
                  </span>
                  <h3>Inquiry Sent</h3>
                  <p>{inquiryStatus.message}</p>
                  <button
                    type="button"
                    className="hcf-success__again"
                    onClick={() => {
                      setInquiryStatus({ type: "", message: "" });
                      goToInquiryStep(0);
                    }}
                  >
                    Plan Another Stay
                  </button>
                </div>
              ) : (
                <>
                  <div className="hcf-progress">
                    {inquiryStepLabels.map((label, step) => (
                      <button
                        key={label}
                        type="button"
                        className={`hcf-progress__step${step === inquiryStep ? " is-current" : ""}${step < inquiryStep ? " is-done" : ""}`}
                        disabled={step > inquiryStep}
                        onClick={() => step < inquiryStep && goToInquiryStep(step)}
                      >
                        <span className="hcf-progress__num" aria-hidden="true">
                          {step < inquiryStep ? "✓" : step + 1}
                        </span>
                        <span className="hcf-progress__label">{label}</span>
                      </button>
                    ))}
                    <span className="hcf-progress__bar" aria-hidden="true">
                      <span style={{ width: `${(inquiryStep / (inquiryStepLabels.length - 1)) * 100}%` }} />
                    </span>
                  </div>

                  <div className="hcf-step" key={inquiryStep}>
                    {inquiryStep === 0 && (
                      <>
                        <PillGroup
                          label="Destination"
                          hint="Optional — leave open if flexible"
                          options={healthcareLocations}
                          value={inquiryForm.city}
                          onSelect={(city) => setInquiryForm((current) => ({ ...current, city }))}
                          allowClear
                        />
                        <div className="hcf-row">
                          <div className="healthcare-form-field">
                            <label htmlFor="healthcare-check-in">Check In *</label>
                            <input
                              id="healthcare-check-in"
                              type="date"
                              min={todayIso}
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
                              min={inquiryForm.checkIn || todayIso}
                              value={inquiryForm.checkOut}
                              onChange={setInquiryField("checkOut")}
                              required
                            />
                          </div>
                        </div>
                        <p className="healthcare-form-note">
                          {inquiryNights > 0 ? (
                            <span className="hcf-nights">
                              {inquiryNights} night{inquiryNights === 1 ? "" : "s"} &middot; dates subject to availability
                            </span>
                          ) : (
                            "Dates subject to availability"
                          )}
                        </p>
                        <PillGroup
                          label="Bedrooms"
                          options={bedroomOptions}
                          value={inquiryForm.bedrooms}
                          onSelect={(bedrooms) => setInquiryForm((current) => ({ ...current, bedrooms }))}
                        />
                        <div className="hcf-row">
                          <CounterField
                            label="Adults"
                            value={inquiryForm.adults}
                            min={1}
                            max={8}
                            onChange={(adults) => setInquiryForm((current) => ({ ...current, adults }))}
                          />
                          <CounterField
                            label="Children"
                            hint="Under 18"
                            value={inquiryForm.children}
                            min={0}
                            max={8}
                            onChange={(children) => setInquiryForm((current) => ({ ...current, children }))}
                          />
                        </div>
                      </>
                    )}

                    {inquiryStep === 1 && (
                      <>
                        <div className="hcf-row">
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
                        </div>
                        <div className="hcf-row">
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
                          <div className="healthcare-form-field healthcare-form-field--company">
                            <label htmlFor="healthcare-company">Company Name</label>
                            <input
                              id="healthcare-company"
                              type="text"
                              value={inquiryForm.companyName}
                              onChange={setInquiryField("companyName")}
                              autoComplete="organization"
                            />
                          </div>
                        </div>
                        <p className="healthcare-form-note">
                          We will check to see if your company has special rates with us.
                        </p>
                        <PillGroup
                          label="Inquiring for"
                          options={profile.inquiryFor}
                          value={inquiryForm.inquiringFor}
                          onSelect={(inquiringFor) => setInquiryForm((current) => ({ ...current, inquiringFor }))}
                        />
                      </>
                    )}

                    {inquiryStep === 2 && (
                      <>
                        <div className="healthcare-form-field">
                          <label htmlFor="healthcare-budget">Budget (per night)</label>
                          <input
                            id="healthcare-budget"
                            type="text"
                            value={inquiryForm.budget}
                            onChange={setInquiryField("budget")}
                            inputMode="decimal"
                            placeholder="e.g. $250"
                          />
                        </div>
                        <div className="hcf-toggles">
                          <ToggleField
                            label="Parking"
                            note="Subject to availability"
                            checked={inquiryForm.parking}
                            onChange={setInquiryField("parking")}
                          />
                          <ToggleField
                            label="Traveling with pets"
                            note="Building rules and fees may apply"
                            checked={inquiryForm.pets}
                            onChange={setInquiryField("pets")}
                          />
                        </div>
                        <div className="healthcare-form-field healthcare-form-field--notes">
                          <label htmlFor="healthcare-notes">Anything else?</label>
                          <textarea
                            id="healthcare-notes"
                            rows="4"
                            value={inquiryForm.notes}
                            onChange={setInquiryField("notes")}
                            placeholder="Work location, assignment length, arrival timing, accessibility needs, or anything our reservations team should know."
                          />
                        </div>
                        <dl className="hcf-summary">
                          <div>
                            <dt>Destination</dt>
                            <dd>{inquiryForm.city || "Flexible"}</dd>
                          </div>
                          <div>
                            <dt>Dates</dt>
                            <dd>
                              {inquiryForm.checkIn && inquiryForm.checkOut
                                ? `${inquiryForm.checkIn} → ${inquiryForm.checkOut} · ${inquiryNights} night${inquiryNights === 1 ? "" : "s"}`
                                : "—"}
                            </dd>
                          </div>
                          <div>
                            <dt>Party</dt>
                            <dd>
                              {inquiryForm.bedrooms} BR &middot; {inquiryForm.adults} adult{inquiryForm.adults === "1" ? "" : "s"}
                              {Number(inquiryForm.children) > 0 ? ` · ${inquiryForm.children} child${inquiryForm.children === "1" ? "" : "ren"}` : ""}
                            </dd>
                          </div>
                        </dl>
                      </>
                    )}
                  </div>

                  {(inquiryStepError || inquiryStatus.message) && (
                    <div
                      className={`healthcare-form-status is-${inquiryStepError ? "error" : inquiryStatus.type}`}
                      role="status"
                    >
                      {inquiryStepError || inquiryStatus.message}
                    </div>
                  )}

                  <div className="hcf-nav">
                    {inquiryStep > 0 && (
                      <button type="button" className="hcf-nav__back" onClick={() => goToInquiryStep(inquiryStep - 1)}>
                        Back
                      </button>
                    )}
                    {inquiryStep < inquiryStepLabels.length - 1 ? (
                      <button key="continue" type="button" className="hcf-nav__next" onClick={continueInquiryStep}>
                        Continue
                      </button>
                    ) : (
                      <button key="send" type="submit" className="hcf-nav__next" disabled={isInquirySubmitting}>
                        {isInquirySubmitting ? "Sending..." : "Send Inquiry"}
                      </button>
                    )}
                    {inquiryStep === inquiryStepLabels.length - 1 && (
                      <a
                        href={inquiryEmailFallbackHref}
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
                    )}
                  </div>
                  <p className="hcf-hint">Step {inquiryStep + 1} of {inquiryStepLabels.length} &middot; takes about a minute</p>
                </>
              )}
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
