import { Link, useLocation } from "react-router-dom";
import { trackGuestCityClick } from "../utils/guestAnalytics";
import {
  CONTACT_EMAIL,
  CONTACT_EMAIL_HREF,
  CONTACT_REGION_MAP,
  buildWhatsAppHref,
} from "../utils/contactConfig";

const handleFooterCityClick = (city, href) => {
  trackGuestCityClick({
    city,
    destinationPath: href,
    sourceSection: "site_footer",
    sourceLabel: "footer_city_link",
  });
};

const FOOTER_EXPLORE_LINKS = [
  { label: "About", to: "/" },
  { label: "Locations", to: "/global" },
  { label: "Apartments", to: "/listings" },
  { label: "Contact", href: CONTACT_EMAIL_HREF },
];

const FOOTER_CITY_LINKS = [
  { label: "Antwerp", to: "/antwerp", city: "Antwerp" },
  { label: "Antwerp Attractions", to: "/antwerp/attractions", city: "Antwerp" },
  { label: "Dubai", to: "/dubai", city: "Dubai" },
  { label: "Dubai Attractions", to: "/dubai/attractions", city: "Dubai" },
  { label: "Los Angeles", to: "/los-angeles", city: "Los Angeles" },
  { label: "LA Attractions", to: "/los-angeles/attractions", city: "Los Angeles" },
  { label: "Miami", to: "/miami", city: "Miami" },
  { label: "Miami Attractions", to: "/miami/attractions", city: "Miami" },
  { label: "Redondo Beach", to: "/redondo-beach", city: "Redondo Beach" },
  { label: "Redondo Attractions", to: "/redondo-beach/attractions", city: "Redondo Beach" },
];

const isAntwerpPath = (pathname = "") => /\bantwerp|antwerpen\b/i.test(String(pathname || ""));

const getFooterContactItems = (pathname = "") => {
  const isAntwerp = isAntwerpPath(pathname);
  const primaryRegion = isAntwerp ? CONTACT_REGION_MAP.antwerp : CONTACT_REGION_MAP.us;
  const whatsappRegion = isAntwerp ? CONTACT_REGION_MAP.antwerp : CONTACT_REGION_MAP.dubai;

  return [
    {
      label: isAntwerp ? "Antwerp" : "US + Dubai",
      value: primaryRegion.phone.display,
      href: primaryRegion.phone.telHref,
      icon: "phone",
    },
    {
      label: "WhatsApp",
      value: whatsappRegion.whatsapp.display,
      href: buildWhatsAppHref(whatsappRegion.whatsapp.digits),
      icon: "whatsapp",
      external: true,
    },
    { label: "Email", value: CONTACT_EMAIL, href: CONTACT_EMAIL_HREF, icon: "mail" },
  ];
};

const FOOTER_TRUST_BADGES = [
  { label: "4.5+ rated", icon: "star" },
  { label: "Verified Business", icon: "shield" },
  { label: "US • Dubai • Antwerp", icon: "globe" },
];

const FOOTER_SECURITY_ITEMS = [
  "Stripe-secured payments",
  "No hidden fees",
  "Direct booking perks",
];

const renderFooterPhoneValue = (value = "") => {
  const groups = String(value || "").split(" ");
  if (groups.length <= 1) return value;

  return (
    <>
      {groups.map((part, index) => (
        <span key={`${part}-${index}`} className="policy-footer-phone-part">
          {part}
          {index === groups.length - 1 ? null : <wbr />}
          {index === groups.length - 1 ? null : " "}
        </span>
      ))}
    </>
  );
};

const renderFooterContactValue = (item) => {
  if (item.icon === "phone") return renderFooterPhoneValue(item.value);
  if (item.icon !== "mail") return item.value;

  const [user, domain] = String(item.value || "").split("@");
  if (!user || !domain) return item.value;

  return (
    <>
      {user}@<wbr />
      {domain}
    </>
  );
};

const FOOTER_LEGAL_LINKS = [
  { label: "Privacy Policy", to: "/privacy-policy" },
  { label: "Terms & Conditions", to: "/terms" },
  { label: "California Privacy Policy", to: "/california-privacy-policy" },
];

