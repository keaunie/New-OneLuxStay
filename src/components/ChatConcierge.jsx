import { useMemo } from "react";
import { useLocation } from "react-router-dom";

const DEFAULT_WHATSAPP_NUMBER = "971588858935";

const normalizeWhatsAppNumber = (value = "") => {
  const digits = String(value || "").replace(/[^\d]/g, "");
  return digits || DEFAULT_WHATSAPP_NUMBER;
};

const cityLabelFromPath = (pathname = "") => {
  const lower = pathname.toLowerCase();
  if (lower.startsWith("/antwerp") || lower.startsWith("/antwerpen")) return "Antwerp";
  if (lower.startsWith("/los-angeles") || lower.startsWith("/losangeles")) return "Los Angeles";
  if (lower.startsWith("/miami")) return "Miami";
  if (lower.startsWith("/redondo")) return "Redondo Beach";
  if (lower.startsWith("/dubai")) return "Dubai";
  if (lower.startsWith("/global")) return "Global stays";
  return "One Lux Stay";
};

const buildWhatsAppMessage = (location) => {
  const city = cityLabelFromPath(location?.pathname || "");
  const url = typeof window !== "undefined" ? window.location.href : "";
  const listingMatch = String(location?.pathname || "").match(/\/listing\/([^/]+)/i);
  const listingText = listingMatch?.[1] ? ` Listing: ${listingMatch[1]}.` : "";

  return `Hi One Lux Stay, I need help with ${city}.${listingText}${url ? ` Page: ${url}` : ""}`;
};

function ChatConcierge() {
  const location = useLocation();
  const whatsappHref = useMemo(() => {
    const phone = normalizeWhatsAppNumber(import.meta.env.VITE_WHATSAPP_NUMBER);
    return `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(location))}`;
  }, [location]);

  return (
    <div className="chat-concierge chat-concierge--whatsapp">
      <a
        className="chat-concierge__toggle chat-concierge__toggle--whatsapp"
        href={whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with One Lux Stay on WhatsApp"
      >
        <span className="chat-concierge__toggle-badge" aria-hidden="true">
          WA
        </span>
        <span className="chat-concierge__toggle-copy">WhatsApp us</span>
      </a>
    </div>
  );
}

export default ChatConcierge;
