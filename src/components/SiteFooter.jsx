import { Link } from "react-router-dom";
import { trackGuestCityClick } from "../utils/guestAnalytics";

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
  { label: "Contact", href: "mailto:reservations@oneluxstay.com" },
];

const FOOTER_CITY_LINKS = [
  { label: "Antwerp", to: "/antwerp" },
  { label: "Dubai", to: "/dubai" },
  { label: "Los Angeles", to: "/los-angeles" },
  { label: "Miami", to: "/miami" },
  { label: "Redondo Beach", to: "/redondo-beach" },
];

const FOOTER_CONTACT_ITEMS = [
  { label: "USA", value: "+1 213 866 3589", href: "tel:+12138663589", icon: "phone" },
  { label: "UAE", value: "+971 55 727 7059", href: "tel:+971557277059", icon: "phone" },
  { label: "EU", value: "+32 493 81 34 41", href: "tel:+32493813441", icon: "phone" },
  { label: "Email", value: "reservations@oneluxstay.com", href: "mailto:reservations@oneluxstay.com", icon: "mail" },
];

const FOOTER_TRUST_BADGES = [
  { label: "4.5+ rated", icon: "star" },
  { label: "Verified Business", icon: "shield" },
  { label: "USA • EU • UAE", icon: "globe" },
];

const FOOTER_SECURITY_ITEMS = [
  "Stripe-secured payments",
  "No hidden fees",
  "Direct booking perks",
];

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
  const currentYear = new Date().getFullYear();

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
            <p className="policy-footer-tagline">Hotel standards. Private living.</p>
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
                  <FooterLink item={item} className="policy-footer-list-link policy-footer-list-link--minimal" />
                </li>
              ))}
            </ul>
          </div>

          <div className="policy-footer-col policy-footer-col--connect">
            <h3>Contact & Trust</h3>
            <address className="policy-footer-contact-list">
              {FOOTER_CONTACT_ITEMS.map((item) => (
                <a key={item.label} href={item.href} className="policy-footer-contact-item">
                  <span className="policy-footer-icon-badge" aria-hidden="true">
                    <TrustIcon kind={item.icon} />
                  </span>
                  <span className="policy-footer-contact-copy">
                    <span className="policy-footer-contact-label">{item.label}</span>
                    <span className="policy-footer-contact-value">{item.value}</span>
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
<<<<<<< HEAD
        <div className="policy-footer-col">
          <h3>Cities</h3>
          <ul>
            <li><Link to="/antwerp" onClick={() => handleFooterCityClick("Antwerp", "/antwerp")}>Antwerp</Link></li>
            <li><Link to="/dubai" onClick={() => handleFooterCityClick("Dubai", "/dubai")}>Dubai</Link></li>
            <li><Link to="/los-angeles" onClick={() => handleFooterCityClick("Los Angeles", "/los-angeles")}>Los Angeles</Link></li>
            <li><Link to="/miami" onClick={() => handleFooterCityClick("Miami", "/miami")}>Miami</Link></li>
            <li><Link to="/redondo-beach" onClick={() => handleFooterCityClick("Redondo Beach", "/redondo-beach")}>Redondo Beach</Link></li>
          </ul>
        </div>
        <div className="policy-footer-col">
          <h3>Connect</h3>
          <ul>
            <li>+1 213 866 3589</li>
            <li>+971 55 727 7059</li>
            <li>+32 493 81 34 41</li>
            <li>reservations@oneluxstay.com</li>
          </ul>
        </div>
      </div>
      <div className="policy-footer-bottom">
        <p>c 2026 One Lux Stay. All rights reserved.</p>
        <div className="policy-footer-links">
          <Link to="/privacy-policy">Privacy and Policy</Link>
          <Link to="/terms">Terms and Conditions</Link>
          <Link to="/california-privacy-policy">California Privacy Policy</Link>
=======

        <div className="policy-footer-bottom">
          <p>&copy; {currentYear} One Lux Stay. All rights reserved.</p>
          <div className="policy-footer-links">
            {FOOTER_LEGAL_LINKS.map((item) => (
              <Link key={item.label} to={item.to}>
                {item.label}
              </Link>
            ))}
          </div>
>>>>>>> 16b7754 ( new footer)
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
