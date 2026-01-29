import { Link } from "react-router-dom";

function SiteFooter() {
  return (
    <footer className="policy-footer">
      <div className="policy-footer-inner">
        <div className="policy-footer-brand">
          <div className="policy-footer-brand-intro">
            <Link to="/" className="landing-logo-mark landing-logo-mark--image">
              <img
                src="https://assets.guesty.com/image/upload/s--mirjR9ah--/v1759504407/production/666b3af27fc6d5653142b0af/private/jkenbeaohfqtt0f2lb6q.png"
                alt="One Lux Stay"
                className="landing-logo-image"
                loading="lazy"
              />
            </Link>
            <p>
              Curated, design-driven suites in Antwerp, Dubai, Miami, Los Angeles and Redondo Beach. Combining the
              privacy of a residence with the polish of an elevated hotel.
            </p>
          </div>
          <Link to="/stay" className="landing-cta-primary">
            Book your stay
          </Link>
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
          <h3>Cities</h3>
          <ul>
            <li>Antwerp</li>
            <li>Dubai</li>
            <li>Los Angeles</li>
            <li>Miami</li>
            <li>Redondo Beach</li>
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
