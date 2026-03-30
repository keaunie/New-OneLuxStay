import { fetchWithTimeout, getBaseUrl, jsonResponse } from "./_shared/http.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";
import { buildAiCorsHeaders, verifyAiRequest } from "./_shared/aiProtection.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const MAX_HISTORY_MESSAGES = 10;
const MAX_QUERY_LENGTH = 1200;
const DEFAULT_MATCH_RPC = "match_document_sections";

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);
const parseBoolean = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

const sanitizeString = (value, maxLength = 3000) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const sanitizeMessages = (value) =>
  Array.isArray(value)
    ? value
        .filter((item) => item && typeof item.content === "string")
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: sanitizeString(item.content, 1200),
        }))
        .filter((item) => item.content)
        .slice(-MAX_HISTORY_MESSAGES)
    : [];

const sanitizePageContext = (value) => ({
  pathname: sanitizeString(value?.pathname, 240),
  pageType: sanitizeString(value?.pageType, 80),
  city: sanitizeString(value?.city, 120),
  listingId: sanitizeString(value?.listingId, 120),
  title: sanitizeString(value?.title, 180),
});

const sanitizeGuest = (value) => ({
  email: sanitizeString(value?.email, 240),
  firstName: sanitizeString(value?.firstName, 120),
  lastName: sanitizeString(value?.lastName, 120),
  phone: sanitizeString(value?.phone, 80),
});

const sanitizeBookingContext = (value, fallbackListingId = "") => ({
  listingId: sanitizeString(value?.listingId || fallbackListingId, 120),
  listingTitle: sanitizeString(value?.listingTitle, 220),
  checkIn: sanitizeString(value?.checkIn, 40),
  checkOut: sanitizeString(value?.checkOut, 40),
  guests: Math.max(1, Math.round(Number(value?.guests || 1) || 1)),
  requestCheckout: Boolean(value?.requestCheckout),
  guest: sanitizeGuest(value?.guest || {}),
});

const toVectorLiteral = (values = []) => `[${values.map((value) => Number(value) || 0).join(",")}]`;

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

const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};

const respond = (event, statusCode, body, extraHeaders = {}) =>
  jsonResponse(statusCode, body, {
    ...buildAiCorsHeaders(event),
    ...extraHeaders,
  });

const createEmbedding = async (text, { apiKey, model }) => {
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
        input: text,
      }),
    },
    20_000,
  );

  const raw = await response.text();
  const payload = parseJson(raw);
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

const retrieveSections = async ({ queryEmbedding, limit = 6, contentTypes = [] }) => {
  const rpcName = sanitizeString(getEnv("SUPABASE_AI_MATCH_RPC") || DEFAULT_MATCH_RPC, 120);
  const rows = await supabaseRestRequest(`rpc/${rpcName}`, {
    method: "POST",
    body: {
      query_embedding: toVectorLiteral(queryEmbedding),
      match_count: Math.max(1, Math.min(12, Number(limit) || 6)),
      match_content_types: Array.isArray(contentTypes)
        ? contentTypes.map((item) => String(item || "").trim()).filter(Boolean)
        : [],
    },
  });

  return Array.isArray(rows) ? rows : [];
};

const resolveFunctionsBase = (event) => {
  const configured = sanitizeString(getEnv("AI_QUERY_FUNCTIONS_BASE"), 500);
  if (configured) return configured.replace(/\/+$/, "");

  const envBase = sanitizeString(process.env.URL || process.env.DEPLOY_URL || "", 500);
  if (envBase) return `${envBase.replace(/\/+$/, "")}/.netlify/functions`;

  return `${getBaseUrl(event).replace(/\/+$/, "")}/.netlify/functions`;
};

const fetchListingSummary = async ({ event, listingId }) => {
  const safeId = sanitizeString(listingId, 120);
  if (!safeId) return null;

  const base = resolveFunctionsBase(event);
  const url = `${base}/listings?onlyIds=${encodeURIComponent(safeId)}&limit=1`;
  const response = await fetchWithTimeout(url, { method: "GET" }, 15_000);
  if (!response.ok) return null;

  const payload = parseJson(await response.text());
  const listing = Array.isArray(payload?.results) ? payload.results[0] : null;
  if (!listing) return null;

  const title = sanitizeString(listing.title || listing.nickname, 220);
  const city = sanitizeString(listing.city || listing?.address?.city, 120);
  const summaryParts = [
    title && `Title: ${title}`,
    city && `City: ${city}`,
    Number.isFinite(Number(listing.accommodates)) && `Guests: ${Number(listing.accommodates)}`,
    Number.isFinite(Number(listing.bedrooms)) && `Bedrooms: ${Number(listing.bedrooms)}`,
    Number.isFinite(Number(listing.bathrooms)) && `Bathrooms: ${Number(listing.bathrooms)}`,
    Number.isFinite(Number(listing.beds)) && `Beds: ${Number(listing.beds)}`,
    Array.isArray(listing?.bedDetails) && listing.bedDetails.length
      ? `Bed details: ${listing.bedDetails.slice(0, 8).join(", ")}`
      : "",
    Array.isArray(listing?.amenities) && listing.amenities.length
      ? `Amenities: ${listing.amenities.slice(0, 12).join(", ")}`
      : "",
  ].filter(Boolean);

  return {
    listingId: safeId,
    title,
    city,
    raw: listing,
    summaryText: summaryParts.join("\n"),
  };
};

