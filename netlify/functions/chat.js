import dotenv from "dotenv";
import defaultConciergeKnowledge from "../../src/data/conciergeKnowledge.js";
import { getConciergeKnowledgeFromSupabase } from "./_shared/supabaseContentService.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";
import { buildAiCorsHeaders, verifyAiRequest } from "./_shared/aiProtection.js";

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
You are the AI Concierge for One Lux Stay, a modern aparthotel hospitality brand.

Supported city pages on this website include ${supportedCities.join(", ") || "Antwerp, Los Angeles, Miami, Redondo Beach, Dubai"}, plus a global listings view.

Main goals:
1) Help guests book their stay.
2) Provide clear and accurate information.
3) Deliver a smooth, friendly guest experience.

Tone and style:
- Friendly, professional, modern hospitality voice.
- Never robotic.
- Keep responses concise, usually 2-4 sentences unless a short list is clearly needed.
- Keep continuity with prior turns; if the user sends a short follow-up (for example "yes please"), continue the current task using earlier context.

Booking assistance rules:
- If a guest asks about availability, price, or rooms for a stay, ask for check-in and check-out dates plus guest count.
- After dates are provided, guide them toward the official secure booking flow/page.
- Always encourage the next booking step when intent is present.

FAQ support:
- You can answer common questions about check-in/check-out, amenities, WiFi, parking, house rules, location, directions, and general property details.
- If you cannot verify details, say so clearly and offer help from support.

Security rules:
- Never ask for or accept credit card numbers, CVV, expiration dates, passwords, or other sensitive information.
- If payment info is shared, instruct the guest to use the secure booking page and avoid sharing sensitive details in chat.

Accuracy and escalation:
- Do not guess.
- Use only provided context and retrieved knowledge.
- If uncertain or outside scope, offer to connect the guest with support.
`;

const getConciergeKnowledge = async () => {
  const value = await getConciergeKnowledgeFromSupabase(defaultConciergeKnowledge);
  return normalizeConciergeKnowledge(value);
};

const getCorsHeaders = (event = {}) => buildAiCorsHeaders(event);

const jsonResponse = (statusCode, body, event, extraHeaders = {}) => ({
  statusCode,
  headers: {
    ...getCorsHeaders(event),
    ...extraHeaders,
  },
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
  /\b(unit|listing|property|apartment|villa|suite|room|rooms|bedroom|bathroom|bath|beds?|size|square|sqft|amenit(?:y|ies)|feature|features|parking|pool|wifi|wi-fi|internet|gym|fitness|kitchen|laundry|washer|dryer|washing machine|hot tub|jacuzzi|pet|pets|near|nearby|landmark|landmarks|neighborhood|neighbourhood|location|house rules?|quiet hours?|quiet time|noise|smoking|parties?|minimum age|children|infants)\b/i.test(
    String(text || ""),
  );

const isAvailabilityQuestion = (text = "", hasDateRange = false) => {
  const source = String(text || "");
  if (/\b(availability|available|vacan(?:cy|cies)|open units?|which units? are open)\b/i.test(source)) {
    return true;
  }
  if (/\b(rent|rental|lease|long stay|monthly stay)\b/i.test(source)) {
    return true;
  }
  if (/\b(check[- ]?in|check[- ]?out|dates?)\b/i.test(source)) {
    return true;
  }
  if (hasDateRange && /\b(book|booking|reserve|reservation|stay)\b/i.test(source)) {
    return true;
  }
  return false;
};

const isCheckInOutTimeQuestion = (text = "") => {
  const source = String(text || "");
  const mentionsCheckInOut = /\b(check[- ]?in|check[- ]?out|arrival|departure)\b/i.test(source);
  if (!mentionsCheckInOut) return false;
  const mentionsTimeIntent =
    /\b(what time|time|when)\b/i.test(source) ||
    /\b(check[- ]?in time|check[- ]?out time)\b/i.test(source);
  return mentionsTimeIntent;
};

const isBookingLeadQuestion = (text = "") => {
  const source = String(text || "");
  const asksPrice = /\b(price|pricing|rate|rates|cost|how much)\b/i.test(source);
  const mentionsRooms = /\b(room|rooms|unit|units)\b/i.test(source);
  const asksBookingHowTo =
    /\b(how (do|can) i (book|reserve|rent)|how to (book|reserve|rent)|booking process|checkout process|can i rent)\b/i.test(
      source,
    );
  const hasBookingContext =
    /\b(available|availability|vacan(?:cy|cies)|open|book|booking|reserve|reservation|stay|rent|rental|lease|weekend|tonight|check[- ]?in|check[- ]?out|dates?)\b/i.test(
      source,
    );
  return asksPrice || asksBookingHowTo || (mentionsRooms && hasBookingContext);
};

const isAffirmativeFollowup = (text = "") =>
  /^(yes|yes please|yep|yeah|sure|of course|please do|go ahead|ok|okay|sounds good|that works)[.!?\s]*$/i.test(
    String(text || "").trim(),
  );

const hasSensitivePaymentData = (text = "") => {
  const source = String(text || "");
  return /\b(credit card|card number|cvv|cvc|expiration|expiry|exp date|password|passcode)\b/i.test(source);
};

const isBookingStatusQuestion = (text = "") => {
  const source = String(text || "");
  const hasBookingContext = /\b(booking|reservation|confirmation)\b/i.test(source);
  if (!hasBookingContext) return false;

  if (/\b(my booking|my reservation|reservation status|booking status)\b/i.test(source)) {
    return true;
  }

  const hasStatusIntent = /\b(status|confirmed|track|lookup|find|where is|check my)\b/i.test(source);
  const hasCodeReference = /\b(code|id|number|res\.?)\b/i.test(source);
  return hasStatusIntent || hasCodeReference;
};

const hasExistingBookingContext = (text = "") =>
  /\b(already booked|already have (a )?(booking|reservation)|our booking|my booking|my reservation|reservation|confirmation|confirmed booking|booking code|reservation code)\b/i.test(
    String(text || ""),
  );

const parseGuestsFromText = (text = "") => {
  const source = String(text || "").toLowerCase();
  const match = source.match(/\b(\d{1,2})\s*(guest|guests|adult|adults|people|pax|person)\b/);
  if (!match) return null;
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.min(16, parsed);
};

const toIsoDate = (year, month, day) => {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return "";
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${String(y).padStart(4, "0")}-${mm}-${dd}`;
};

const monthToNumber = (value = "") => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  const monthMap = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  return monthMap[normalized] || 0;
};

const MONTH_NAME_PATTERN =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";

const toIsoFromLocalDate = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return toIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
};

const addDays = (date, days) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + Number(days || 0));
  return next;
};

const inferYearForMonthDay = ({ month, day, explicitYear = "", now = new Date() }) => {
  const parsedYear = Number(explicitYear);
  if (Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100) {
    return parsedYear;
  }

  const currentYear = now.getFullYear();
  const candidateThisYear = toIsoDate(currentYear, month, day);
  const todayIso = toIsoFromLocalDate(now);
  if (candidateThisYear && todayIso && candidateThisYear >= todayIso) {
    return currentYear;
  }

  return currentYear + 1;
};

const isValidIsoDate = (value = "") => {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === text;
};

