import dotenv from "dotenv";
import defaultConciergeKnowledge from "../../src/data/conciergeKnowledge.js";
import { getConciergeKnowledgeFromSupabase } from "./_shared/supabaseContentService.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

dotenv.config();

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const MAX_MESSAGES = 10;
const DEFAULT_MATCH_RPC = "match_document_sections";
const DEFAULT_AI_DOCS_TABLE = "documents";
const DEFAULT_AI_SECTIONS_TABLE = "sections";
const POLICY_CONTENT_TYPES = [
  "terms_conditions",
  "terms_and_conditions",
  "privacy_policy",
  "california_privacy_policy",
];

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
- If retrieved policy knowledge is present in the prompt, prioritize it for legal/policy answers.
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
          content: sanitizeString(message.content, 1200),
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
    if (/^\s*add your\b/i.test(String(value || ""))) return "";
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

const isPolicyQuestion = (text = "") =>
  /\b(terms|conditions|privacy|california privacy|cancellation|cancel|refund|deposit|house rules|policy|policies|check[- ]?in|check[- ]?out|checkout)\b/i.test(
    String(text || ""),
  );

const isUnitInfoQuestion = (text = "") =>
  /\b(unit|listing|property|apartment|villa|suite|room|rooms|bedroom|bathroom|bath|beds?|size|square|sqft|amenit(?:y|ies)|near|nearby|landmark|landmarks|neighborhood|neighbourhood|location)\b/i.test(
    String(text || ""),
  );

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

const buildInput = ({ pageContext, messages, knowledgeText, retrievedPolicyText = "" }) => {
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
    retrievedPolicyText ? `Retrieved policy knowledge:\n${retrievedPolicyText}` : "",
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
      if (contentPart?.type === "output_text") {
        if (typeof contentPart.text === "string") {
          parts.push(contentPart.text);
          return;
        }
        if (typeof contentPart.text?.value === "string") {
          parts.push(contentPart.text.value);
          return;
        }
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

const toVectorLiteral = (values = []) => `[${values.map((value) => Number(value) || 0).join(",")}]`;

const createEmbedding = async ({ apiKey, model, text }) => {
  const response = await fetchWithTimeout(
    OPENAI_EMBEDDINGS_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: sanitizeString(text, 1200),
      }),
    },
    20_000,
  );

  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }

  if (!response.ok) {
    const message = payload?.error?.message || `Embedding request failed (${response.status})`;
    throw new Error(message);
  }

  const embedding = payload?.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || !embedding.length) {
    throw new Error("Embedding response is empty");
  }

  return embedding;
};

const tokenizeQuery = (value = "") => {
  const stopWords = new Set([
    "and",
    "the",
    "for",
    "are",
    "can",
    "you",
    "what",
    "when",
    "where",
    "which",
    "how",
    "does",
    "with",
    "from",
    "that",
    "this",
    "your",
    "about",
    "policy",
    "policies",
    "terms",
    "conditions",
  ]);

  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim().replace(/-/g, ""))
    .filter((token) => token.length >= 3 && !stopWords.has(token))
    .slice(0, 8);
};

const scoreSectionMatch = ({ text = "", title = "", tokens = [] }) => {
  const lowerText = String(text || "").toLowerCase();
  const lowerTitle = String(title || "").toLowerCase();
  if (!tokens.length) return 0;
  let score = 0;
  tokens.forEach((token) => {
    if (lowerTitle.includes(token)) score += 4;
    if (lowerText.includes(token)) score += 1;
  });
  return score;
};