const fetchAvailability = async ({ event, bookingContext }) => {
  if (!bookingContext?.listingId || !bookingContext?.checkIn || !bookingContext?.checkOut) return null;

  const base = resolveFunctionsBase(event);
  const url = new URL(`${base}/api-availability`);
  url.searchParams.set("property_id", bookingContext.listingId);
  url.searchParams.set("check_in", bookingContext.checkIn);
  url.searchParams.set("check_out", bookingContext.checkOut);
  url.searchParams.set("guests", String(bookingContext.guests || 1));

  const response = await fetchWithTimeout(url.toString(), { method: "GET" }, 20_000);
  const payload = parseJson(await response.text());
  if (!response.ok) {
    return { error: payload?.message || "Availability request failed" };
  }

  return payload;
};

const createCheckoutLink = async ({ event, bookingContext, listingTitle }) => {
  if (!bookingContext?.requestCheckout) return null;
  if (!bookingContext?.listingId || !bookingContext?.checkIn || !bookingContext?.checkOut) {
    return { error: "Missing listing ID or date range for checkout." };
  }
  if (!bookingContext?.guest?.email) {
    return { error: "Guest email is required before creating a checkout link." };
  }

  const base = resolveFunctionsBase(event);
  const response = await fetchWithTimeout(
    `${base}/api-checkout`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        listingId: bookingContext.listingId,
        checkIn: bookingContext.checkIn,
        checkOut: bookingContext.checkOut,
        guests: bookingContext.guests,
        listingTitle: bookingContext.listingTitle || listingTitle || "One Lux Stay stay",
        guest: bookingContext.guest,
      }),
    },
    25_000,
  );

  const payload = parseJson(await response.text());
  if (!response.ok) {
    return { error: payload?.message || "Checkout creation failed", details: payload };
  }

  return payload;
};

const buildKnowledgeBlock = (sections = []) =>
  sections
    .map((row, index) => {
      const score = Number(row?.similarity || 0);
      return [
        `[Source ${index + 1}]`,
        `Document: ${sanitizeString(row?.document_title, 160)}`,
        `Section: ${sanitizeString(row?.section_title, 200)}`,
        `Similarity: ${score.toFixed(4)}`,
        `Content: ${sanitizeString(row?.section_content, 900)}`,
      ].join("\n");
    })
    .join("\n\n");

const formatHistory = (messages = []) =>
  messages.map((msg) => `${msg.role === "assistant" ? "Assistant" : "User"}: ${msg.content}`).join("\n");

const buildAgentInput = ({
  query,
  messages,
  pageContext,
  bookingContext,
  sections,
  listingSummary,
  availability,
  checkout,
}) => {
  const availabilityBlock = availability
    ? JSON.stringify(availability, null, 2)
    : "Not requested or insufficient details.";
  const checkoutBlock = checkout ? JSON.stringify(checkout, null, 2) : "Not requested.";

  return [
    "User question:",
    query,
    "",
    "Page context:",
    `- Pathname: ${pageContext.pathname || "/"}`,
    `- Page type: ${pageContext.pageType || "unknown"}`,
    `- City: ${pageContext.city || "unknown"}`,
    `- Listing ID: ${pageContext.listingId || "unknown"}`,
    `- Page title: ${pageContext.title || "unknown"}`,
    "",
    "Booking context:",
    `- Listing ID: ${bookingContext.listingId || "unknown"}`,
    `- Check-in: ${bookingContext.checkIn || "unknown"}`,
    `- Check-out: ${bookingContext.checkOut || "unknown"}`,
    `- Guests: ${bookingContext.guests || 1}`,
    `- Guest email: ${bookingContext.guest?.email || "unknown"}`,
    "",
    "Conversation history:",
    formatHistory(messages) || "No prior messages.",
    "",
    "Retrieved policy/company knowledge:",
    buildKnowledgeBlock(sections) || "No matched document sections.",
    "",
    "Listing summary:",
    listingSummary?.summaryText || "No listing details available.",
    "",
    "Availability API result:",
    availabilityBlock,
    "",
    "Checkout API result:",
    checkoutBlock,
  ].join("\n");
};

const buildInstructions = () => `
You are the One Lux Stay AI Concierge assistant.

Rules:
- Use only the provided context and retrieved knowledge sections.
- If information is not in the provided context, say you are not certain and suggest contacting One Lux Stay.
- Be concise, clear, and booking-oriented.
- If availability payload is present, explain it in plain language.
- If checkout_url exists in checkout payload, include it clearly as the direct next step.
- Never ask users for card numbers, card CVV, or passport details in chat.
- If user asks legal/policy questions, prioritize quoted meaning from matched policy sections.
- If user asks about current page, explain using page context fields.
`.trim();

