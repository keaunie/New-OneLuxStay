import { useState } from "react";
import { SITE } from "../data/content.js";
import { inquiryMailto, whatsappLink } from "../lib/contact.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Opens the guest's email app with a pre-filled inquiry to the reservations team, the same way the
// main OneLuxStay site handles long-term Redondo inquiries. WhatsApp and phone are one tap away.
export default function InquiryForm({ residence = "", compact = false }) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    moveIn: "",
    stayLength: "",
    guests: "2",
    message: "",
  });
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.fullName.trim() || !EMAIL_RE.test(form.email.trim()) || !form.moveIn) {
      setError("Please add your name, a valid email and your move-in date.");
      return;
    }
    setError("");
    setSent(true);
    window.location.href = inquiryMailto({ ...form, residence });
  };

  const waMessage = `Hi! I'm interested in a long-term stay (${SITE.minNights}+ nights) in Redondo Beach${
    residence ? ` - ${residence}` : ""
  }${form.moveIn ? `, moving in around ${form.moveIn}` : ""}. Could you share availability and monthly pricing?`;

  return (
    <form className={`inquiry-form${compact ? " inquiry-form--compact" : ""}`} onSubmit={handleSubmit} noValidate>
      <div className="inquiry-form__grid">
        <label>Full name
          <input value={form.fullName} onChange={set("fullName")} autoComplete="name" required />
        </label>
        <label>Email
          <input type="email" value={form.email} onChange={set("email")} autoComplete="email" required />
        </label>
        <label>Phone <span className="optional">(optional)</span>
          <input type="tel" value={form.phone} onChange={set("phone")} autoComplete="tel" />
        </label>
        <label>Move-in date
          <input type="date" value={form.moveIn} onChange={set("moveIn")} required />
        </label>
        <label>Length of stay
          <select value={form.stayLength} onChange={set("stayLength")}>
            <option value="">Not sure yet</option>
            <option>1 month</option>
            <option>2-3 months</option>
            <option>4-6 months</option>
            <option>6+ months</option>
          </select>
        </label>
        <label>Guests
          <select value={form.guests} onChange={set("guests")}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
      <label>Anything we should know? <span className="optional">(optional)</span>
        <textarea rows={compact ? 3 : 4} value={form.message} onChange={set("message")} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="inquiry-form__actions">
        <button type="submit" className="btn btn--primary">Send inquiry by email</button>
        <a className="btn btn--ghost" href={whatsappLink(waMessage)} target="_blank" rel="noreferrer">WhatsApp us</a>
        <a className="btn btn--ghost" href={SITE.phone.href}>Call {SITE.phone.display}</a>
      </div>
      {sent && (
        <p className="form-note" role="status">
          Your email app should have opened with your inquiry ready to send. If it didn&rsquo;t, write to{" "}
          <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or message us on WhatsApp.
        </p>
      )}
    </form>
  );
}
