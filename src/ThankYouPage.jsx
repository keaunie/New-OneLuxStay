import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import "./App.css";

const REDIRECT_URL = "https://oneluxstay.com";
const REDIRECT_DELAY_SECONDS = 5;
const LOGO_URL = "https://image.oneluxstay.com/oneluxstay-logo.webp";

const ThankYouPage = () => {
  const [secondsLeft, setSecondsLeft] = useState(REDIRECT_DELAY_SECONDS);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    const redirectTimer = window.setTimeout(() => {
      window.location.href = REDIRECT_URL;
    }, REDIRECT_DELAY_SECONDS * 1000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(redirectTimer);
    };
  }, []);

  return (
    <div className="ack-page">
      <div className="ack-card">
        <header className="ack-card__header">
          <img
            src={LOGO_URL}
            alt="OneLuxStay"
            className="ack-card__logo"
            loading="lazy"
          />
          <p className="ack-card__kicker">OneLuxStay</p>
          <h1>Thank You For Booking With Us</h1>
          <p className="ack-card__sub">
            We appreciate your trust in OneLuxStay. Your booking is complete.
          </p>
        </header>

        <div className="ack-success">
          <p>
            Redirecting you to{" "}
            <a href={REDIRECT_URL}>oneluxstay.com</a> in {secondsLeft} second
            {secondsLeft === 1 ? "" : "s"}...
          </p>
          <a href={REDIRECT_URL}>Go now</a>
        </div>
      </div>
    </div>
  );
};

export default ThankYouPage;
