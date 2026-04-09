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
          {/* <Link to="/listings" className="landing-cta-primary">
            Book your stay
          </Link> */}
        </div>
        <div className="policy-footer-col">
          <h3>Explore</h3>
          <ul>
            <li>About One Lux Stay</li>
            <li><Link to="/global">One Lux Stay Global</Link></li>
          </ul>
        </div>
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
        </div>
      </div>
    </footer>
  );
}

export default SiteFooter;