const extractDatesFromText = (text = "") => {
  const source = String(text || "");
  const matches = [];
  const seen = new Set();
  const now = new Date();

  const push = (value, index = 0, priority = 0) => {
    if (!isValidIsoDate(value)) return;
    matches.push({ value, index: Number(index) || 0, priority });
  };

  const pushUnique = (value) => {
    if (seen.has(value)) return;
    seen.add(value);
    ordered.push(value);
  };

  const ordered = [];

  const isoRegex = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  let isoMatch;
  while ((isoMatch = isoRegex.exec(source)) !== null) {
    push(toIsoDate(isoMatch[1], isoMatch[2], isoMatch[3]), isoMatch.index, 1);
  }

  const slashRegex = /\b(0?[1-9]|1[0-2])[/-](0?[1-9]|[12]\d|3[01])[/-](20\d{2})\b/g;
  let slashMatch;
  while ((slashMatch = slashRegex.exec(source)) !== null) {
    push(toIsoDate(slashMatch[3], slashMatch[1], slashMatch[2]), slashMatch.index, 1);
  }

  const relativeRegex = /\b(day after tomorrow|tomorrow|today)\b/gi;
  let relativeMatch;
  while ((relativeMatch = relativeRegex.exec(source)) !== null) {
    const token = String(relativeMatch[1] || "").toLowerCase();
    const offset = token === "day after tomorrow" ? 2 : token === "tomorrow" ? 1 : 0;
    const value = toIsoFromLocalDate(addDays(now, offset));
    push(value, relativeMatch.index, 2);
  }

  const monthDayRegex = new RegExp(`\\b${MONTH_NAME_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\b`, "gi");
  let monthDayMatch;
  while ((monthDayMatch = monthDayRegex.exec(source)) !== null) {
    const month = monthToNumber(monthDayMatch[1]);
    const day = Number(monthDayMatch[2]);
    const year = inferYearForMonthDay({
      month,
      day,
      explicitYear: monthDayMatch[3] || "",
      now,
    });
    push(toIsoDate(year, month, day), monthDayMatch.index, 3);
  }

  const dayMonthRegex = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_NAME_PATTERN}\\.?\\s*(?:,?\\s*(20\\d{2}))?\\b`, "gi");
  let dayMonthMatch;
  while ((dayMonthMatch = dayMonthRegex.exec(source)) !== null) {
    const day = Number(dayMonthMatch[1]);
    const month = monthToNumber(dayMonthMatch[2]);
    const year = inferYearForMonthDay({
      month,
      day,
      explicitYear: dayMonthMatch[3] || "",
      now,
    });
    push(toIsoDate(year, month, day), dayMonthMatch.index, 3);
  }

  matches
    .sort((a, b) => {
      if (a.index !== b.index) return a.index - b.index;
      return a.priority - b.priority;
    })
    .forEach((item) => pushUnique(item.value));

  return ordered;
};

const extractDateRange = ({ prompt = "", search = "" }) => {
  const fromPrompt = extractDatesFromText(prompt);
  if (fromPrompt.length >= 2) {
    const checkIn = fromPrompt[0];
    const checkOut = fromPrompt[1];
    if (checkIn < checkOut) return { checkIn, checkOut };
  }

  try {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    const checkIn = sanitizeString(
      params.get("checkIn") || params.get("check_in") || params.get("startDate") || "",
      20,
    );
    const checkOut = sanitizeString(
      params.get("checkOut") || params.get("check_out") || params.get("endDate") || "",
      20,
    );
    if (isValidIsoDate(checkIn) && isValidIsoDate(checkOut) && checkIn < checkOut) {
      return { checkIn, checkOut };
    }
  } catch {
    // ignore malformed search strings
  }

  return null;
};

const inferYearForMonthOnly = ({ month, explicitYear = "", now = new Date() }) => {
  const parsedYear = Number(explicitYear);
  if (Number.isFinite(parsedYear) && parsedYear >= 2000 && parsedYear <= 2100) {
    return parsedYear;
  }

  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  return month >= currentMonth ? currentYear : currentYear + 1;
};

const buildMonthRange = ({ year, month }) => {
  const numericYear = Number(year);
  const numericMonth = Number(month);
  if (!Number.isFinite(numericYear) || !Number.isFinite(numericMonth)) return null;
  if (numericMonth < 1 || numericMonth > 12) return null;

  const firstDate = new Date(Date.UTC(numericYear, numericMonth - 1, 1));
  const lastDate = new Date(Date.UTC(numericYear, numericMonth, 0));
  const firstDay = toIsoDate(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + 1, firstDate.getUTCDate());
  const lastDay = toIsoDate(lastDate.getUTCFullYear(), lastDate.getUTCMonth() + 1, lastDate.getUTCDate());
  if (!isValidIsoDate(firstDay) || !isValidIsoDate(lastDay)) return null;

  const label = new Date(Date.UTC(numericYear, numericMonth - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  return {
    year: numericYear,
    month: numericMonth,
    startDate: firstDay,
    endDate: lastDay,
    label,
  };
};

const extractMonthRange = ({ prompt = "", search = "" }) => {
  const source = String(prompt || "");
  const normalizedSource = source.toLowerCase();
  const now = new Date();

  const fromPromptParams = (month, year) => {
    const range = buildMonthRange({ month, year });
    if (range) return range;
    return null;
  };

  if (/\bthis month\b/i.test(normalizedSource)) {
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return fromPromptParams(month, year);
  }

  if (/\bnext month\b/i.test(normalizedSource)) {
    const base = new Date(now.getTime());
    base.setMonth(base.getMonth() + 1);
    const month = base.getMonth() + 1;
    const year = base.getFullYear();
    return fromPromptParams(month, year);
  }

  const hasMonthIntent = /\b(availability|available|dates?|month|within|during|throughout|all of)\b/i.test(
    normalizedSource,
  );

  if (hasMonthIntent) {
    const monthOnlyRegex = new RegExp(`\\b${MONTH_NAME_PATTERN}\\b(?:\\s+(20\\d{2}))?`, "gi");
    let monthMatch;
    while ((monthMatch = monthOnlyRegex.exec(source)) !== null) {
      const trailingText = source.slice(monthMatch.index + monthMatch[0].length, monthMatch.index + monthMatch[0].length + 12);
      // Ignore explicit day mentions right after the month token (e.g. "April 7").
      if (/^\s+\d{1,2}(?:st|nd|rd|th)?\b/i.test(trailingText)) continue;
      const month = monthToNumber(monthMatch[1]);
      if (!month) continue;
      const year = inferYearForMonthOnly({
        month,
        explicitYear: monthMatch[2] || "",
        now,
      });
      const range = fromPromptParams(month, year);
      if (range) return range;
    }
  }

  try {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    const explicitMonth = monthToNumber(params.get("month") || params.get("monthName") || "");
    const explicitYear = Number(params.get("year") || params.get("monthYear"));
    if (explicitMonth) {
      const year = Number.isFinite(explicitYear) ? explicitYear : inferYearForMonthOnly({
        month: explicitMonth,
        explicitYear: "",
        now,
      });
      const range = fromPromptParams(explicitMonth, year);
      if (range) return range;
    }
  } catch {
    // ignore malformed search strings
  }

  return null;
};

const toUtcDateFromIso = (isoDate = "") => {
  const safe = sanitizeString(isoDate, 20);
  if (!isValidIsoDate(safe)) return null;
  return new Date(`${safe}T00:00:00.000Z`);
};

const addIsoDays = (isoDate = "", days = 0) => {
  const base = toUtcDateFromIso(isoDate);
  if (!base) return "";
  base.setUTCDate(base.getUTCDate() + Number(days || 0));
  return toIsoDate(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
};

const formatMonthDayLabel = (isoDate = "") => {
  const date = toUtcDateFromIso(isoDate);
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const collapseIsoDatesToRanges = (isoDates = []) => {
  const ordered = [...new Set((Array.isArray(isoDates) ? isoDates : []).filter((value) => isValidIsoDate(value)))].sort();
  if (!ordered.length) return [];

  const ranges = [];
  let rangeStart = ordered[0];
  let previous = ordered[0];

  for (let index = 1; index < ordered.length; index += 1) {
    const current = ordered[index];
    const previousDate = toUtcDateFromIso(previous);
    const currentDate = toUtcDateFromIso(current);
    if (!previousDate || !currentDate) continue;
    const dayDiff = Math.round((currentDate.getTime() - previousDate.getTime()) / (24 * 60 * 60 * 1000));
    if (dayDiff === 1) {
      previous = current;
      continue;
    }
    ranges.push({ start: rangeStart, end: previous });
    rangeStart = current;
    previous = current;
  }

  ranges.push({ start: rangeStart, end: previous });
  return ranges;
};

const formatAvailabilityDateRanges = (isoDates = [], limit = 8) => {
  const ranges = collapseIsoDatesToRanges(isoDates);
  if (!ranges.length) return "";

  const maxItems = Math.max(1, Math.min(20, Number(limit) || 8));
  const formatted = ranges.slice(0, maxItems).map((range) => {
    const start = formatMonthDayLabel(range.start);
    const end = formatMonthDayLabel(range.end);
    if (!start) return "";
    if (!end || range.start === range.end) return start;
    return `${start} - ${end}`;
  }).filter(Boolean);

  const remaining = ranges.length - formatted.length;
  if (remaining > 0) {
    formatted.push(`+${remaining} more range${remaining > 1 ? "s" : ""}`);
  }
  return formatted.join(", ");
};

const normalizeReservationToken = (value = "") =>
  String(value || "")
    .trim()
    .replace(/^res(?:ervation)?[.\-:\s]*/i, "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

const looksLikeReservationCode = (value = "") => {
  const raw = String(value || "")
    .trim()
    .replace(/^res(?:ervation)?[.\-:\s]*/i, "");
  if (!raw || raw.length < 5 || raw.length > 50) return false;
  if (!/[A-Za-z]/.test(raw)) return false;
  const hasDigit = /\d/.test(raw);
  const hasSeparator = /[._-]/.test(raw);
  if (!hasDigit && !hasSeparator) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  return /^[A-Za-z0-9._-]+$/.test(raw);
};

const sanitizeReservationCode = (value = "") =>
  String(value || "")
    .trim()
    .replace(/^res(?:ervation)?[.\-:\s]*/i, "")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .slice(0, 64);

const extractStrictReservationCode = (text = "") => {
  const source = String(text || "");
  const patterns = [
    /\bres\.?\s*([A-Za-z0-9._-]{5,64})\b/i,
    /\b(?:reservation|booking|confirmation)\s*(?:id|code|number)?\s*[:#]?\s*([A-Za-z0-9._-]{5,64})\b/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const candidate = sanitizeReservationCode(match?.[1] || "");
    if (looksLikeReservationCode(candidate)) return candidate;
  }

  return "";
};

const extractReservationCodeFromPrompt = (prompt = "") => {
  const source = String(prompt || "");
  const patterns = [
    /\bres\.?\s*([A-Za-z0-9._-]{5,64})\b/i,
    /\b(?:reservation|booking|confirmation)\s*(?:id|code|number)?\s*[:#]?\s*([A-Za-z0-9._-]{5,64})\b/i,
    /\bcode\s*[:#]?\s*([A-Za-z0-9._-]{5,64})\b/i,
  ];

  for (const pattern of patterns) {
    const match = source.match(pattern);
    const candidate = sanitizeReservationCode(match?.[1] || "");
    if (looksLikeReservationCode(candidate)) return candidate;
  }

  const tokens = source.match(/\b[A-Za-z0-9._-]{6,64}\b/g) || [];
  for (const token of tokens) {
    const candidate = sanitizeReservationCode(token);
    if (looksLikeReservationCode(candidate)) return candidate;
  }

  return "";
};

const extractReservationCode = ({ prompt = "", search = "" }) => {
  const fromPrompt = extractReservationCodeFromPrompt(prompt);
  if (fromPrompt) return fromPrompt;

  try {
    const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
    const candidates = [
      params.get("reservationId"),
      params.get("reservation_id"),
      params.get("bookingId"),
      params.get("booking_id"),
      params.get("confirmationCode"),
      params.get("confirmation"),
      params.get("code"),
      params.get("res"),
    ];
    for (const value of candidates) {
      const candidate = sanitizeReservationCode(value || "");
      if (looksLikeReservationCode(candidate)) return candidate;
    }
  } catch {
    // ignore malformed query string
  }

  return "";
};

const extractGuests = (text = "", fallback = 1) => {
  const parsed = parseGuestsFromText(text);
  if (parsed !== null) return parsed;
  const fallbackValue = Number(fallback);
  return Number.isFinite(fallbackValue) && fallbackValue > 0 ? Math.min(16, fallbackValue) : 1;
};

const slugifyCity = (value = "") => {
  const city = String(value || "").trim().toLowerCase();
  if (!city) return "";
  if (city.includes("los angeles")) return "los-angeles";
  if (city.includes("redondo")) return "redondo-beach";
  if (city.includes("miami")) return "miami";
  if (city.includes("antwerp") || city.includes("antwerpen")) return "antwerp";
  if (city.includes("dubai")) return "dubai";
  return city
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
};

const extractCityHintFromPrompt = (prompt = "", supportedCities = []) => {
  const source = String(prompt || "");
  if (!source) return "";

  const getLastMatchIndex = (text, pattern) => {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const globalPattern = new RegExp(pattern.source, flags);
    let latestIndex = -1;
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      latestIndex = match.index;
      if (!match[0]) globalPattern.lastIndex += 1;
    }
    return latestIndex;
  };

  const aliases = [
    { label: "Antwerp", patterns: [/\bantwer\w*\b/i] },
    {
      label: "Los Angeles",
      patterns: [/\blos angeles\b/i, /\blosangeles\b/i, /\bL\.?A\.?\b/, /\b(?:in|for|at)\s+la\b/i],
    },
    { label: "Miami", patterns: [/\bmiami\b/i, /\bmiami beach\b/i] },
    { label: "Redondo Beach", patterns: [/\bredondo\b/i, /\bredondo beach\b/i] },
    { label: "Dubai", patterns: [/\bdubai\b/i] },
  ];

  let bestMatch = { label: "", index: -1 };
  for (const entry of aliases) {
    for (const pattern of entry.patterns) {
      const index = getLastMatchIndex(source, pattern);
      if (index > bestMatch.index) {
        bestMatch = { label: entry.label, index };
      }
    }
  }

  const candidates = Array.isArray(supportedCities) ? supportedCities : [];
  for (const city of candidates) {
    const normalized = String(city || "").trim();
    if (!normalized) continue;
    const pattern = new RegExp(`\\b${normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "ig");
    let match;
    while ((match = pattern.exec(source)) !== null) {
      if (match.index > bestMatch.index) {
        bestMatch = { label: normalized, index: match.index };
      }
      if (!match[0]) pattern.lastIndex += 1;
    }
  }

  return bestMatch.label;
};

