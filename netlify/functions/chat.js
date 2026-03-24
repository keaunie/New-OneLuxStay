import dotenv from "dotenv";
import defaultConciergeKnowledge from "../../src/data/conciergeKnowledge.js";
import { getConciergeKnowledgeFromSupabase } from "./_shared/supabaseContentService.js";

dotenv.config();

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MAX_MESSAGES = 10;

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const normalizeConciergeKnowledge = (value) => {
  if (!value || typeof value !== "object") return defaultConciergeKnowledge;

  const normalized = {
    ...defaultConciergeKnowledge,
    ...value,
    brand: {
      ...(defaultConciergeKnowledge.brand || {}),
      ...(value.brand || {}),
    },
    pageGuidance: {
      ...(defaultConciergeKnowledge.pageGuidance || {}),
      ...(value.pageGuidance || {}),
    },
    policies: {
      ...(defaultConciergeKnowledge.policies || {}),
      ...(value.policies || {}),
    },
    cities:
      Array.isArray(value.cities) && value.cities.length
        ? value.cities
        : defaultConciergeKnowledge.cities || [],
    faq:
      Array.isArray(value.faq) && value.faq.length
        ? value.faq
        : defaultConciergeKnowledge.faq || [],
  };

  return normalized;
};

const getSupportedCities = (knowledge) =>
  (Array.isArray(knowledge?.cities) ? knowledge.cities : [])
    .map((city) => String(city?.name || "").trim())
    .filter(Boolean);

const buildSiteContext = (supportedCities = []) => `
You are the One Lux Stay AI concierge for a hospitality website.

Brand scope:
- Help visitors understand One Lux Stay properties and the booking journey.
- Supported city pages on this website include ${supportedCities.join(", ") || "Antwerp, Los Angeles, Miami, Redondo Beach, Dubai"}, and a global listings view.
- You can explain the general purpose of pages, help narrow down destinations, and guide users toward booking.

Behavior rules:
- Be warm, concise, and hospitality-focused.
- Use only the information in this prompt and the supplied page context.
- Do not invent live pricing, live availability, fees, amenities, policies, or guarantees.
- If a user asks for details you cannot verify, say you are not certain and direct them to the listing page or the One Lux Stay team.
- Never request or handle payment card details, passport numbers, or sensitive identity data.
- If someone wants to book, encourage them to continue through the site's booking flow.
- If someone needs a human for anything sensitive or uncertain, suggest contacting the One Lux Stay team directly through the website.
`;

const getConciergeKnowledge = async () => {
  const value = await getConciergeKnowledgeFromSupabase(defaultConciergeKnowledge);
  return normalizeConciergeKnowledge(value);
};

const baseHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const getCorsHeaders = (event = {}) => ({
  ...baseHeaders,
  "Access-Control-Allow-Headers":
    event?.headers?.["access-control-request-headers"] ||
    event?.headers?.["Access-Control-Request-Headers"] ||
    "Content-Type, Authorization, Accept, Origin, X-Requested-With",
});

const jsonResponse = (statusCode, body, event) => ({
  statusCode,
  headers: getCorsHeaders(event),
  body: JSON.stringify(body),
});

const sanitizeString = (value, maxLength = 1200) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeMessages = (messages) =>
  Array.isArray(messages)
    ? messages
        .filter((message) => message && typeof message.content === "string")
        .map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: sanitizeString(message.content, 2000),
        }))
        .filter((message) => message.content)
        .slice(-MAX_MESSAGES)
    : [];

const sanitizePageContext = (pageContext) => {
  if (!pageContext || typeof pageContext !== "object") return {};

  return {
    pathname: sanitizeString(pageContext.pathname, 240),
    search: sanitizeString(pageContext.search, 240),
    pageType: sanitizeString(pageContext.pageType, 80),
    city: sanitizeString(pageContext.city, 120),
    listingId: sanitizeString(pageContext.listingId, 120),
    title: sanitizeString(pageContext.title, 180),
  };
};

const formatKnowledgeSection = (title, lines) => {
  const normalized = lines.filter(Boolean);
  if (!normalized.length) return "";
  return [`${title}:`, ...normalized.map((line) => `- ${line}`), ""].join("\n");
};

