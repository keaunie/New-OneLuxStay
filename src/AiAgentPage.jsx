import { useMemo, useState } from "react";
import apiBase from "./utils/apiBase";
import "./AiAgentPage.css";

const getListingIdFromPath = (pathname = "") => {
  const match = String(pathname || "").match(/\/listing\/([^/]+)/i);
  return match?.[1] || "";
};

const buildPageContext = () => {
  const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
  const city = (() => {
    const lower = pathname.toLowerCase();
    if (lower.startsWith("/antwerp") || lower.startsWith("/antwerpen")) return "Antwerp";
    if (lower.startsWith("/los-angeles") || lower.startsWith("/losangeles")) return "Los Angeles";
    if (lower.startsWith("/miami")) return "Miami";
    if (lower.startsWith("/redondo")) return "Redondo Beach";
    if (lower.startsWith("/dubai")) return "Dubai";
    if (lower.startsWith("/global")) return "Global";
    return "";
  })();

  const pageType = (() => {
    const lower = pathname.toLowerCase();
    if (lower.includes("/listing/")) return "listing";
    if (lower === "/" || lower === "") return "home";
    if (lower.startsWith("/global")) return "global";
    if (
      lower.startsWith("/antwerp") ||
      lower.startsWith("/antwerpen") ||
      lower.startsWith("/los-angeles") ||
      lower.startsWith("/losangeles") ||
      lower.startsWith("/miami") ||
      lower.startsWith("/redondo") ||
      lower.startsWith("/dubai")
    ) {
      return "city";
    }
    return "content";
  })();

  return {
    pathname,
    pageType,
    city,
    listingId: getListingIdFromPath(pathname),
    title: typeof document !== "undefined" ? document.title : "",
  };
};

const initialBookingState = {
  listingId: "",
  listingTitle: "",
  checkIn: "",
  checkOut: "",
  guests: 1,
  requestCheckout: false,
  guest: {
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
  },
};

function AiAgentPage() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState([]);
  const [availability, setAvailability] = useState(null);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pageContext = useMemo(() => buildPageContext(), []);
  const [bookingContext, setBookingContext] = useState(() => ({
    ...initialBookingState,
    listingId: pageContext.listingId || "",
  }));

  const updateBooking = (key, value) => {
    setBookingContext((prev) => ({ ...prev, [key]: value }));
  };

  const updateGuest = (key, value) => {
    setBookingContext((prev) => ({
      ...prev,
      guest: { ...prev.guest, [key]: value },
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const trimmedQuery = String(query || "").trim();
    if (!trimmedQuery || loading) return;

    setLoading(true);
    setError("");
    setCheckoutUrl("");

    try {
      const response = await fetch(`${apiBase}/ai-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: trimmedQuery,
          pageContext,
          bookingContext,
          messages,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "AI query failed");
      }

      const aiAnswer = String(payload?.answer || "").trim();
      setAnswer(aiAnswer);
      setSources(Array.isArray(payload?.sources) ? payload.sources : []);
      setAvailability(payload?.availability || null);
      setCheckoutUrl(String(payload?.checkout?.checkout_url || payload?.checkout?.url || "").trim());

      setMessages((prev) =>
        [
          ...prev,
          { role: "user", content: trimmedQuery },
          { role: "assistant", content: aiAnswer },
        ].slice(-10),
      );
      setQuery("");
    } catch (requestError) {
      setError(String(requestError?.message || "AI query failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ai-agent-page">
      <main className="ai-agent-wrap">
        <header className="ai-agent-header">
          <p className="ai-agent-kicker">One Lux Stay</p>
          <h1>AI Agent Console</h1>
          <p>Ask policy, company, listing, and booking questions with retrieval + live APIs.</p>
        </header>

        <section className="ai-agent-card">
          <h2>Context</h2>
          <p>
            <strong>Path:</strong> {pageContext.pathname}
          </p>
          <p>
            <strong>Page Type:</strong> {pageContext.pageType}
          </p>
          <p>
            <strong>City:</strong> {pageContext.city || "N/A"}
          </p>
          <p>
            <strong>Listing ID:</strong> {pageContext.listingId || "N/A"}
          </p>
        </section>

        <section className="ai-agent-card">
          <h2>Booking Context</h2>
          <div className="ai-agent-grid">
            <label>
              Listing ID
              <input
                value={bookingContext.listingId}
                onChange={(e) => updateBooking("listingId", e.target.value)}
                placeholder="66e1e3875a1f6300d736f28e"
              />
            </label>
            <label>
              Listing Title
              <input
                value={bookingContext.listingTitle}
                onChange={(e) => updateBooking("listingTitle", e.target.value)}
                placeholder="Downtown LA Suite"
              />
            </label>
            <label>
              Check-in
              <input type="date" value={bookingContext.checkIn} onChange={(e) => updateBooking("checkIn", e.target.value)} />
            </label>
            <label>
              Check-out
              <input type="date" value={bookingContext.checkOut} onChange={(e) => updateBooking("checkOut", e.target.value)} />
            </label>
            <label>
              Guests
              <input
                type="number"
                min={1}
                value={bookingContext.guests}
                onChange={(e) => updateBooking("guests", Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label>
              Guest Email (required for checkout link)
              <input
                type="email"
                value={bookingContext.guest.email}
                onChange={(e) => updateGuest("email", e.target.value)}
                placeholder="guest@example.com"
              />
            </label>
            <label>
              First Name
              <input value={bookingContext.guest.firstName} onChange={(e) => updateGuest("firstName", e.target.value)} />
            </label>
            <label>
              Last Name
              <input value={bookingContext.guest.lastName} onChange={(e) => updateGuest("lastName", e.target.value)} />
            </label>
            <label>
              Phone
              <input value={bookingContext.guest.phone} onChange={(e) => updateGuest("phone", e.target.value)} />
            </label>
          </div>
          <label className="ai-agent-checkbox">
            <input
              type="checkbox"
              checked={bookingContext.requestCheckout}
              onChange={(e) => updateBooking("requestCheckout", Boolean(e.target.checked))}
            />
            Create secure checkout link on the next request
          </label>
        </section>

        <section className="ai-agent-card">
          <h2>Ask the Agent</h2>
          <form onSubmit={submit} className="ai-agent-form">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={4}
              placeholder="Example: What is the cancellation policy and is this listing available for my dates?"
            />
            <button type="submit" disabled={loading || !query.trim()}>
              {loading ? "Thinking..." : "Send"}
            </button>
          </form>

          {error && <p className="ai-agent-error">{error}</p>}
          {answer && (
            <article className="ai-agent-answer">
              <h3>Answer</h3>
              <p>{answer}</p>
            </article>
          )}

          {checkoutUrl && (
            <article className="ai-agent-answer">
              <h3>Checkout Link</h3>
              <a href={checkoutUrl} target="_blank" rel="noreferrer">
                {checkoutUrl}
              </a>
            </article>
          )}

          {availability && (
            <article className="ai-agent-answer">
              <h3>Availability Payload</h3>
              <pre>{JSON.stringify(availability, null, 2)}</pre>
            </article>
          )}

          {sources.length > 0 && (
            <article className="ai-agent-answer">
              <h3>Sources</h3>
              <ul>
                {sources.map((source, index) => (
                  <li key={`${source.document_title}-${source.section_title}-${index}`}>
                    {source.document_title} - {source.section_title} ({Number(source.similarity || 0).toFixed(3)})
                  </li>
                ))}
              </ul>
            </article>
          )}
        </section>
      </main>
    </div>
  );
}

export default AiAgentPage;