const normalizeCityLabel = (value = "") => {
  const source = sanitizeString(value, 120);
  if (!source) return "";
  const lower = source.toLowerCase();
  if (lower.includes("antwerpen") || lower.includes("antwerp")) return "Antwerp";
  if (lower.includes("los angeles") || lower === "la" || lower.includes("losangeles")) return "Los Angeles";
  if (lower.includes("dubai")) return "Dubai";
  if (lower.includes("redondo")) return "Redondo Beach";
  if (lower.includes("miami")) return "Miami";
  return source;
};

const extractAssistantReservationCity = (text = "", supportedCities = []) => {
  const source = String(text || "");
  const cityPattern = /\bcity\s*:\s*([^\n\r]+)/gi;
  let match;
  let latest = "";
  while ((match = cityPattern.exec(source)) !== null) {
    latest = sanitizeString(match?.[1] || "", 120);
  }
  if (!latest) return "";
  const hinted = extractCityHintFromPrompt(latest, supportedCities);
  return normalizeCityLabel(hinted || latest);
};

const resolvePublicSiteBase = (event = {}) => {
  const configured = sanitizeString(
    getEnv("PUBLIC_SITE_URL") || process.env.URL || process.env.DEPLOY_URL || "",
    500,
  );
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // ignore invalid configured base
    }
  }

  const headers = event.headers || {};
  const originHeader = sanitizeString(headers.origin || headers.Origin || "", 500);
  if (originHeader) {
    try {
      return new URL(originHeader).origin;
    } catch {
      // ignore
    }
  }

  const proto = headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "https";
  const host = headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host || "";
  if (host) return `${proto}://${host}`;

  return "https://oneluxstay.com";
};

const buildListingInfoUrl = ({ event, listing, checkIn, checkOut, guests, pageContext }) => {
  const listingId = sanitizeString(listing?._id || listing?.id || listing?.unitTypeId, 120);
  if (!listingId) return "";

  const citySlug = slugifyCity(listing?.city || listing?.address?.city || pageContext?.city || "");
  const base = resolvePublicSiteBase(event);
  const safeGuests = Math.max(1, Math.round(Number(guests) || 1));
  const path = citySlug
    ? `/${citySlug}/listing/${encodeURIComponent(listingId)}/${checkIn}/${checkOut}/${safeGuests}`
    : `/listings`;
  return `${base}${path}`;
};

const buildListingPageUrl = ({ event, listing, pageContext, guests = 1 }) => {
  const listingId = sanitizeString(listing?._id || listing?.id || listing?.unitTypeId, 120);
  if (!listingId) return "";

  const citySlug = slugifyCity(listing?.city || listing?.address?.city || pageContext?.city || "");
  const base = resolvePublicSiteBase(event);
  const safeGuests = Math.max(1, Math.round(Number(guests) || 1));
  const path = citySlug
    ? `/${citySlug}/listing/${encodeURIComponent(listingId)}`
    : "/listings";
  const qs = new URLSearchParams({
    listingId,
    city: sanitizeString(listing?.city || listing?.address?.city || pageContext?.city || "", 120),
    guests: String(safeGuests),
    adults: String(safeGuests),
    rooms: "1",
  });
  return `${base}${path}?${qs.toString()}`;
};

const getListingIdForChat = (listing = {}) =>
  sanitizeString(listing?._id || listing?.id || listing?.unitTypeId, 120);

const getParentListingIdForChat = (listing = {}) => {
  const listingId = getListingIdForChat(listing);
  const parentCandidate = [
    listing?.parentId,
    listing?.parentListingId,
    listing?.parentListing?._id,
    listing?.parent?._id,
    listing?.unitTypeId,
    listing?.unitType?._id,
  ]
    .map((value) => sanitizeString(value, 120))
    .find(Boolean);

  if (parentCandidate && parentCandidate !== listingId) return parentCandidate;
  return listingId || parentCandidate || "";
};

