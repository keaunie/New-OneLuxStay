import usePageMeta from "../lib/usePageMeta.js";
import InquiryForm from "../components/InquiryForm.jsx";
import { BUILDINGS, SITE } from "../data/content.js";

export default function Contact() {
  usePageMeta(
    "Contact & inquiries",
    `Ask about availability and monthly pricing for a furnished long-term stay (${SITE.minNights}+ nights) in Redondo Beach. Call, WhatsApp, email or send an inquiry.`,
  );

  return (
    <>
      <section className="page-head">
        <div className="container">
          <p className="eyebrow">Contact</p>
          <h1>Plan your Redondo Beach stay</h1>
          <p className="page-head__lead">
            Tell us your move-in date and how long you&rsquo;d like to stay. We&rsquo;ll reply with the homes that fit and
            your monthly rate.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container split">
          <div className="panel">
            <h2>Send an inquiry</h2>
            <InquiryForm />
          </div>
          <div>
            <h2>Talk to our team</h2>
            <ul className="contact-list">
              <li><span>Phone</span><a href={SITE.phone.href}>{SITE.phone.display}</a></li>
              <li><span>WhatsApp</span><a href={`https://wa.me/${SITE.whatsapp.digits}`} target="_blank" rel="noreferrer">{SITE.whatsapp.display}</a></li>
              <li><span>Email</span><a href={`mailto:${SITE.email}`}>{SITE.email}</a></li>
            </ul>
            <h3>Our buildings</h3>
            <ul className="contact-list">
              {BUILDINGS.map((building) => (
                <li key={building.key}><span>{building.name}</span>{building.street}</li>
              ))}
            </ul>
            <p className="section__note">
              Stays are {SITE.minNights} nights or more. For shorter stays or other cities, visit{" "}
              <a href={SITE.mainSite}>oneluxstay.com</a>.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
