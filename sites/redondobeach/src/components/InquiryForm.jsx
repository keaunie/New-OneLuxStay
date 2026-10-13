import { useState } from "react";
import { SITE } from "../data/content.js";
import { inquiryMailto, whatsappLink } from "../lib/contact.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sends the inquiry to the reservations team through our own endpoint. If that fails, the guest gets a
// ready-to-send email as a fallback. WhatsApp and phone are one tap away.
export default function InquiryForm({ residence = "", compact = false }) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    moveIn: "",
    stayLength: "",
    guests: "2",
    message: "",
    website: "", // honeypot: hidden from people, filled in by bots
  });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("idle"); // idle | sending | sent | failed

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === "sending") return;
    if (!form.fullName.trim() || !EMAIL_RE.test(form.email.trim()) || !form.moveIn) {
      setError("Please add your name, a valid email and your move-in date.");
      return;
    }
    setError("");
    setStatus("sending");
    try {
      const response = await fetch("/api/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, residence }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 400) {
          setError(result?.error || "Please check your details and try again.");
          setStatus("idle");
          return;
        }
        throw new Error("send failed");
      }
      setStatus("sent");
    } catch {
      setStatus("failed");
    }
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
      <input
        type="text"
        name="website"
        value={form.website}
        onChange={set("website")}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="inquiry-form__actions">
        <button type="submit" className="btn btn--primary" disabled={status === "sending" || status === "sent"}>
          {status === "sending" ? "Sending…" : status === "sent" ? "Inquiry sent" : "Send inquiry"}
        </button>
        <a className="btn btn--ghost" href={whatsappLink(waMessage)} target="_blank" rel="noreferrer">WhatsApp us</a>
        <a className="btn btn--ghost" href={SITE.phone.href}>Call {SITE.phone.display}</a>
      </div>
      {status === "sent" && (
        <p className="form-note" role="status">
          Thank you, your inquiry is on its way to our team. We&rsquo;ll reply to {form.email.trim()} with availability and
          your monthly rate.
        </p>
      )}
      {status === "failed" && (
        <p className="form-error" role="alert">
          We couldn&rsquo;t send that just now. <a href={inquiryMailto({ ...form, residence })}>Email it to us instead</a>, or
          message us on WhatsApp.
        </p>
      )}
    </form>
  );
}
