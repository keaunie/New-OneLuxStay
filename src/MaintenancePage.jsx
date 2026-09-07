import { useEffect, useState } from "react";
import "./App.css";

const LOGO_URL = "https://admin.oneluxstay.com/oneluxstay-logo.webp";

const QUOTES = [
  "The greatest things come to those who wait.",
  "Good things come to those who wait, but better things come to those who prepare.",
  "Patience is bitter, but its fruit is sweet.",
  "A little more time now, for a much better stay later.",
  "The best view comes after the hardest climb.",
];

const MaintenancePage = () => {
  const [quote] = useState(() => QUOTES[Math.floor(Math.random() * QUOTES.length)]);

  useEffect(() => {
    document.title = "Under Maintenance — OneLuxStay";
  }, []);

  return (
    <div className="ack-page maint-page">
      <div className="ack-card maint-card">
        <img className="ack-card__logo" src={LOGO_URL} alt="OneLuxStay logo" loading="lazy" />

        <header className="ack-card__header">
          <p className="ack-card__kicker">OneLuxStay</p>
          <h1>We&rsquo;ll Be Right Back</h1>
          <p className="ack-card__sub">
            We&rsquo;re currently performing scheduled maintenance to make your next stay even better.
            Please check back shortly.
          </p>
        </header>

        <blockquote className="maint-quote">
          <p>&ldquo;{quote}&rdquo;</p>
        </blockquote>

        <div className="ack-success maint-contact">
          <p>Need immediate assistance?</p>
          <a href="mailto:reservations@oneluxstay.com">reservations@oneluxstay.com</a>
        </div>
      </div>
    </div>
  );
};

export default MaintenancePage;
