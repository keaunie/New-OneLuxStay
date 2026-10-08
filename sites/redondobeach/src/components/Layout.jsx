import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { SITE } from "../data/content.js";

const NAV = [
  { to: "/residences", label: "Residences" },
  { to: "/explore", label: "Explore Redondo Beach" },
  { to: "/long-term-stays", label: "Long-term stays" },
  { to: "/contact", label: "Contact" },
];

export default function Layout() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <header className="site-header">
        <div className="container site-header__inner">
          <Link to="/" className="brand" aria-label="OneLuxStay Redondo Beach home">
            <img src="/ols-logo.webp" alt="" width="36" height="36" />
            <span className="brand__text">
              <span className="brand__name">OneLuxStay</span>
              <span className="brand__place">Redondo Beach</span>
            </span>
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
          <nav id="primary-nav" className={`primary-nav${menuOpen ? " is-open" : ""}`} aria-label="Primary">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} onClick={() => setMenuOpen(false)} className={({ isActive }) => (isActive ? "is-active" : "")}>
                {item.label}
              </NavLink>
            ))}
            <Link to="/contact" onClick={() => setMenuOpen(false)} className="btn btn--small btn--primary primary-nav__cta">Inquire</Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container site-footer__grid">
          <div>
            <p className="site-footer__title">OneLuxStay Redondo Beach</p>
            <p>Furnished homes for stays of {SITE.minNights} nights or more, by the beach in Redondo Beach, California.</p>
            <p className="site-footer__small">
              Looking for a short stay or another city? Visit <a href={SITE.mainSite}>oneluxstay.com</a>.
            </p>
          </div>
          <div>
            <p className="site-footer__title">Explore</p>
            <ul>
              {NAV.map((item) => (
                <li key={item.to}><Link to={item.to}>{item.label}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="site-footer__title">Talk to us</p>
            <ul>
              <li><a href={SITE.phone.href}>{SITE.phone.display}</a></li>
              <li><a href={`https://wa.me/${SITE.whatsapp.digits}`} target="_blank" rel="noreferrer">WhatsApp {SITE.whatsapp.display}</a></li>
              <li><a href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
            </ul>
          </div>
        </div>
        <div className="container site-footer__legal">
          <span>&copy; {new Date().getFullYear()} OneLuxStay. All rights reserved.</span>
          <a href={`${SITE.mainSite}/privacy-policy`}>Privacy</a>
          <a href={`${SITE.mainSite}/terms-and-conditions`}>Terms</a>
        </div>
      </footer>
    </>
  );
}