const buildKnowledgeText = (conciergeKnowledge) => {
  const brandLines = [
    `Brand: ${conciergeKnowledge.brand.name}`,
    conciergeKnowledge.brand.description,
    conciergeKnowledge.brand.bookingSummary && `Booking flow: ${conciergeKnowledge.brand.bookingSummary}`,
    conciergeKnowledge.brand.contactEmail && `Contact email: ${conciergeKnowledge.brand.contactEmail}`,
    conciergeKnowledge.brand.contactPhone && `Contact phone: ${conciergeKnowledge.brand.contactPhone}`,
    conciergeKnowledge.brand.contactWhatsApp && `WhatsApp: ${conciergeKnowledge.brand.contactWhatsApp}`,
    conciergeKnowledge.brand.humanEscalation && `Escalation: ${conciergeKnowledge.brand.humanEscalation}`,
  ];

  const cityLines = conciergeKnowledge.cities.map((city) => {
    const extras = Array.isArray(city.notes) && city.notes.length ? ` Notes: ${city.notes.join(" ")}` : "";
    return `${city.name}: ${city.summary}${extras}`;
  });

  const policyLines = Object.entries(conciergeKnowledge.policies || {}).map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
    return `${label}: ${value}`;
  });

  const faqLines = (conciergeKnowledge.faq || []).map((item) => `Q: ${item.question} A: ${item.answer}`);

  return [
    formatKnowledgeSection("Manual concierge knowledge", brandLines),
    formatKnowledgeSection("Cities", cityLines),
    formatKnowledgeSection("Policies", policyLines),
    formatKnowledgeSection("FAQ", faqLines),
  ]
    .filter(Boolean)
    .join("\n");
};

const fallbackNoticeFromReason = (reason) => {
  switch (reason) {
    case "missing_api_key":
      return "Live AI is not configured yet.";
    case "insufficient_quota":
      return "Live AI billing needs credits.";
    case "rate_limit":
      return "Live AI is busy right now.";
    case "timeout":
      return "Live AI timed out.";
    default:
      return "Live AI is temporarily unavailable.";
  }
};

const buildFallbackReply = ({ latestUserMessage, pageContext, conciergeKnowledge, supportedCities }) => {
  const prompt = String(latestUserMessage?.content || "").toLowerCase();
  const city = pageContext.city || "One Lux Stay";
  const onListingPage = pageContext.pageType === "listing";
  const onCityPage = pageContext.pageType === "city";
  const visibleCities = supportedCities.length
    ? supportedCities
    : ["Antwerp", "Los Angeles", "Miami", "Redondo Beach", "Dubai"];

  if (/\b(cities|city|locations|where)\b/.test(prompt)) {
    return `We currently feature stays in ${visibleCities.join(", ")}. If you want, tell me which vibe you want most and I can point you toward the best fit.`;
  }

  if (/\b(book|booking|reserve|reservation|checkout)\b/.test(prompt)) {
    if (onListingPage) {
      return "You can usually book directly from this listing page by choosing dates, guest count, reviewing the stay details, and continuing through checkout. If anything looks unclear, I recommend double-checking the listing details and then contacting the One Lux Stay team for confirmation.";
    }

    return conciergeKnowledge.brand.bookingSummary
      ? `${conciergeKnowledge.brand.bookingSummary} If you are still deciding, I can help narrow down which city page to start from.`
      : "You can book by choosing a city or listing, selecting your dates and guest count, reviewing the stay details, and continuing through checkout on the site. If you are still deciding, I can help narrow down which city page to start from.";
  }

  if (/\b(property|properties|stay|stays|listing|choose|recommend|best)\b/.test(prompt)) {
    if (onListingPage) {
      return `You are already on a listing page${pageContext.listingId ? ` for listing ${pageContext.listingId}` : ""}. A good next step is to review the listing details, dates, and guest count, then continue through the booking flow if it looks like a fit.`;
    }

    if (onCityPage) {
      return `You are on the ${city} page now. If you want help choosing, tell me your trip type, guest count, and whether you care most about location, style, or space, and I can guide you from there.`;
    }

    return "A good place to start is by choosing a city first: Antwerp, Los Angeles, Miami, Redondo Beach, or Dubai. Once you know the destination, I can help point you toward the right page and booking flow.";
  }

  if (/\b(this page|current page|where am i|what page)\b/.test(prompt)) {
    if (onListingPage) {
      return `You are on a listing page${pageContext.listingId ? ` for listing ${pageContext.listingId}` : ""}. ${conciergeKnowledge.pageGuidance?.listing || "This is the right place to review the stay details and continue into booking."}`;
    }

    if (onCityPage) {
      return `You are on the ${city} city page. ${conciergeKnowledge.pageGuidance?.city || "This page is meant to help guests explore stays in that destination and move into the booking flow."}`;
    }

    return conciergeKnowledge.pageGuidance?.home || "You are on a general One Lux Stay page. From here, you can browse city pages, explore listings, and continue into booking.";
  }

  return `I can still help with the basics while the live AI service is unavailable. One Lux Stay currently features stays in ${visibleCities.join(", ")}${city && city !== "One Lux Stay" && city !== "Global" ? `, and you are currently browsing ${city}` : ""}. Ask me about cities, booking steps, or how to use the page you are on.`;
};

