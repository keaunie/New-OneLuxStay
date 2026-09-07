import { useEffect, useState } from "react";
import { hasDecided, setConsent } from "../utils/cookieConsent";

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasDecided());
  }, []);

  if (!visible) return null;

  const decide = (analyticsAllowed) => {
    setConsent(analyticsAllowed);
    setVisible(false);
  };

  return (
    <div className="cookie-consent" role="dialog" aria-live="polite" aria-label="Cookie preferences">
      <p className="cookie-consent__text">
        We use essential cookies to run this site, and optional analytics cookies to understand how it&rsquo;s
        used. You can accept or decline analytics — see our{" "}
        <a href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a> for details.
      </p>
      <div className="cookie-consent__actions">
        <button type="button" className="cookie-consent__btn cookie-consent__btn--secondary" onClick={() => decide(false)}>
          Necessary only
        </button>
        <button type="button" className="cookie-consent__btn cookie-consent__btn--primary" onClick={() => decide(true)}>
          Accept all
        </button>
      </div>
    </div>
  );
}