const TrustIcon = ({ kind }) => {
  if (kind === "star") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.75l2.54 5.15 5.68.82-4.11 4 .97 5.66L12 16.7l-5.08 2.68.97-5.66-4.11-4 5.68-.82L12 3.75z" />
      </svg>
    );
  }

  if (kind === "shield") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3l7 3.11v5.36c0 4.43-2.98 8.51-7 9.53-4.02-1.02-7-5.1-7-9.53V6.11L12 3zm-1.02 11.77 5.3-5.3-1.06-1.06-4.24 4.23-2.12-2.12-1.06 1.06 3.18 3.19z" />
      </svg>
    );
  }

  if (kind === "phone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7.72 4.5h2.33c.39 0 .73.27.81.65l.69 3.18a.83.83 0 01-.24.8l-1.68 1.64a13.93 13.93 0 003.48 3.48l1.64-1.68a.83.83 0 01.8-.24l3.18.69c.38.08.65.42.65.81v2.33c0 .46-.37.83-.83.83C10.6 20.99 3.01 13.4 3.01 5.33c0-.46.37-.83.83-.83h3.88z" />
      </svg>
    );
  }

  if (kind === "mail") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5v-11zm2.07-.5L12 10.36 17.93 6H6.07zm11.93 1.54l-5.51 4.05a.83.83 0 01-.98 0L6 7.54v9.96c0 .46.37.83.83.83h10.34c.46 0 .83-.37.83-.83V7.54z" />
      </svg>
    );
  }

  if (kind === "whatsapp") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M19.11 4.89A9.93 9.93 0 0012.04 2C6.53 2 2.05 6.48 2.05 11.99c0 1.76.46 3.48 1.33 5L2 22l5.16-1.35a9.9 9.9 0 004.87 1.25h.01c5.51 0 9.99-4.48 9.99-9.99a9.9 9.9 0 00-2.92-7.02zM12.04 20.2h-.01a8.2 8.2 0 01-4.18-1.14l-.3-.18-3.06.8.81-2.98-.2-.31a8.2 8.2 0 01-1.26-4.4c0-4.53 3.68-8.21 8.21-8.21 2.19 0 4.25.85 5.8 2.41a8.14 8.14 0 012.41 5.8c0 4.53-3.69 8.21-8.22 8.21zm4.5-6.16c-.25-.12-1.48-.73-1.71-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.78.98-.14.16-.29.19-.54.06-.25-.12-1.05-.39-2-1.25-.74-.66-1.24-1.48-1.39-1.73-.15-.25-.02-.38.11-.51.11-.11.25-.29.37-.44.12-.15.16-.25.25-.41.08-.16.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.48-.4-.41-.56-.42h-.48c-.16 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.23.9 2.43 1.02 2.6.12.16 1.77 2.7 4.28 3.78.6.26 1.07.41 1.43.52.6.19 1.14.16 1.57.1.48-.07 1.48-.6 1.69-1.19.21-.58.21-1.08.14-1.19-.06-.1-.23-.16-.48-.29z" />
      </svg>
    );
  }

  if (kind === "check") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9.55 16.2L5.8 12.46l1.18-1.18 2.57 2.57 7.47-7.47 1.18 1.18-8.65 8.64z" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.75a9.25 9.25 0 100 18.5 9.25 9.25 0 000-18.5zm6.99 8.5h-3.18a14.17 14.17 0 00-1.34-5.16A7.77 7.77 0 0118.99 11.25zm-6.24-6.83c.88 1.06 1.62 2.96 1.88 5.33h-5.26c.26-2.37 1-4.27 1.88-5.33a3.64 3.64 0 011.5 0zM4.99 12.75h3.18c.08 1.84.51 3.56 1.28 5.16a7.77 7.77 0 01-4.46-5.16zm0-1.5a7.77 7.77 0 014.46-5.16c-.77 1.6-1.2 3.32-1.28 5.16H4.99zm6.25 1.5h1.52c-.07 1.5-.34 2.9-.76 4.08-.42-1.18-.69-2.58-.76-4.08zm0-1.5c.07-1.5.34-2.9.76-4.08.42 1.18.69 2.58.76 4.08h-1.52zm3.29 6.66c.77-1.6 1.2-3.32 1.28-5.16h3.18a7.77 7.77 0 01-4.46 5.16zm-4.06.67c.26-.59.49-1.23.67-1.91.18.68.41 1.32.67 1.91a3.66 3.66 0 01-1.34 0z" />
    </svg>
  );
};