const fallbackResponse = ({
  event,
  latestUserMessage,
  pageContext,
  reason,
  conciergeKnowledge,
  supportedCities,
}) =>
  jsonResponse(
    200,
    {
      reply: buildFallbackReply({
        latestUserMessage,
        pageContext,
        reason,
        conciergeKnowledge,
        supportedCities,
      }),
      mode: "fallback",
      notice: fallbackNoticeFromReason(reason),
    },
    event,
  );

const formatTranscript = (messages) =>
  messages
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n");

const buildInput = ({ pageContext, messages, knowledgeText }) => {
  const contextLines = [
    `Page title: ${pageContext.title || "Unknown"}`,
    `Pathname: ${pageContext.pathname || "/"}`,
    `Query string: ${pageContext.search || "None"}`,
    `Page type: ${pageContext.pageType || "Unknown"}`,
    `City context: ${pageContext.city || "Unknown"}`,
    `Listing ID: ${pageContext.listingId || "Unknown"}`,
  ];

  return [
    knowledgeText,
    "Current website context:",
    ...contextLines,
    "",
    "Conversation so far:",
    formatTranscript(messages),
    "",
    "Reply to the latest user message as the One Lux Stay AI concierge.",
  ].join("\n");
};

const extractOutputText = (payload) => {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  if (!Array.isArray(payload?.output)) return "";

  const parts = [];
  payload.output.forEach((item) => {
    if (!Array.isArray(item?.content)) return;
    item.content.forEach((contentPart) => {
      if (contentPart?.type === "output_text" && typeof contentPart.text === "string") {
        parts.push(contentPart.text);
        return;
      }

      if (contentPart?.type === "text") {
        if (typeof contentPart.text === "string") {
          parts.push(contentPart.text);
        } else if (typeof contentPart.text?.value === "string") {
          parts.push(contentPart.text.value);
        }
      }
    });
  });

  return parts.join("\n").trim();
};

const fetchWithTimeout = async (url, options = {}, timeout = 20_000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: getCorsHeaders(event), body: "" };
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, event);
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" }, event);
  }

  const messages = sanitizeMessages(payload?.messages);
  const pageContext = sanitizePageContext(payload?.pageContext);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!latestUserMessage) {
    return jsonResponse(400, { error: "A user message is required" }, event);
  }

  const conciergeKnowledge = await getConciergeKnowledge();
  const supportedCities = getSupportedCities(conciergeKnowledge);
  const knowledgeText = buildKnowledgeText(conciergeKnowledge);
  const siteContext = buildSiteContext(supportedCities);

  const apiKey = getEnv("OPENAI_API_KEY");
  const model = getEnv("OPENAI_CHAT_MODEL") || "gpt-5-mini";
  if (!apiKey) {
    return fallbackResponse({
      event,
      latestUserMessage,
      pageContext,
      reason: "missing_api_key",
      conciergeKnowledge,
      supportedCities,
    });
  }

  try {
    const response = await fetchWithTimeout(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: siteContext,
        input: buildInput({ pageContext, messages, knowledgeText }),
        max_output_tokens: 350,
      }),
    });

    const rawText = await response.text();
    let data = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = { raw: rawText };
    }

    if (!response.ok) {
      const errorCode = data?.error?.code || data?.error?.type || "";
      if (
        response.status === 429 ||
        errorCode === "insufficient_quota" ||
        errorCode === "rate_limit_exceeded"
      ) {
        return fallbackResponse({
          event,
          latestUserMessage,
          pageContext,
          reason: errorCode === "insufficient_quota" ? "insufficient_quota" : "rate_limit",
          conciergeKnowledge,
          supportedCities,
        });
      }

      if (response.status >= 500 || errorCode === "invalid_api_key") {
        return fallbackResponse({
          event,
          latestUserMessage,
          pageContext,
          reason: "service_unavailable",
          conciergeKnowledge,
          supportedCities,
        });
      }

      return jsonResponse(
        response.status,
        {
          error: data?.error?.message || "OpenAI request failed",
          details: data?.error || data || null,
        },
        event,
      );
    }

    const reply = extractOutputText(data);
    if (!reply) {
      return jsonResponse(502, { error: "OpenAI returned an empty response" }, event);
    }

    return jsonResponse(
      200,
      {
        reply,
        model,
      },
      event,
    );
  } catch (error) {
    return fallbackResponse({
      event,
      latestUserMessage,
      pageContext,
      reason: error?.name === "AbortError" ? "timeout" : "service_unavailable",
      conciergeKnowledge,
      supportedCities,
    });
  }
}