const retrievePolicySectionsByKeyword = async ({ queryText, limit = 3 }) => {
  const docsTable = sanitizeString(getEnv("SUPABASE_AI_DOCS_TABLE") || DEFAULT_AI_DOCS_TABLE, 120);
  const sectionsTable = sanitizeString(getEnv("SUPABASE_AI_SECTIONS_TABLE") || DEFAULT_AI_SECTIONS_TABLE, 120);
  const contentTypeFilter = `(${POLICY_CONTENT_TYPES.join(",")})`;

  const documentRows = await supabaseRestRequest(docsTable, {
    query: {
      select: "id,title,content_type",
      content_type: `in.${contentTypeFilter}`,
      limit: 300,
    },
  });

  const docs = Array.isArray(documentRows) ? documentRows : [];
  if (!docs.length) return [];

  const docMap = new Map(docs.map((doc) => [Number(doc.id), doc]));
  const idList = docs.map((doc) => Number(doc.id)).filter(Number.isFinite);
  if (!idList.length) return [];

  const sections = await supabaseRestRequest(sectionsTable, {
    query: {
      select: "id,document_id,title,content",
      document_id: `in.(${idList.join(",")})`,
      limit: 800,
    },
  });

  const tokens = tokenizeQuery(queryText);
  const ranked = (Array.isArray(sections) ? sections : [])
    .map((section) => {
      const score = scoreSectionMatch({
        text: section?.content,
        title: section?.title,
        tokens,
      });
      const doc = docMap.get(Number(section?.document_id));
      return {
        section_id: section?.id,
        document_id: section?.document_id,
        document_title: doc?.title || "Policy document",
        content_type: doc?.content_type || "",
        section_title: section?.title || "Section",
        section_content: section?.content || "",
        similarity: score > 0 ? Math.min(0.99, score / 10) : 0,
      };
    })
    .filter((row) => row.section_content)
    .sort((a, b) => Number(b.similarity || 0) - Number(a.similarity || 0))
    .slice(0, Math.max(1, Math.min(6, Number(limit) || 3)));

  return ranked;
};

const retrievePolicySections = async ({ queryEmbedding, queryText, limit = 3 }) => {
  if (Array.isArray(queryEmbedding) && queryEmbedding.length) {
    try {
      const rpcName = sanitizeString(getEnv("SUPABASE_AI_MATCH_RPC") || DEFAULT_MATCH_RPC, 120);
      const rows = await supabaseRestRequest(`rpc/${rpcName}`, {
        method: "POST",
        body: {
          query_embedding: toVectorLiteral(queryEmbedding),
          match_count: Math.max(1, Math.min(6, Number(limit) || 3)),
          match_content_types: POLICY_CONTENT_TYPES,
        },
      });
      const list = Array.isArray(rows) ? rows : [];
      if (list.length) return list;
    } catch (error) {
      console.warn("Policy RPC retrieval failed; falling back to keyword retrieval", {
        message: error?.message || String(error),
      });
    }
  }

  return retrievePolicySectionsByKeyword({ queryText, limit });
};

const buildRetrievedPolicyText = (rows = []) =>
  rows
    .map((row, index) =>
      [
        `[Policy Source ${index + 1}]`,
        `Document: ${sanitizeString(row?.document_title, 120)}`,
        `Section: ${sanitizeString(row?.section_title, 160)}`,
        `Content: ${sanitizeString(row?.section_content, 900)}`,
      ].join("\n"),
    )
    .join("\n\n");

const buildDeterministicPolicyReply = ({ rows = [], question = "" }) => {
  const normalizedQuestion = String(question || "").toLowerCase();
  const wantsCancellation = /\b(cancel|cancellation|refund)\b/.test(normalizedQuestion);
  const wantsCheckout = /\b(check[- ]?out|checkout|vacate)\b/.test(normalizedQuestion);
  const wantsCheckin = /\b(check[- ]?in)\b/.test(normalizedQuestion);

  const sections = Array.isArray(rows)
    ? [...rows]
        .sort((a, b) => Number(b?.similarity || 0) - Number(a?.similarity || 0))
        .filter((row) => String(row?.section_content || "").trim())
    : [];

  if (!sections.length) return "";

  const preferred = [];
  const addByMatch = (pattern) => {
    sections.forEach((row) => {
      const title = String(row?.section_title || "").toLowerCase();
      const content = String(row?.section_content || "").toLowerCase();
      if (!pattern.test(title) && !pattern.test(content)) return;
      if (preferred.includes(row)) return;
      preferred.push(row);
    });
  };

  if (wantsCancellation) addByMatch(/\bcancel|cancellation|refund\b/);
  if (wantsCheckout) addByMatch(/\bcheck[- ]?out|checkout|vacate|late checkout\b/);
  if (wantsCheckin) addByMatch(/\bcheck[- ]?in\b/);

  const selected = [...preferred, ...sections].slice(0, 3);
  const uniqueSelected = [];
  const seenTitles = new Set();
  selected.forEach((row) => {
    const key = String(row?.section_title || "").trim().toLowerCase();
    if (!key || seenTitles.has(key)) return;
    seenTitles.add(key);
    uniqueSelected.push(row);
  });

  const lines = uniqueSelected.map((row) => {
    const title = sanitizeString(row?.section_title, 120) || "Policy";
    const content = sanitizeString(row?.section_content, 380);
    return `- ${title}: ${content}`;
  });

  if (!lines.length) return "";

  return [
    "Here are the relevant terms from One Lux Stay policy documents:",
    ...lines,
    "",
    "For final confirmation on a specific booking, contact reservations@oneluxstay.com.",
  ].join("\n");
};