const FooterLink = ({ item, className }) => {
  if (item.href) {
    return (
      <a className={className} href={item.href}>
        {item.label}
      </a>
    );
  }

  return (
    <Link className={className} to={item.to}>
      {item.label}
    </Link>
  );
};

function SiteFooter() {
  const location = useLocation();
  const currentYear = new Date().getFullYear();
  const footerContactItems = getFooterContactItems(location.pathname);

  return (
    <footer className="policy-footer">
      <div className="policy-footer-shell">
        <section className="policy-footer-intro" aria-label="Booking call to action">
          <div className="policy-footer-cta">
            <div className="policy-footer-cta-copy">
              <h2>Ready to book?</h2>
              <p>Explore availability across our global collection.</p>
            </div>
            <Link to="/global" className="policy-footer-cta-button policy-footer-cta-button--desktop">
              Check Availability
            </Link>
          </div>
          <div className="policy-footer-mobile-book">
            <Link to="/global" className="policy-footer-cta-button policy-footer-cta-button--mobile">
              Book Now
            </Link>
          </div>
        </section>

            <div className="policy-footer-inner">
          <div className="policy-footer-brand">
            <p className="policy-footer-tagline">Hotel standards. Private&nbsp;living.</p>
            <div className="policy-footer-brand-intro">
              <Link to="/" className="landing-logo-mark landing-logo-mark--image">
                <img
                  src="https://assets.guesty.com/image/upload/s--mirjR9ah--/v1759504407/production/666b3af27fc6d5653142b0af/private/jkenbeaohfqtt0f2lb6q.png"
                  alt="One Lux Stay"
                  className="landing-logo-image"
                  loading="lazy"
                />
              </Link>
              <div className="policy-footer-brand-copy">
                <p>
                  Curated luxury stays across global destinations.
                </p>
              </div>
            </div>
          </div>

          <div className="policy-footer-col">
            <h3>Explore</h3>
            <ul className="policy-footer-list">
              {FOOTER_EXPLORE_LINKS.map((item) => (
                <li key={item.label}>
                  <FooterLink item={item} className="policy-footer-list-link" />
                </li>
              ))}
            </ul>
          </div>

          <div className="policy-footer-col">
            <h3>Cities</h3>
            <ul className="policy-footer-list policy-footer-list--cities">
              {FOOTER_CITY_LINKS.map((item) => (
                <li key={item.label}>
                  <Link
                    to={item.to}
                    className="policy-footer-list-link policy-footer-list-link--minimal"
                    onClick={() => handleFooterCityClick(item.city, item.to)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="policy-footer-col policy-footer-col--connect">
            <h3>Contact & Trust</h3>
            <address className="policy-footer-contact-list">
              {footerContactItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className={`policy-footer-contact-item${
                    item.icon === "mail" || item.label === "EU" ? " policy-footer-contact-item--wide" : ""
                  }`}
                >
                  <span className="policy-footer-icon-badge" aria-hidden="true">
                    <TrustIcon kind={item.icon} />
                  </span>
                  <span className="policy-footer-contact-copy">
                    <span className="policy-footer-contact-label">{item.label}</span>
                    <span className="policy-footer-contact-value" data-contact-label={item.label}>
                      {renderFooterContactValue(item)}
                    </span>
                  </span>
                </a>
              ))}
            </address>

            <div className="policy-footer-proof policy-footer-proof--inline" aria-label="One Lux Stay trust signals">
              {FOOTER_TRUST_BADGES.map((badge) => (
                <div key={badge.label} className="policy-footer-trust-badge">
                  <span className="policy-footer-icon-badge policy-footer-icon-badge--soft" aria-hidden="true">
                    <TrustIcon kind={badge.icon} />
                  </span>
                  <span className="policy-footer-trust-badge__content">
                    <strong className="policy-footer-trust-badge__label">{badge.label}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="policy-footer-security" aria-label="Booking benefits">
          {FOOTER_SECURITY_ITEMS.map((item) => (
            <div key={item} className="policy-footer-security-item">
              <span className="policy-footer-security-dot" aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </div>

        <div className="policy-footer-bottom">
          <p>&copy; {currentYear} One Lux Stay. All rights reserved.</p>
          <div className="policy-footer-links">
            {FOOTER_LEGAL_LINKS.map((item) => (
              <Link key={item.label} to={item.to}>
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