const extractListingImageUrls = (listing = {}, limit = 3) => {
  const urls = [];
  const seen = new Set();

  const pushUrl = (value) => {
    const candidate = sanitizeString(value, 900);
    if (!candidate) return;
    if (!/^https?:\/\//i.test(candidate)) return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    urls.push(candidate);
  };

  pushUrl(
    listing?.picture?.original ||
      listing?.picture?.regular ||
      listing?.picture?.large ||
      listing?.picture?.thumbnail ||
      listing?.picture?.url ||
      listing?.picture,
  );

  if (Array.isArray(listing?.pictures)) {
    listing.pictures.forEach((picture) => {
      if (typeof picture === "string") {
        pushUrl(picture);
        return;
      }
      pushUrl(picture?.original || picture?.regular || picture?.large || picture?.thumbnail || picture?.url);
    });
  }

  if (Array.isArray(listing?.images)) {
    listing.images.forEach((image) => {
      if (typeof image === "string") {
        pushUrl(image);
        return;
      }
      pushUrl(image?.original || image?.regular || image?.large || image?.thumbnail || image?.url || image?.src);
    });
  }

  return urls.slice(0, Math.max(1, Math.min(6, Number(limit) || 3)));
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

const normalizeFunctionsBase = (value = "") => {
  const raw = sanitizeString(value, 500);
  if (!raw) return "";

  try {
    const parsed = new URL(raw);
    const pathname = String(parsed.pathname || "").replace(/\/+$/, "");
    const marker = "/.netlify/functions";
    const markerIndex = pathname.indexOf(marker);
    const basePath = markerIndex >= 0 ? pathname.slice(0, markerIndex + marker.length) : marker;
    return `${parsed.origin}${basePath}`.replace(/\/+$/, "");
  } catch {
    return "";
  }
};

const toFunctionsBaseFromOrigin = (value = "") => {
  const raw = sanitizeString(value, 500);
  if (!raw) return "";
  try {
    return `${new URL(raw).origin}/.netlify/functions`;
  } catch {
    return "";
  }
};

const resolveFunctionsBaseCandidates = (event = {}, preferredBase = "") => {
  const headers = event.headers || {};
  const proto = headers["x-forwarded-proto"] || headers["X-Forwarded-Proto"] || "https";
  const host = headers["x-forwarded-host"] || headers["X-Forwarded-Host"] || headers.host || headers.Host || "";

  const candidates = [
    normalizeFunctionsBase(preferredBase),
    normalizeFunctionsBase(getEnv("AI_QUERY_FUNCTIONS_BASE")),
    toFunctionsBaseFromOrigin(process.env.DEPLOY_URL),
    toFunctionsBaseFromOrigin(process.env.URL),
    toFunctionsBaseFromOrigin(process.env.DEPLOY_PRIME_URL),
    toFunctionsBaseFromOrigin(getEnv("PUBLIC_SITE_URL")),
    host ? normalizeFunctionsBase(`${proto}://${host}/.netlify/functions`) : "",
    "http://localhost:8888/.netlify/functions",
  ].filter(Boolean);

  return [...new Set(candidates)];
};

const fetchFunctionJson = async ({
  event,
  path = "",
  timeoutMs = 20_000,
  preferredBase = "",
}) => {
  const normalizedPath = String(path || "").startsWith("/") ? String(path || "") : `/${String(path || "")}`;
  const bases = resolveFunctionsBaseCandidates(event, preferredBase);
  let lastError = null;

  for (const base of bases) {
    const url = `${base}${normalizedPath}`;
    try {
      const response = await fetchWithTimeout(url, { method: "GET" }, timeoutMs);
      const raw = await response.text();
      let payload = null;
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        lastError = new Error(`Non-JSON response from ${url}`);
        continue;
      }

      if (!response.ok) {
        lastError = new Error(
          `Request failed (${response.status}) for ${url}: ${sanitizeString(
            payload?.message || payload?.error || "",
            240,
          )}`,
        );
        continue;
      }

      return {
        base,
        url,
        payload: payload && typeof payload === "object" ? payload : {},
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Unable to reach internal function path: ${normalizedPath}`);
};

const fetchAvailableListingsForDates = async ({
  event,
  pageContext,
  cityHint = "",
  checkIn,
  checkOut,
  guests = 1,
  maxLinks = 5,
}) => {
  if (!isValidIsoDate(checkIn) || !isValidIsoDate(checkOut) || checkIn >= checkOut) {
    return { results: [], searched: 0 };
  }

  const listingsLookup = await fetchFunctionJson({
    event,
    path: "/listings?limit=200",
    timeoutMs: 20_000,
  });
  const base = listingsLookup.base;
  const listingsPayload = listingsLookup.payload || {};

  const allListings = Array.isArray(listingsPayload?.results) ? listingsPayload.results : [];
  const requestedCity = sanitizeString(cityHint || pageContext?.city, 120).toLowerCase();
  const normalizedRequestedCity = requestedCity.includes("antwerpen")
    ? "antwerp"
    : requestedCity.includes("miami beach")
      ? "miami"
      : requestedCity;
  const candidateListings = normalizedRequestedCity && normalizedRequestedCity !== "global"
    ? allListings.filter((listing) => {
        const listingCityRaw = sanitizeString(listing?.city || listing?.address?.city, 120).toLowerCase();
        const listingCity = listingCityRaw.includes("antwerpen")
          ? "antwerp"
          : listingCityRaw.includes("miami beach")
            ? "miami"
            : listingCityRaw;
        return listingCity.includes(normalizedRequestedCity);
      })
    : allListings;

  const listingById = new Map();
  const parentByListingId = new Map();
  const listingIdsByParent = new Map();

  candidateListings.forEach((listing) => {
    const listingId = getListingIdForChat(listing);
    if (!listingId) return;
    const parentId = getParentListingIdForChat(listing) || listingId;

    if (!listingById.has(listingId)) listingById.set(listingId, listing);
    parentByListingId.set(listingId, parentId);

    if (!listingIdsByParent.has(parentId)) {
      listingIdsByParent.set(parentId, new Set());
    }
    listingIdsByParent.get(parentId).add(listingId);
  });

  let scopedListings = candidateListings;
  const currentListingId = sanitizeString(pageContext?.listingId, 120);
  const hasExplicitCityHint = Boolean(sanitizeString(cityHint, 120));

  if (pageContext?.pageType === "listing" && currentListingId && !hasExplicitCityHint) {
    const targetParentId = parentByListingId.get(currentListingId) || currentListingId;
    const familyIds = new Set(listingIdsByParent.get(targetParentId) || []);
    familyIds.add(targetParentId);

    if (!familyIds.has(currentListingId)) familyIds.add(currentListingId);

    scopedListings = candidateListings.filter((listing) => {
      const listingId = getListingIdForChat(listing);
      return listingId && familyIds.has(listingId);
    });

    if (!scopedListings.length) {
      const fallbackListing = candidateListings.find((listing) => getListingIdForChat(listing) === currentListingId);
      if (fallbackListing) scopedListings = [fallbackListing];
    }
  }

  const ids = scopedListings
    .map((listing) => getListingIdForChat(listing))
    .filter(Boolean);
  if (!ids.length) return { results: [], searched: 0 };
  const minOccupancy = String(Math.max(1, Math.round(Number(guests) || 1)));
  const chunks = [];
  for (let index = 0; index < ids.length; index += 60) {
    chunks.push(ids.slice(index, index + 60));
  }
  const availableIds = new Set();

  for (const chunk of chunks) {
    const availabilityQs = new URLSearchParams({
      ids: chunk.join(","),
      checkIn,
      checkOut,
      minOccupancy,
    });
    let availabilityPayload = {};
    try {
      const availabilityLookup = await fetchFunctionJson({
        event,
        path: `/check-units/listings/availability-query?${availabilityQs.toString()}`,
        timeoutMs: 25_000,
        preferredBase: base,
      });
      availabilityPayload = availabilityLookup.payload || {};
    } catch (availabilityError) {
      console.warn("Availability chunk lookup failed", {
        message: availabilityError?.message || String(availabilityError),
        chunkSize: chunk.length,
      });
      continue;
    }

    (Array.isArray(availabilityPayload?.results) ? availabilityPayload.results : [])
      .filter((item) => item && item.available)
      .map((item) => sanitizeString(item.id, 120))
      .filter(Boolean)
      .forEach((id) => availableIds.add(id));
  }

  const availableParentIds = new Set();
  availableIds.forEach((listingId) => {
    const parentId = parentByListingId.get(listingId) || listingId;
    if (parentId) availableParentIds.add(parentId);
  });

  const parentListingsOrdered = [];
  const seenParents = new Set();
  scopedListings.forEach((listing) => {
    const listingId = getListingIdForChat(listing);
    if (!listingId) return;
    const parentId = parentByListingId.get(listingId) || listingId;
    if (!availableParentIds.has(parentId) || seenParents.has(parentId)) return;

    const parentListing = listingById.get(parentId) || listing;
    parentListingsOrdered.push({ parentId, listing: parentListing });
    seenParents.add(parentId);
  });

  const limitedParentListings = parentListingsOrdered.slice(0, Math.max(1, Math.min(10, Number(maxLinks) || 5)));

  const results = limitedParentListings.map(({ parentId, listing }) => {
    const listingId = getListingIdForChat(listing) || parentId;
    const title = sanitizeString(listing?.title || listing?.nickname || `Unit ${parentId || listingId}`, 220);
    const city = sanitizeString(listing?.city || listing?.address?.city, 120);
    const imageUrls = extractListingImageUrls(listing, 3);
    const url = buildListingInfoUrl({
      event,
      listing,
      checkIn,
      checkOut,
      guests,
      pageContext,
    });
    return { id: parentId || listingId, title, city, url, imageUrls };
  });

  return { results, searched: ids.length };
};

const getChatListingCapacity = (listing = {}) => {
  const candidates = [
    listing?.accommodates,
    listing?.occupancy,
    listing?.maxOccupancy,
    listing?.guestsIncludedInRegularFee,
    listing?.guestCapacity,
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
};

const hasCalendarDayAvailabilitySignal = (day = {}) =>
  Boolean(
    typeof day?.allotment === "number" ||
    typeof day?.available === "boolean" ||
    typeof day?.isAvailable === "boolean" ||
    typeof day?.status === "string",
  );

const isCalendarDayOpen = (day = {}, { forCheckIn = false } = {}) => {
  if (!day || typeof day !== "object") return false;
  const date = sanitizeString(day?.date || day?.day || day?.dateLocalized || "", 20);
  if (!isValidIsoDate(date)) return false;
  if (!hasCalendarDayAvailabilitySignal(day)) return false;

  let available = false;
  if (typeof day?.allotment === "number") {
    available = day.allotment > 0;
  } else if (typeof day?.available === "boolean") {
    available = day.available;
  } else if (typeof day?.isAvailable === "boolean") {
    available = day.isAvailable;
  } else if (typeof day?.status === "string") {
    available = day.status.toLowerCase() === "available";
  }
  if (!available) return false;

  if (forCheckIn && day?.restrictions?.closedToArrival) return false;

  return true;
};

const getCalendarMinNights = (day = {}) => {
  const raw = Number(
    day?.restrictions?.minNights ??
      day?.minNights ??
      day?.minimumStay ??
      day?.minStay ??
      1,
  );
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.max(1, Math.min(60, Math.round(raw)));
};

const isBookableCheckInDate = (daysByIsoDate = new Map(), checkInIso = "") => {
  if (!checkInIso || !(daysByIsoDate instanceof Map)) return false;
  const checkInDay = daysByIsoDate.get(checkInIso);
  if (!isCalendarDayOpen(checkInDay, { forCheckIn: true })) return false;

  const minNights = getCalendarMinNights(checkInDay);
  for (let offset = 1; offset < minNights; offset += 1) {
    const stayDate = addIsoDays(checkInIso, offset);
    const stayDay = daysByIsoDate.get(stayDate);
    if (!isCalendarDayOpen(stayDay, { forCheckIn: false })) {
      return false;
    }
  }

  return true;
};

const fetchAvailableDatesForMonth = async ({
  event,
  pageContext,
  cityHint = "",
  monthRange = null,
  guests = 1,
  maxLinks = 5,
}) => {
  if (!monthRange || !isValidIsoDate(monthRange.startDate) || !isValidIsoDate(monthRange.endDate)) {
    return { results: [], searched: 0 };
  }

  const listingsLookup = await fetchFunctionJson({
    event,
    path: "/listings?limit=200",
    timeoutMs: 20_000,
  });
  const base = listingsLookup.base;
  const listingsPayload = listingsLookup.payload || {};

  const requiredGuests = Math.max(1, Math.round(Number(guests) || 1));
  const allListings = Array.isArray(listingsPayload?.results) ? listingsPayload.results : [];
  const requestedCity = sanitizeString(cityHint || pageContext?.city, 120).toLowerCase();
  const normalizedRequestedCity = requestedCity.includes("antwerpen")
    ? "antwerp"
    : requestedCity.includes("miami beach")
      ? "miami"
      : requestedCity;

  const candidateListings = (normalizedRequestedCity && normalizedRequestedCity !== "global"
    ? allListings.filter((listing) => {
        const listingCityRaw = sanitizeString(listing?.city || listing?.address?.city, 120).toLowerCase();
        const listingCity = listingCityRaw.includes("antwerpen")
          ? "antwerp"
          : listingCityRaw.includes("miami beach")
            ? "miami"
            : listingCityRaw;
        return listingCity.includes(normalizedRequestedCity);
      })
    : allListings).filter((listing) => {
      const capacity = getChatListingCapacity(listing);
      if (!Number.isFinite(capacity)) return true;
      return capacity >= requiredGuests;
    });

  const listingById = new Map();
  const parentByListingId = new Map();
  const listingIdsByParent = new Map();

  candidateListings.forEach((listing) => {
    const listingId = getListingIdForChat(listing);
    if (!listingId) return;
    const parentId = getParentListingIdForChat(listing) || listingId;

    if (!listingById.has(listingId)) listingById.set(listingId, listing);
    parentByListingId.set(listingId, parentId);

    if (!listingIdsByParent.has(parentId)) {
      listingIdsByParent.set(parentId, new Set());
    }
    listingIdsByParent.get(parentId).add(listingId);
  });

  let scopedListings = candidateListings;
  const currentListingId = sanitizeString(pageContext?.listingId, 120);
  const hasExplicitCityHint = Boolean(sanitizeString(cityHint, 120));

  if (pageContext?.pageType === "listing" && currentListingId && !hasExplicitCityHint) {
    const targetParentId = parentByListingId.get(currentListingId) || currentListingId;
    const familyIds = new Set(listingIdsByParent.get(targetParentId) || []);
    familyIds.add(targetParentId);
    if (!familyIds.has(currentListingId)) familyIds.add(currentListingId);

    scopedListings = candidateListings.filter((listing) => {
      const listingId = getListingIdForChat(listing);
      return listingId && familyIds.has(listingId);
    });

    if (!scopedListings.length) {
      const fallbackListing = candidateListings.find((listing) => getListingIdForChat(listing) === currentListingId);
      if (fallbackListing) scopedListings = [fallbackListing];
    }
  }

  const ids = scopedListings.map((listing) => getListingIdForChat(listing)).filter(Boolean);
  if (!ids.length) {
    return { results: [], searched: 0 };
  }

  const chunks = [];
  for (let index = 0; index < ids.length; index += 60) {
    chunks.push(ids.slice(index, index + 60));
  }

  const openDatesByListingId = new Map();
  const chunkRange = {
    startDate: monthRange.startDate,
    // Fetch extra trailing days so min-night checks near month-end are still accurate.
    endDate: addIsoDays(monthRange.endDate, 31) || monthRange.endDate,
  };

  for (const chunk of chunks) {
    const qs = new URLSearchParams({
      listingIds: chunk.join(","),
      startDate: chunkRange.startDate,
      endDate: chunkRange.endDate,
      includeAllotment: "true",
    });

    let payload = {};
    try {
      const lookup = await fetchFunctionJson({
        event,
        path: `/check-units/listings/calendar-multi?${qs.toString()}`,
        timeoutMs: 30_000,
        preferredBase: base,
      });
      payload = lookup.payload || {};
    } catch (calendarError) {
      console.warn("Monthly calendar lookup failed", {
        message: calendarError?.message || String(calendarError),
        chunkSize: chunk.length,
      });
      continue;
    }

    const normalizedCalendars =
      payload?.normalizedCalendars && typeof payload.normalizedCalendars === "object"
        ? payload.normalizedCalendars
        : {};

    chunk.forEach((listingId) => {
      const days = Array.isArray(normalizedCalendars?.[listingId])
        ? normalizedCalendars[listingId]
        : [];
      const daysByIsoDate = new Map();
      days.forEach((day) => {
        const isoDate = sanitizeString(day?.date || "", 20);
        if (!isValidIsoDate(isoDate)) return;
        daysByIsoDate.set(isoDate, day);
      });

      const dateSet = openDatesByListingId.get(listingId) || new Set();
      const monthStartDate = toUtcDateFromIso(monthRange.startDate);
      const monthEndDate = toUtcDateFromIso(monthRange.endDate);
      const todayIso = toIsoFromLocalDate(new Date());
      if (monthStartDate && monthEndDate) {
        for (
          let cursor = new Date(monthStartDate.getTime());
          cursor.getTime() <= monthEndDate.getTime();
          cursor.setUTCDate(cursor.getUTCDate() + 1)
        ) {
          const isoDate = toIsoDate(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, cursor.getUTCDate());
          if (!isValidIsoDate(isoDate)) continue;
          if (todayIso && isoDate < todayIso) continue;
          if (isBookableCheckInDate(daysByIsoDate, isoDate)) {
            dateSet.add(isoDate);
          }
        }
      }
      openDatesByListingId.set(listingId, dateSet);
    });
  }

  const parentListingsOrdered = [];
  const seenParents = new Set();
  scopedListings.forEach((listing) => {
    const listingId = getListingIdForChat(listing);
    if (!listingId) return;
    const parentId = parentByListingId.get(listingId) || listingId;
    if (seenParents.has(parentId)) return;
    seenParents.add(parentId);

    const familyIds = Array.from(listingIdsByParent.get(parentId) || []);
    if (!familyIds.length) familyIds.push(parentId);

    const parentDates = new Set();
    familyIds.forEach((familyId) => {
      const dateSet = openDatesByListingId.get(familyId);
      if (!dateSet) return;
      dateSet.forEach((isoDate) => parentDates.add(isoDate));
    });

    const availableDates = [...parentDates].sort();
    if (!availableDates.length) return;

    const parentListing = listingById.get(parentId) || listing;
    parentListingsOrdered.push({
      parentId,
      listing: parentListing,
      availableDates,
    });
  });

  const limited = parentListingsOrdered.slice(0, Math.max(1, Math.min(10, Number(maxLinks) || 5)));
  const results = limited.map(({ parentId, listing, availableDates }) => {
    const listingId = getListingIdForChat(listing) || parentId;
    const title = sanitizeString(listing?.title || listing?.nickname || `Unit ${parentId || listingId}`, 220);
    const city = sanitizeString(listing?.city || listing?.address?.city, 120);
    const imageUrls = extractListingImageUrls(listing, 3);
    const url = buildListingPageUrl({
      event,
      listing,
      pageContext,
      guests: requiredGuests,
    });
    return {
      id: parentId || listingId,
      title,
      city,
      url,
      imageUrls,
      availableDates,
    };
  });

  return {
    results,
    searched: ids.length,
  };
};

const buildMonthAvailabilityReply = ({
  monthLabel = "",
  guests = 1,
  matches = [],
  searched = 0,
}) => {
  const label = sanitizeString(monthLabel, 60) || "the selected month";
  const safeGuests = Math.max(1, Math.round(Number(guests) || 1));
  if (!Array.isArray(matches) || !matches.length) {
    return `I checked available check-in dates in ${label} (${safeGuests} guest${safeGuests > 1 ? "s" : ""}) and could not find open units in the current search scope. If you want, I can try a different month or guest count.`;
  }

  const lines = [
    `I checked available check-in dates in ${label} for ${safeGuests} guest${safeGuests > 1 ? "s" : ""}.`,
    "",
  ];

  matches.forEach((item, index) => {
    const title = sanitizeString(item?.title, 220) || `Unit ${item?.id || index + 1}`;
    const city = sanitizeString(item?.city, 120);
    const url = sanitizeString(item?.url, 500);
    const ranges = formatAvailabilityDateRanges(item?.availableDates, 8) || "No open dates found";

    lines.push(`${index + 1}. ${title}${city ? ` (${city})` : ""}`);
    lines.push(`Available dates: ${ranges}`);
    if (url) lines.push(url);
    lines.push("");
  });

  if (searched > matches.length) {
    lines.push(`I checked ${searched} candidate unit${searched > 1 ? "s" : ""}.`);
    lines.push("");
  }

  lines.push("These are current check-in date signals and can still be affected by minimum-night rules.");
  return lines.join("\n");
};

const buildAvailabilityLinksReply = ({ checkIn, checkOut, guests, matches = [], searched = 0 }) => {
  if (!Array.isArray(matches) || !matches.length) {
    return `I checked availability for ${checkIn} to ${checkOut} (${guests} guest${guests > 1 ? "s" : ""}) and I could not find available units in the current search scope. If you want, I can try another date range or guest count.`;
  }

  const lines = [
    `Great news. I found ${matches.length} available unit${matches.length > 1 ? "s" : ""} for ${checkIn} to ${checkOut} (${guests} guest${guests > 1 ? "s" : ""}).`,
    "",
  ];
  matches.forEach((item, index) => {
    const title = sanitizeString(item?.title, 220) || `Unit ${item?.id || index + 1}`;
    const city = sanitizeString(item?.city, 120);
    const url = sanitizeString(item?.url, 500);
    lines.push(`${index + 1}. ${title}${city ? ` (${city})` : ""}`);
    if (url) lines.push(url);
  });
  if (searched > matches.length) {
    lines.push("");
    lines.push(`I checked ${searched} candidate unit${searched > 1 ? "s" : ""}.`);
  }
  lines.push("");
  lines.push("Open any link above to view the unit information page and continue booking.");
  return lines.join("\n");
};

const fetchReservationStatusForChat = async ({ event, reservationCode }) => {
  const code = sanitizeReservationCode(reservationCode);
  if (!looksLikeReservationCode(code)) {
    return { results: [], error: "invalid_reservation_code" };
  }

  let payload = {};
  try {
    const lookup = await fetchFunctionJson({
      event,
      path: `/getReservation?reservationId=${encodeURIComponent(code)}`,
      timeoutMs: 20_000,
    });
    payload = lookup.payload || {};
  } catch (error) {
    return {
      results: [],
      error: "reservation_lookup_failed",
      details: { message: sanitizeString(error?.message || String(error), 240) },
    };
  }

  return {
    results: Array.isArray(payload?.results) ? payload.results : [],
    attempted: Array.isArray(payload?.attempted) ? payload.attempted : [],
    raw: payload?.raw || null,
  };
};

const pickBestReservationMatch = ({ results = [], reservationCode = "" }) => {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return null;

  const needle = normalizeReservationToken(reservationCode);
  if (!needle) return list[0];

  const exact = list.find((item) => {
    const candidates = [
      item?._id,
      item?.id,
      item?.confirmationCode,
      item?.number,
      item?.integration?.airbnb2?.id,
    ];
    return candidates.some((value) => normalizeReservationToken(value) === needle);
  });

  return exact || list[0];
};

const formatReservationDate = (value = "") => {
  const source = sanitizeString(value, 80);
  if (!source) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(source)) return source.slice(0, 10);

  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return source;
  return parsed.toISOString().slice(0, 10);
};

const formatReservationStatus = (value = "") => {
  const normalized = sanitizeString(value, 80).toLowerCase();
  if (!normalized) return "Unknown";
  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const inferCityFromReservation = (reservation = {}, supportedCities = []) =>
  normalizeCityLabel(
    extractCityHintFromPrompt(
      [
        reservation?.listing?.city,
        reservation?.listing?.address?.city,
        reservation?.address?.city,
        reservation?.city,
        reservation?.listing?.title,
        reservation?.listing?.nickname,
      ]
        .map((value) => sanitizeString(value, 220))
        .filter(Boolean)
        .join(" "),
      supportedCities,
    ),
  );

const buildReservationStatusReply = ({ reservationCode = "", reservation = null, supportedCities = [] }) => {
  const safeCode = sanitizeReservationCode(reservationCode);
  if (!reservation) {
    return `I could not find a booking for reservation code ${safeCode || "(missing)"}. Please verify the code and try again. If it still fails, contact reservations@oneluxstay.com for manual verification.`;
  }

  const status = formatReservationStatus(reservation?.status);
  const confirmationCode = sanitizeReservationCode(
    reservation?.confirmationCode || reservation?._id || reservation?.id || safeCode,
  );
  const listingTitle = sanitizeString(reservation?.listing?.title || reservation?.listing?.nickname, 220);
  const listingId = sanitizeString(reservation?.listing?._id || reservation?.listingId, 120);
  const reservationCity = inferCityFromReservation(reservation, supportedCities);
  const checkIn =
    formatReservationDate(reservation?.checkInDateLocalized || reservation?.checkIn) || "Unknown";
  const checkOut =
    formatReservationDate(reservation?.checkOutDateLocalized || reservation?.checkOut) || "Unknown";

  const lines = [
    "I found your booking details:",
    `- Reservation code: ${confirmationCode || safeCode || "Unknown"}`,
    `- Status: ${status}`,
    `- Check-in: ${checkIn}`,
    `- Check-out: ${checkOut}`,
  ];

  if (listingTitle) lines.push(`- Unit: ${listingTitle}`);
  else if (listingId) lines.push(`- Listing ID: ${listingId}`);
  if (reservationCity) lines.push(`- City: ${reservationCity}`);

  lines.push("");
  lines.push("If you want, I can also check availability for new dates and share direct unit-page links.");
  return lines.join("\n");
};

const fetchListingForChat = async ({ event, listingId }) => {
  const safeListingId = sanitizeString(listingId, 120);
  if (!safeListingId) return null;

  try {
    const lookup = await fetchFunctionJson({
      event,
      path: `/listings?onlyIds=${encodeURIComponent(safeListingId)}&limit=1`,
      timeoutMs: 20_000,
    });
    const payload = lookup.payload || {};
    const listing = Array.isArray(payload?.results) ? payload.results[0] : null;
    return listing || null;
  } catch {
    return null;
  }
};

const fetchHouseRulesForChat = async ({ event, unitTypeId }) => {
  const safeUnitTypeId = sanitizeString(unitTypeId, 120);
  if (!safeUnitTypeId) return null;

  try {
    const lookup = await fetchFunctionJson({
      event,
      path: `/house-rules?unitTypeId=${encodeURIComponent(safeUnitTypeId)}`,
      timeoutMs: 20_000,
    });
    const payload = lookup.payload || {};
    if (!payload || typeof payload !== "object") return null;
    return payload?.houseRules && typeof payload.houseRules === "object"
      ? payload.houseRules
      : payload;
  } catch {
    return null;
  }
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

const formatHouseRuleValueForChat = (value) => {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string" && value.trim()) return sanitizeString(value, 120);
  return "—";
};

const formatQuietHoursForChat = (rules = {}) => {
  const quietBetween = rules?.quietBetween;
  if (quietBetween?.enabled) {
    const start = sanitizeString(quietBetween?.hours?.start || "", 10) || "--:--";
    const end = sanitizeString(quietBetween?.hours?.end || "", 10) || "--:--";
    return `${start} - ${end}`;
  }

  const quietHours = rules?.quietHours;
  if (!quietHours || quietHours?.set === false) return "Not set";
  const start = sanitizeString(quietHours?.start || "", 10) || "--:--";
  const end = sanitizeString(quietHours?.end || "", 10) || "--:--";
  return `${start} - ${end}`;
};

const buildUnitInfoReply = ({ listing, question, houseRules = null }) => {
  if (!listing) return "";

  const q = String(question || "").toLowerCase();
  const wantsSize = /\b(size|square|sqft|square feet|square meter|sqm)\b/.test(q);
  const wantsLandmarks = /\b(near|nearby|landmark|landmarks|what is near|nearest)\b/.test(q);
  const wantsAmenities =
    /\b(amenit(?:y|ies)|features?|what does it have|parking|wifi|pool|gym|kitchen|laundry|washer|dryer|washing machine)\b/.test(
      q,
    );
  const wantsHouseRules =
    /\b(house rules?|quiet hours?|quiet time|noise|smoking|party|parties|pets?|minimum age|children|infants)\b/.test(
      q,
    );
  const asksQuietHours = /\b(quiet hours?|quiet time|noise)\b/.test(q);
  const rules = houseRules && typeof houseRules === "object" ? houseRules : null;

  const title = sanitizeString(listing?.title || listing?.nickname, 220);
  const city = sanitizeString(listing?.address?.city || "", 120);
  const propertyType = sanitizeString(listing?.propertyType || listing?.type || "", 120);
  const accommodates = Number(listing?.accommodates);
  const bedrooms = Number(listing?.bedrooms);
  const bathrooms = Number(listing?.bathrooms);
  const beds = Number(listing?.beds);
  const fullAddress = sanitizeString(listing?.address?.full || "", 240);
  const summary = sanitizeString(listing?.publicDescription?.summary || "", 260);
  const allAmenities = Array.isArray(listing?.amenities)
    ? listing.amenities
        .map((item) => {
          if (typeof item === "string") return sanitizeString(item, 80);
          if (item && typeof item === "object") {
            return sanitizeString(item.amenity || item.name || item.label || item.title || item.value, 80);
          }
          return "";
        })
        .filter(Boolean)
    : [];
  const amenities = allAmenities.slice(0, 12);
  const amenityText = allAmenities.join(" ").toLowerCase();
  const hasAmenity = (pattern) => pattern.test(amenityText);
  const amenityChecks = [
    {
      key: "washer",
      label: "Washer",
      questionPattern: /\b(washer|washing machine)\b/,
      valuePattern: /\b(washer|washing machine)\b/,
    },
    {
      key: "dryer",
      label: "Dryer",
      questionPattern: /\b(dryer|tumble dryer)\b/,
      valuePattern: /\b(dryer|tumble dryer)\b/,
    },
    {
      key: "laundry",
      label: "Laundry",
      questionPattern: /\blaundry\b/,
      valuePattern: /\b(laundry|washer|washing machine|dryer|tumble dryer)\b/,
    },
    {
      key: "wifi",
      label: "Wi-Fi",
      questionPattern: /\b(wifi|wi-fi|internet)\b/,
      valuePattern: /\b(wifi|wi-fi|internet)\b/,
    },
    {
      key: "parking",
      label: "Parking",
      questionPattern: /\bparking\b/,
      valuePattern: /\bparking\b/,
    },
    {
      key: "pool",
      label: "Pool",
      questionPattern: /\bpool\b/,
      valuePattern: /\bpool\b/,
    },
    {
      key: "gym",
      label: "Gym",
      questionPattern: /\b(gym|fitness)\b/,
      valuePattern: /\b(gym|fitness)\b/,
    },
    {
      key: "kitchen",
      label: "Kitchen",
      questionPattern: /\bkitchen\b/,
      valuePattern: /\bkitchen\b/,
    },
  ];
  const askedAmenityChecks = amenityChecks.filter((entry) => entry.questionPattern.test(q));
  const askedAmenityChecksUnique = askedAmenityChecks.filter(
    (entry, index, array) => array.findIndex((candidate) => candidate.key === entry.key) === index,
  );
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
    if (askedAmenityChecksUnique.length) {
      if (!amenities.length) {
        lines.push("I can’t verify that amenity right now because this unit’s amenities data is missing.");
      } else {
        lines.push("Amenity check:");
        askedAmenityChecksUnique.forEach((entry) => {
          lines.push(`- ${entry.label}: ${hasAmenity(entry.valuePattern) ? "Yes" : "No"}`);
        });
      }
    } else if (amenities.length) {
      lines.push(`Amenities listed: ${amenities.join(", ")}.`);
    } else {
      lines.push("I don’t have a complete amenities list for this unit in the current payload.");
    }
  }

  if (wantsHouseRules) {
    if (!rules) {
      lines.push(
        "I can’t confirm the house rules for this listing right now. Please check the House rules section on this page or contact reservations@oneluxstay.com.",
      );
    } else if (asksQuietHours) {
      lines.push(`Quiet hours: ${formatQuietHoursForChat(rules)}.`);
    } else {
      const petsAllowed = typeof rules?.petsAllowed === "object" ? rules?.petsAllowed?.enabled : rules?.petsAllowed;
      const petsCharged = typeof rules?.petsAllowed === "object" ? rules?.petsAllowed?.charged : rules?.petsCharged;
      const smokingAllowed =
        typeof rules?.smokingAllowed === "object" ? rules?.smokingAllowed?.enabled : rules?.smokingAllowed;
      const eventsAllowed =
        typeof rules?.suitableForEvents === "object"
          ? rules?.suitableForEvents?.enabled
          : rules?.suitableForEvents ?? rules?.partiesAllowed;
      const childrenRules = rules?.childrenRules || {};

      lines.push("House rules:");
      lines.push(
        `- Suitable for children: ${formatHouseRuleValueForChat(
          childrenRules?.suitableForChildren ?? rules?.suitableForChildren,
        )}`,
      );
      lines.push(
        `- Suitable for infants: ${formatHouseRuleValueForChat(
          childrenRules?.suitableForInfants ?? rules?.suitableForInfants,
        )}`,
      );
      lines.push(`- Pets allowed: ${formatHouseRuleValueForChat(petsAllowed)}`);
      lines.push(`- Pets charged: ${formatHouseRuleValueForChat(petsCharged)}`);
      lines.push(`- Smoking allowed: ${formatHouseRuleValueForChat(smokingAllowed)}`);
      lines.push(`- Parties allowed: ${formatHouseRuleValueForChat(eventsAllowed)}`);
      lines.push(`- Quiet hours: ${formatQuietHoursForChat(rules)}`);
      lines.push(`- Minimum age: ${formatHouseRuleValueForChat(rules?.minimumAge)}`);
    }
  }

  if (!wantsSize && !wantsLandmarks && !wantsAmenities && !wantsHouseRules) {
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

  const protection = verifyAiRequest(event, { endpoint: "chat" });
  if (!protection.ok) {
    return jsonResponse(
      protection.status || 403,
      { error: protection.error || "Request blocked" },
      event,
      protection.retryAfter ? { "Retry-After": String(protection.retryAfter) } : {},
    );
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

  try {
    let retrievedPolicyText = "";
    const latestPrompt = String(latestUserMessage?.content || "");
    const previousAssistantMessage = [...messages]
      .slice(0, -1)
      .reverse()
      .find((message) => message.role === "assistant");
    const assistantConversationText = messages
      .filter((message) => message.role === "assistant")
      .map((message) => String(message.content || ""))
      .join("\n");
    const latestAssistantText = String(previousAssistantMessage?.content || "");
    const userMessages = messages
      .filter((message) => message.role === "user")
      .map((message) => String(message.content || ""));
    const userConversationText = userMessages.join(" ");
    const userMessagesNewestFirst = [...userMessages].reverse();
    const guestAlreadyBooked = hasExistingBookingContext(userConversationText);
    const conversationDateRange =
      userMessagesNewestFirst
        .map((message) =>
          extractDateRange({
            prompt: message,
            search: "",
          }),
        )
        .find(Boolean) || null;
    const promptDateRange = extractDateRange({
      prompt: latestPrompt,
      search: "",
    });
    const monthRange = !promptDateRange
      ? extractMonthRange({
          prompt: latestPrompt,
          search: pageContext?.search || "",
        })
      : null;
    const searchDateRange = !promptDateRange && !monthRange
      ? extractDateRange({
          prompt: "",
          search: pageContext?.search || "",
        })
      : null;
    const dateRange = promptDateRange || searchDateRange;
    const availabilityDateRange = dateRange || conversationDateRange;
    const conversationMonthRange = !availabilityDateRange
      ? userMessagesNewestFirst
          .map((message) =>
            extractMonthRange({
              prompt: message,
              search: "",
            }),
          )
          .find(Boolean) || null
      : null;
    const reservationCode = extractReservationCode({
      prompt: latestPrompt,
      search: pageContext?.search || "",
    });
    const conversationReservationCode =
      userMessagesNewestFirst.map((message) => extractStrictReservationCode(message)).find(Boolean) || "";
    const assistantReservationCode = extractStrictReservationCode(latestAssistantText);
    const promptCityHint = extractCityHintFromPrompt(latestPrompt, supportedCities);
    const normalizedPromptCity = normalizeCityLabel(promptCityHint);
    const conversationCityHint =
      userMessagesNewestFirst
        .map((message) => extractCityHintFromPrompt(message, supportedCities))
        .find(Boolean) || "";
    const normalizedConversationCity = normalizeCityLabel(conversationCityHint);
    const assistantReservationCity = extractAssistantReservationCity(assistantConversationText, supportedCities);
    const pageContextCityHint = extractCityHintFromPrompt(
      [pageContext?.city, pageContext?.title, pageContext?.pathname].filter(Boolean).join(" "),
      supportedCities,
    );
    const normalizedPageContextCity = normalizeCityLabel(pageContextCityHint);
    const previousAssistantAskedCheckInOutLocation = /\b(which|what)\s+location\s+(are\s+you\s+planning\s+to\s+book(?:\s+first)?|is\s+your\s+booking\s+in)\b/i.test(
      String(previousAssistantMessage?.content || ""),
    );
    const followsUpWithLocationOnly =
      previousAssistantAskedCheckInOutLocation && Boolean(normalizedPromptCity);
    const asksPolicy = isPolicyQuestion(latestPrompt);
    const asksUnitInfo = isUnitInfoQuestion(latestPrompt);
    const asksCheckInOutTime = isCheckInOutTimeQuestion(latestPrompt) || followsUpWithLocationOnly;
    const latestIsAffirmativeFollowup = isAffirmativeFollowup(latestPrompt);
    const previousAssistantOfferedAvailability =
      /\b(availability|available|check[- ]?in|check[- ]?out|dates?|month|book|booking|unit-page links?|city page link|would you like)\b/i.test(
        String(previousAssistantMessage?.content || ""),
      );
    const followUpAvailabilityIntent =
      latestIsAffirmativeFollowup && previousAssistantOfferedAvailability;
    const effectiveMonthRange = monthRange || conversationMonthRange;
    const asksAvailabilityWindow = Boolean(availabilityDateRange || effectiveMonthRange);
    const asksBookingLead = isBookingLeadQuestion(latestPrompt);
    const asksAvailability =
      asksAvailabilityWindow ||
      isAvailabilityQuestion(latestPrompt, asksAvailabilityWindow) ||
      asksBookingLead ||
      followUpAvailabilityIntent;
    const hasReservationCode = Boolean(reservationCode);
    const asksBookingStatus = isBookingStatusQuestion(latestPrompt) || hasReservationCode;
    const includesSensitivePaymentData = hasSensitivePaymentData(latestPrompt);
    let policyRows = [];

    if (includesSensitivePaymentData) {
      return jsonResponse(
        200,
        {
          reply:
            "For your security, please don’t share payment details here. All payments should be completed through our secure booking page.",
          model,
        },
        event,
      );
    }

    if (asksBookingStatus) {
      if (!reservationCode) {
        return jsonResponse(
          200,
          {
            reply:
              "I can check your booking status. Please share your reservation code (for example: GY-aeDHKynZ).",
            model,
          },
          event,
        );
      }

      try {
        const lookup = await fetchReservationStatusForChat({
          event,
          reservationCode,
        });
        const reservation = pickBestReservationMatch({
          results: lookup?.results,
          reservationCode,
        });
        let reservationForReply = reservation;
        const knownReservationCity = inferCityFromReservation(reservationForReply, supportedCities);
        if (!knownReservationCity) {
          const reservationListingId = sanitizeString(
            reservationForReply?.listing?._id || reservationForReply?.listingId,
            120,
          );
          if (reservationListingId) {
            const reservationListing = await fetchListingForChat({
              event,
              listingId: reservationListingId,
            });
            const listingCity = sanitizeString(
              reservationListing?.city || reservationListing?.address?.city,
              120,
            );
            if (listingCity) {
              reservationForReply = {
                ...reservationForReply,
                listing: {
                  ...(reservationForReply?.listing || {}),
                  city: listingCity,
                },
              };
            }
          }
        }
        return jsonResponse(
          200,
          {
            reply: buildReservationStatusReply({
              reservationCode,
              reservation: reservationForReply,
              supportedCities,
            }),
            model,
          },
          event,
        );
      } catch (reservationError) {
        console.warn("Reservation lookup failed in chat flow", {
          message: reservationError?.message || String(reservationError),
        });
        return jsonResponse(
          200,
          {
            reply:
              "I had trouble reaching the booking status service just now. Please try again in a moment, or contact reservations@oneluxstay.com for immediate help.",
            model,
          },
          event,
        );
      }
    }

    if (asksCheckInOutTime && !dateRange && !monthRange) {
      const codeForTimeContext = reservationCode || conversationReservationCode || assistantReservationCode;
      let cityForTimeReply = normalizedPromptCity || assistantReservationCity;

      if (!cityForTimeReply && codeForTimeContext) {
        try {
          const timeLookup = await fetchReservationStatusForChat({
            event,
            reservationCode: codeForTimeContext,
          });
          const timeReservation = pickBestReservationMatch({
            results: timeLookup?.results,
            reservationCode: codeForTimeContext,
          });
          cityForTimeReply = inferCityFromReservation(timeReservation, supportedCities);

          if (!cityForTimeReply) {
            const timeListingId = sanitizeString(
              timeReservation?.listing?._id || timeReservation?.listingId,
              120,
            );
            if (timeListingId) {
              const timeListing = await fetchListingForChat({
                event,
                listingId: timeListingId,
              });
              cityForTimeReply = normalizeCityLabel(
                extractCityHintFromPrompt(
                  [timeListing?.city, timeListing?.address?.city, timeListing?.title].filter(Boolean).join(" "),
                  supportedCities,
                ),
              );
            }
          }
        } catch (timeContextError) {
          console.warn("Unable to resolve reservation city for check-in/out reply", {
            message: timeContextError?.message || String(timeContextError),
          });
        }
      }

      if (!cityForTimeReply) {
        cityForTimeReply = normalizedConversationCity || normalizedPageContextCity;
      }

      if (!cityForTimeReply) {
        if (guestAlreadyBooked || Boolean(codeForTimeContext)) {
          return jsonResponse(
            200,
            {
              reply:
                "For your booking, standard check-in is 3:00 PM and check-out is 11:00 AM. If you share your city, I can confirm the location in the same message as well.",
              model,
            },
            event,
          );
        }
        const visibleCities = supportedCities.length
          ? supportedCities
          : ["Los Angeles", "Dubai", "Antwerp"];
        const cityOptions = visibleCities
          .map((city) => normalizeCityLabel(city))
          .filter(Boolean)
          .slice(0, 5)
          .join(", ");
        return jsonResponse(
          200,
          {
            reply: guestAlreadyBooked
              ? `Sure, I can help with that. Which location is your booking in? (${cityOptions})`
              : `Sure, I can help with that. Which location are you planning to book first? (${cityOptions})`,
            model,
          },
          event,
        );
      }
      return jsonResponse(
        200,
        {
          reply: guestAlreadyBooked
            ? `For our units in ${cityForTimeReply}, check-in is 3:00 PM and check-out is 11:00 AM. If you need help with your reservation details, I can help with that next.`
            : `For our units in ${cityForTimeReply}, check-in is 3:00 PM and check-out is 11:00 AM. If you want, I can also help you find available dates and guide you to booking.`,
          model,
        },
        event,
      );
    }

    if (asksAvailability) {
      const conversationGuests =
        userMessagesNewestFirst.map((message) => parseGuestsFromText(message)).find((value) => value !== null) || 1;
      const guests = extractGuests(latestPrompt, conversationGuests);
      const availabilityCityHint = promptCityHint || conversationCityHint || pageContextCityHint;
      const availabilityCityLabel = normalizeCityLabel(availabilityCityHint);

      if (!availabilityDateRange && !effectiveMonthRange) {
        return jsonResponse(
          200,
          {
            reply: availabilityCityLabel
              ? `I’d be happy to help with that for ${availabilityCityLabel}. Please share your check-in and check-out dates plus guest count. Once I have that, I can guide you to the best available option on our secure booking page.`
              : "I’d be happy to help with that. Please share your check-in and check-out dates plus guest count. Once I have that, I can guide you to the best available option on our secure booking page.",
            model,
          },
          event,
        );
      }

      if (effectiveMonthRange && !availabilityDateRange) {
        try {
          const monthMatches = await fetchAvailableDatesForMonth({
            event,
            pageContext,
            cityHint: availabilityCityHint,
            monthRange: effectiveMonthRange,
            guests,
            maxLinks: 5,
          });
          return jsonResponse(
            200,
            {
              reply: buildMonthAvailabilityReply({
                monthLabel: effectiveMonthRange.label,
                guests,
                matches: monthMatches.results,
                searched: monthMatches.searched,
              }),
              cards: (Array.isArray(monthMatches.results) ? monthMatches.results : []).map((item) => ({
                id: sanitizeString(item?.id, 120),
                title: sanitizeString(item?.title, 220),
                city: sanitizeString(item?.city, 120),
                url: sanitizeString(item?.url, 500),
                images: Array.isArray(item?.imageUrls)
                  ? item.imageUrls.map((image) => sanitizeString(image, 900)).filter(Boolean).slice(0, 3)
                  : [],
              })),
              model,
            },
            event,
          );
        } catch (monthAvailabilityError) {
          console.warn("Monthly availability search failed in chat flow", {
            message: monthAvailabilityError?.message || String(monthAvailabilityError),
          });
          return jsonResponse(
            200,
            {
              reply:
                "I had trouble checking month-wide availability right now. Please try again in a moment, or share exact check-in and check-out dates so I can retry with a direct date range.",
              model,
            },
            event,
          );
        }
      }

      try {
        const availabilityMatches = await fetchAvailableListingsForDates({
          event,
          pageContext,
          cityHint: availabilityCityHint,
          checkIn: availabilityDateRange.checkIn,
          checkOut: availabilityDateRange.checkOut,
          guests,
          maxLinks: 5,
        });
        return jsonResponse(
          200,
          {
              reply: buildAvailabilityLinksReply({
                checkIn: availabilityDateRange.checkIn,
                checkOut: availabilityDateRange.checkOut,
                guests,
                matches: availabilityMatches.results,
                searched: availabilityMatches.searched,
              }),
            cards: (Array.isArray(availabilityMatches.results) ? availabilityMatches.results : []).map((item) => ({
              id: sanitizeString(item?.id, 120),
              title: sanitizeString(item?.title, 220),
              city: sanitizeString(item?.city, 120),
              url: sanitizeString(item?.url, 500),
              images: Array.isArray(item?.imageUrls)
                ? item.imageUrls.map((image) => sanitizeString(image, 900)).filter(Boolean).slice(0, 3)
                : [],
            })),
            model,
          },
          event,
        );
      } catch (availabilityError) {
        console.warn("Availability search failed in chat flow", {
          message: availabilityError?.message || String(availabilityError),
        });
        return jsonResponse(
          200,
          {
            reply:
              "I had trouble reaching live availability right now. Please try again in a moment. If this keeps happening, contact reservations@oneluxstay.com and we’ll confirm dates manually.",
            model,
          },
          event,
        );
      }
    }

    if (asksPolicy) {
      let queryEmbedding = null;
      if (apiKey) {
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
        const houseRulesUnitTypeId = sanitizeString(
          listing?.unitTypeId || listing?.id || listing?._id || pageContext?.listingId,
          120,
        );
        const houseRules = houseRulesUnitTypeId
          ? await fetchHouseRulesForChat({
              event,
              unitTypeId: houseRulesUnitTypeId,
            })
          : null;
        const unitReply = buildUnitInfoReply({
          listing,
          question: latestPrompt,
          houseRules,
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
