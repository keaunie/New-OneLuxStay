import { Link } from "react-router-dom";

function SiteFooter() {
  return (
    <footer className="policy-footer">
      <div className="policy-footer-inner">
        <div className="policy-footer-brand">
          <Link to="/" className="landing-logo-mark">
            OneLuxStay
          </Link>
          <p>
            Curated, design-driven suites in Antwerp, Dubai, Miami, Los Angeles and Redondo Beach. Combining the
            privacy of a residence with the polish of an elevated hotel.
          </p>
          <Link to="/stay" className="landing-cta-primary">
            Book your stay
          </Link>
        </div>
        <div className="policy-footer-col">
          <h3>Destinations</h3>
          <ul>
            <li>Antwerp</li>
            <li>Dubai - Grande Signature Residences</li>
            <li>Redondo Beach</li>
            <li>Los Angeles</li>
            <li>Miami - Brickell Bay</li>
          </ul>
        </div>
        <div className="policy-footer-col">
          <h3>Explore</h3>
          <ul>
            <li>About One Lux Stay</li>
            <li>All destinations</li>
            <li>Contact and inquiries</li>
          </ul>
        </div>
        <div className="policy-footer-col">
          <h3>Connect</h3>
          <ul>
            <li>+1 213 866 3589</li>
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
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
