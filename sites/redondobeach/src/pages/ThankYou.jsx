import { Link, Navigate } from "react-router-dom";
import usePageMeta from "../lib/usePageMeta.js";
import { SITE } from "../data/content.js";
import { whatsappLink } from "../lib/contact.js";

export const INQUIRY_SENT_KEY = "ols-redondo-inquiry-email";

export default function ThankYou() {
  usePageMeta("Thank you", "Your inquiry has been sent to the OneLuxStay Redondo Beach team.", { noindex: true });

  let email = null;
  try {
    email = window.sessionStorage.getItem(INQUIRY_SENT_KEY);
  } catch {
    email = null;
  }
  // Only reachable right after a submitted inquiry, so a direct visit never counts as a lead.
  if (email === null) return <Navigate to="/" replace />;

  return (
    <section className="section">
      <div className="container container--narrow center">
        <p className="eyebrow">Inquiry received</p>
        <h1>Thank you, we&rsquo;ve got your inquiry</h1>
        <p>
          Our team will reply{email ? ` to ${email}` : ""} with availability and your monthly rate.
          Stays are {SITE.minNights} nights or more.
        </p>
        <div className="hero__actions hero__actions--center">
          <Link to="/residences" className="btn btn--primary">See the residences</Link>
          <Link to="/explore" className="btn btn--ghost">Explore Redondo Beach</Link>
        </div>
        <p className="section__note">
          In a hurry? <a href={whatsappLink(`Hi! I just sent an inquiry for a ${SITE.minNights}+ night stay in Redondo Beach.`)} target="_blank" rel="noreferrer">WhatsApp us</a>{" "}
          or call <a href={SITE.phone.href}>{SITE.phone.display}</a>.
        </p>
      </div>
    </section>
  );
}