const resolveFunctionsBase = (event = {}) => {
  const configured = sanitizeString(getEnv("AI_QUERY_FUNCTIONS_BASE"), 500);
  if (configured) return configured.replace(/\/+$/, "");

  const envBase = sanitizeString(process.env.URL || process.env.DEPLOY_URL || "", 500);
  if (envBase) return `${envBase.replace(/\/+$/, "")}/.netlify/functions`;

  const headers = event.headers || {};
  const proto = headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "http";
  const host = headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host || "";
  if (host) return `${proto}://${host}/.netlify/functions`;

  return "http://localhost:8888/.netlify/functions";
};

const fetchListingForChat = async ({ event, listingId }) => {
  const safeListingId = sanitizeString(listingId, 120);
  if (!safeListingId) return null;

  const base = resolveFunctionsBase(event);
  const url = `${base}/listings?onlyIds=${encodeURIComponent(safeListingId)}&limit=1`;
  const response = await fetchWithTimeout(url, { method: "GET" }, 20_000);
  if (!response.ok) return null;

  let payload = {};
  try {
    payload = JSON.parse(await response.text());
  } catch {
    payload = {};
  }

  const listing = Array.isArray(payload?.results) ? payload.results[0] : null;
  return listing || null;
};

const extractNearestLandmarks = (listing = {}) => {
  const text = String(listing?.publicDescription?.neighborhood || "");
  if (!text) return [];

  return text
    .split(/\r?\n/)
    .map((line) =>
      String(line || "")
        .replace(/^[\s•\-–—]+/g, "")
        .trim(),
    )
    .filter((line) => line.length >= 5)
    .filter((line) => /\b(near|close|minutes?|mins?|access|beach|pier|airport|park|village)\b/i.test(line))
    .slice(0, 5);
};