const buildLocalFallbackAnswer = ({ query, sections, availability, checkout }) => {
  const top = Array.isArray(sections) ? sections[0] : null;
  const sectionSummary =
    top && top.section_content
      ? `${sanitizeString(top.document_title, 120)} - ${sanitizeString(top.section_title, 160)}: ${sanitizeString(top.section_content, 420)}`
      : "";

  const availabilitySummary =
    availability && typeof availability === "object"
      ? availability.available === true
        ? `Availability check: available. Estimated total ${availability.grand_total ?? "N/A"} ${availability.currency || ""}.`
        : availability.available === false
          ? "Availability check: not available for the selected dates."
          : ""
      : "";

  const checkoutUrl = sanitizeString(checkout?.checkout_url || checkout?.url, 900);
  const checkoutSummary = checkoutUrl ? `Checkout link: ${checkoutUrl}` : "";

  const parts = [
    "I could not generate the full AI reply right now, but here is what I found:",
    sectionSummary,
    availabilitySummary,
    checkoutSummary,
    `Question received: ${sanitizeString(query, 280)}`,
  ].filter(Boolean);

  return parts.join("\n\n");
};

const createAssistantReply = async ({ apiKey, model, input, instructions }) => {
  const response = await fetchWithTimeout(
    OPENAI_RESPONSES_URL,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        max_output_tokens: 900,
      }),
    },
    30_000,
  );

  const raw = await response.text();
  const payload = parseJson(raw);
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI request failed (${response.status})`;
    throw new Error(message);
  }

  const text = extractOutputText(payload);
  return text;
};

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return respond(event, 200, { ok: true });
  }

  if (event.httpMethod !== "POST") {
    return respond(event, 405, { error: "Method not allowed" });
  }

  const aiQueryEnabled = parseBoolean(getEnv("AI_QUERY_ENABLED"), process.env.NODE_ENV !== "production");
  if (!aiQueryEnabled) {
    return respond(event, 404, { error: "Not found" });
  }

  const protection = verifyAiRequest(event, { endpoint: "ai-query" });
  if (!protection.ok) {
    return respond(
      event,
      protection.status || 403,
      { error: protection.error || "Request blocked" },
      protection.retryAfter ? { "Retry-After": String(protection.retryAfter) } : {},
    );
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return respond(event, 400, { error: "Invalid JSON body" });
  }

  const query = sanitizeString(payload?.query, MAX_QUERY_LENGTH);
  if (!query) {
    return respond(event, 400, { error: "Query is required" });
  }

  const pageContext = sanitizePageContext(payload?.pageContext || {});
  const messages = sanitizeMessages(payload?.messages);
  const bookingContext = sanitizeBookingContext(payload?.bookingContext || {}, pageContext.listingId);
  const contentTypes = Array.isArray(payload?.contentTypes) ? payload.contentTypes : [];

  const apiKey = sanitizeString(getEnv("OPENAI_API_KEY"), 500);
  if (!apiKey) {
    return respond(event, 500, { error: "OPENAI_API_KEY is missing" });
  }

  const embeddingModel = sanitizeString(getEnv("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small", 120);
  const replyModel = sanitizeString(getEnv("OPENAI_AI_QUERY_MODEL") || "gpt-5-mini", 120);

  try {
    const queryEmbedding = await createEmbedding(query, {
      apiKey,
      model: embeddingModel,
    });

    const sections = await retrieveSections({
      queryEmbedding,
      limit: Number(payload?.limit || 4),
      contentTypes,
    });

    const listingSummary = await fetchListingSummary({
      event,
      listingId: bookingContext.listingId || pageContext.listingId,
    });

    const shouldCheckAvailability =
      Boolean(payload?.checkAvailability) ||
      /\b(availability|available|book|booking|reserve|reservation)\b/i.test(query);

    const availability = shouldCheckAvailability
      ? await fetchAvailability({ event, bookingContext })
      : null;

    const checkout = await createCheckoutLink({
      event,
      bookingContext,
      listingTitle: listingSummary?.title || bookingContext.listingTitle,
    });

    const modelAnswer = await createAssistantReply({
      apiKey,
      model: replyModel,
      instructions: buildInstructions(),
      input: buildAgentInput({
        query,
        messages,
        pageContext,
        bookingContext,
        sections,
        listingSummary,
        availability,
        checkout,
      }),
    });

    const answer =
      sanitizeString(modelAnswer, 5000) ||
      buildLocalFallbackAnswer({
        query,
        sections,
        availability,
        checkout,
      });

    return respond(event, 200, {
      answer,
      model: replyModel,
      sources: sections.map((row) => ({
        document_title: row.document_title,
        section_title: row.section_title,
        similarity: row.similarity,
      })),
      listing: listingSummary
        ? {
            id: listingSummary.listingId,
            title: listingSummary.title,
            city: listingSummary.city,
          }
        : null,
      availability: availability || null,
      checkout: checkout || null,
    });
  } catch (error) {
    return respond(event, 500, {
      error: error?.message || "AI query failed",
    });
  }
}