const buildUnitInfoReply = ({ listing, question }) => {
  if (!listing) return "";

  const q = String(question || "").toLowerCase();
  const wantsSize = /\b(size|square|sqft|square feet|square meter|sqm)\b/.test(q);
  const wantsLandmarks = /\b(near|nearby|landmark|landmarks|what is near|nearest)\b/.test(q);
  const wantsAmenities = /\b(amenit(?:y|ies)|features?|what does it have|parking|wifi|pool|gym)\b/.test(q);

  const title = sanitizeString(listing?.title || listing?.nickname, 220);
  const city = sanitizeString(listing?.address?.city || "", 120);
  const propertyType = sanitizeString(listing?.propertyType || listing?.type || "", 120);
  const accommodates = Number(listing?.accommodates);
  const bedrooms = Number(listing?.bedrooms);
  const bathrooms = Number(listing?.bathrooms);
  const beds = Number(listing?.beds);
  const fullAddress = sanitizeString(listing?.address?.full || "", 240);
  const summary = sanitizeString(listing?.publicDescription?.summary || "", 260);
  const amenities = Array.isArray(listing?.amenities)
    ? listing.amenities.map((item) => sanitizeString(item, 80)).filter(Boolean).slice(0, 12)
    : [];
  const landmarks = extractNearestLandmarks(listing);

  const baseOverview = [
    title && `Unit: ${title}`,
    city && `City: ${city}`,
    propertyType && `Type: ${propertyType}`,
    Number.isFinite(accommodates) && accommodates > 0 && `Guest capacity: ${accommodates}`,
    Number.isFinite(bedrooms) && bedrooms > 0 && `Bedrooms: ${bedrooms}`,
    Number.isFinite(bathrooms) && bathrooms > 0 && `Bathrooms: ${bathrooms}`,
    Number.isFinite(beds) && beds > 0 && `Beds: ${beds}`,
  ].filter(Boolean);

  const lines = [];
  if (baseOverview.length) lines.push(baseOverview.join(" | "));

  if (wantsSize) {
    lines.push(
      "I don’t currently have exact square footage in the listing metadata. Based on the listing details above, this is the verified unit layout and capacity.",
    );
  }

  if (wantsLandmarks) {
    if (landmarks.length) {
      lines.push("Nearest landmarks / nearby area:");
      landmarks.forEach((line) => lines.push(`- ${line}`));
    } else if (fullAddress) {
      lines.push(`The listing address area is: ${fullAddress}.`);
    } else {
      lines.push("I don’t have explicit nearby landmark text for this unit right now.");
    }
  }

  if (wantsAmenities) {
    if (amenities.length) {
      lines.push(`Amenities listed: ${amenities.join(", ")}.`);
    } else {
      lines.push("I don’t have a complete amenities list for this unit in the current payload.");
    }
  }

  if (!wantsSize && !wantsLandmarks && !wantsAmenities) {
    if (summary) lines.push(summary);
    if (landmarks.length) {
      lines.push("Nearby highlights:");
      landmarks.slice(0, 3).forEach((line) => lines.push(`- ${line}`));
    }
  }

  lines.push("If you want, I can also check availability for your dates and guide you directly to checkout.");
  return lines.join("\n");
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
  const embeddingModel = getEnv("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";
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
    let retrievedPolicyText = "";
    const latestPrompt = String(latestUserMessage?.content || "");
    const asksPolicy = isPolicyQuestion(latestPrompt);
    const asksUnitInfo = isUnitInfoQuestion(latestPrompt);
    let policyRows = [];

    if (asksPolicy) {
      let queryEmbedding = null;
      try {
        queryEmbedding = await createEmbedding({
          apiKey,
          model: embeddingModel,
          text: latestPrompt,
        });
      } catch (embeddingError) {
        console.warn("Policy embedding generation failed; using keyword retrieval only", {
          message: embeddingError?.message || String(embeddingError),
        });
      }

      try {
        policyRows = await retrievePolicySections({
          queryEmbedding,
          queryText: latestPrompt,
          limit: 3,
        });
        retrievedPolicyText = buildRetrievedPolicyText(policyRows);
      } catch (policyError) {
        console.warn("Policy retrieval failed for chat path", {
          message: policyError?.message || String(policyError),
        });
      }

      const deterministicPolicyReply = buildDeterministicPolicyReply({
        rows: policyRows,
        question: latestPrompt,
      });
      if (deterministicPolicyReply) {
        return jsonResponse(
          200,
          {
            reply: deterministicPolicyReply,
            model,
          },
          event,
        );
      }
    }

    if (asksUnitInfo && pageContext?.listingId) {
      try {
        const listing = await fetchListingForChat({
          event,
          listingId: pageContext.listingId,
        });
        const unitReply = buildUnitInfoReply({
          listing,
          question: latestPrompt,
        });
        if (unitReply) {
          return jsonResponse(
            200,
            {
              reply: unitReply,
              model,
            },
            event,
          );
        }
      } catch (listingError) {
        console.warn("Listing info retrieval failed for chat", {
          message: listingError?.message || String(listingError),
        });
      }
    }

    const response = await fetchWithTimeout(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions: siteContext,
        input: buildInput({ pageContext, messages, knowledgeText, retrievedPolicyText }),
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        max_output_tokens: 900,
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
