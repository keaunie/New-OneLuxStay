import dotenv from "dotenv";
import defaultConciergeKnowledge from "../../src/data/conciergeKnowledge.js";
import { logAdminsOlsActivity } from "./_shared/adminsOlsActivity.js";
import { getConciergeKnowledgeFromSupabase } from "./_shared/supabaseContentService.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";
import { buildAiCorsHeaders, verifyAiRequest } from "./_shared/aiProtection.js";
import { calculateNights, roundMoney } from "./_shared/pricingService.js";

dotenv.config();

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const OPENAI_EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";
const MAX_MESSAGES = 10;
const DEFAULT_MATCH_RPC = "match_document_sections";
const DEFAULT_AI_DOCS_TABLE = "documents";
const DEFAULT_AI_SECTIONS_TABLE = "sections";
const DEFAULT_CHAT_FEEDBACK_TABLE = "chat_feedback";
const DEFAULT_CHAT_SENTIMENT_TABLE = "chat_sentiment_lessons";
const POLICY_CONTENT_TYPES = [
  "terms_conditions",
  "terms_and_conditions",
  "privacy_policy",
  "california_privacy_policy",
];

const getEnv = (name) => process.env[name] || globalThis.Netlify?.env?.get?.(name);

const parseEnvBoolean = (value, fallback = false) => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
};

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
You are Lucy, the AI concierge for One Lux Stay, a modern aparthotel hospitality brand.

Supported city pages on this website include ${supportedCities.join(", ") || "Antwerp, Los Angeles, Miami, Redondo Beach, Dubai"}, plus a global listings view.

Main goals:
1) Help guests book their stay.
2) Provide clear and accurate information.
3) Deliver a smooth, friendly guest experience.

Tone and style:
- Sound like a warm, helpful hospitality team member.
- Be casual, welcoming, and natural.
- Never robotic, stiff, overly formal, or repetitive.
- Do not say things like "As an AI" or "I am an AI assistant."
- Use simple language and make the conversation feel personal.
- Keep responses concise, usually 2-4 sentences unless a short list is clearly needed.
- If helpful, briefly summarize the answer in a clear and easy-to-read way.
- Keep continuity with prior turns; if the user sends a short follow-up (for example "yes please"), continue the current task using earlier context.
- Infer the guest's emotional tone each turn and adjust the reply calmly, especially for frustrated, anxious, or urgent guests.

Booking assistance rules:
- If a guest asks about availability, price, or rooms for a stay, ask for check-in and check-out dates plus guest count.
- After dates are provided, guide them toward the official secure booking flow/page.
- Always encourage the next booking step when intent is present.
- Do not ask long, stressful, multi-part follow-up questions if simple options would work.
- Prefer offering 2-5 easy choices the guest can pick from, such as Studio, 1 bedroom, 2 bedroom, no preference, or suggested date options.
- If you already have enough information to check options, move forward instead of asking for extra preferences.
- If preferences are optional, say that clearly and offer a simple default like "No preference" so the guest can continue quickly.
- Do not ask about amenities, budget, or extra preferences unless the guest asks for that level of filtering or no good options were found.
- When the guest already gave city, dates, and guest count, go straight to options and booking links.

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
- Write like a real concierge speaking to a guest, not like scripted customer support copy.
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

const sanitizeIdentifier = (value = "", maxLength = 120) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9:_-]/g, "")
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

const retrieveRatedConversationExamples = async ({
  rating = "good",
  limit = 3,
} = {}) => {
  const learningEnabled = parseEnvBoolean(getEnv("SUPABASE_CHAT_LEARNING_ENABLED"), true);
  if (!learningEnabled) return [];

  const feedbackTable = sanitizeString(
    getEnv("SUPABASE_CHAT_FEEDBACK_TABLE") || DEFAULT_CHAT_FEEDBACK_TABLE,
    120,
  );
  if (!feedbackTable) return [];

  try {
    const rows = await supabaseRestRequest(feedbackTable, {
      query: {
        select: "user_message,assistant_message,rating,updated_at",
        rating: `eq.${rating === "bad" ? "bad" : "good"}`,
        order: "updated_at.desc",
        limit: String(Math.max(1, Math.min(6, Number(limit) || 3))),
      },
      timeout: 8_000,
    });

    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => ({
        userMessage: sanitizeString(row?.user_message, 280),
        assistantMessage: sanitizeString(row?.assistant_message, 320),
      }))
      .filter((row) => row.assistantMessage)
      .slice(0, Math.max(1, Math.min(6, Number(limit) || 3)));
  } catch {
    return [];
  }
};

const buildLearningText = ({ goodExamples = [], badExamples = [] } = {}) => {
  const lines = [];

  if (goodExamples.length) {
    lines.push("Team-rated GOOD reply patterns (follow the style and structure):");
    goodExamples.forEach((example, index) => {
      if (example.userMessage) lines.push(`- Good Example ${index + 1} User: ${example.userMessage}`);
      lines.push(`- Good Example ${index + 1} Assistant: ${example.assistantMessage}`);
    });
    lines.push("");
  }

  if (badExamples.length) {
    lines.push("Team-rated BAD reply patterns (avoid these response patterns):");
    badExamples.forEach((example, index) => {
      if (example.userMessage) lines.push(`- Bad Example ${index + 1} User: ${example.userMessage}`);
      lines.push(`- Bad Example ${index + 1} Assistant: ${example.assistantMessage}`);
    });
    lines.push("");
  }

  return lines.join("\n").trim();
};

const retrieveSentimentLessons = async ({ limit = 6 } = {}) => {
  const sentimentTable = sanitizeString(
    getEnv("SUPABASE_CHAT_SENTIMENT_TABLE") || DEFAULT_CHAT_SENTIMENT_TABLE,
    120,
  );
  if (!sentimentTable) return [];

  try {
    const rows = await supabaseRestRequest(sentimentTable, {
      query: {
        select:
          "title,sentiment_label,trigger_text,response_guidance,example_user_message,example_assistant_style,updated_at",
        active: "eq.true",
        order: "updated_at.desc",
        limit: String(Math.max(1, Math.min(8, Number(limit) || 6))),
      },
      timeout: 8_000,
    });

    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => ({
        title: sanitizeString(row?.title, 160),
        sentimentLabel: sanitizeString(row?.sentiment_label, 40).toLowerCase(),
        triggerText: sanitizeString(row?.trigger_text, 360),
        responseGuidance: sanitizeString(row?.response_guidance, 360),
        exampleUserMessage: sanitizeString(row?.example_user_message, 220),
        exampleAssistantStyle: sanitizeString(row?.example_assistant_style, 260),
      }))
      .filter((row) => row.responseGuidance)
      .slice(0, Math.max(1, Math.min(8, Number(limit) || 6)));
  } catch {
    return [];
  }
};

const buildSentimentLearningText = (lessons = []) => {
  if (!Array.isArray(lessons) || !lessons.length) return "";

  const lines = [
    "Admin sentiment coaching (infer the guest's tone and adapt the reply style):",
  ];

  lessons.forEach((lesson, index) => {
    const label = sanitizeString(lesson?.sentimentLabel, 40).toUpperCase() || "GENERAL";
    const title = sanitizeString(lesson?.title, 160);
    lines.push(`- Sentiment Lesson ${index + 1}${title ? ` (${title})` : ""} [${label}]`);
    if (lesson?.triggerText) lines.push(`  Trigger signs: ${lesson.triggerText}`);
    lines.push(`  Preferred response: ${lesson.responseGuidance}`);
    if (lesson?.exampleUserMessage) lines.push(`  Example guest message: ${lesson.exampleUserMessage}`);
    if (lesson?.exampleAssistantStyle) lines.push(`  Example reply style: ${lesson.exampleAssistantStyle}`);
  });
  lines.push("");

  return lines.join("\n").trim();
};

const SENTIMENT_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "also",
  "and",
  "any",
  "are",
  "been",
  "before",
  "being",
  "book",
  "booking",
  "bookings",
  "can",
  "could",
  "dont",
  "from",
  "have",
  "here",
  "into",
  "just",
  "know",
  "more",
  "need",
  "please",
  "really",
  "reservation",
  "reservations",
  "still",
  "than",
  "that",
  "their",
  "them",
  "then",
  "they",
  "this",
  "want",
  "with",
  "would",
  "your",
]);

const tokenizeSentimentText = (value = "", maxTokens = 48) =>
  sanitizeString(value, 700)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !SENTIMENT_STOP_WORDS.has(token))
    .slice(0, maxTokens);

const countTokenOverlap = (sourceTokens = [], candidateTokens = []) => {
  if (!sourceTokens.length || !candidateTokens.length) return 0;
  const source = new Set(sourceTokens);
  const candidate = new Set(candidateTokens);
  let matches = 0;
  source.forEach((token) => {
    if (candidate.has(token)) matches += 1;
  });
  return matches;
};

const inferGuestSentimentLabel = (value = "") => {
  const source = String(value || "").toLowerCase();
  if (!source.trim()) return "neutral";

  const negativePatterns = [
    /\b(already paid|still don t know|still don't know|not confirmed|haven t received|haven't received|have not received)\b/,
    /\b(stress|stressful|frustrat|upset|worried|concerned|anxious|urgent|asap|problem|issue|mismatch|wrong)\b/,
    /\b(cancel|refund|charged|charge|waiting|delayed|unhappy|angry|confused|missing)\b/,
  ];
  if (negativePatterns.some((pattern) => pattern.test(source))) return "negative";

  const positivePatterns = [
    /\b(thanks|thank you|perfect|great|awesome|amazing|love|excellent)\b/,
    /\b(excited|happy|wonderful)\b/,
  ];
  if (positivePatterns.some((pattern) => pattern.test(source))) return "positive";

  return "neutral";
};

const extractReplyLeadSentence = (value = "") => {
  const text = sanitizeString(value, 220);
  if (!text) return "";
  const match = text.match(/^[^.!?]+[.!?]?/);
  return sanitizeString(match?.[0] || text, 160);
};

const defaultAcknowledgementBySentimentByLocale = {
  en: {
    negative: "I understand why that feels stressful.",
    positive: "Happy to help with that.",
    neutral: "",
  },
  ja: {
    negative: "ご不安なお気持ち、よく分かります。",
    positive: "承知しました。お手伝いします。",
    neutral: "お問い合わせありがとうございます。",
  },
  ar: {
    negative: "أتفهم لماذا قد يكون ذلك مزعجا.",
    positive: "يسعدني مساعدتك.",
    neutral: "شكرا لرسالتك.",
  },
  nl: {
    negative: "Ik snap dat dat stressvol kan voelen.",
    positive: "Graag help ik je daarmee.",
    neutral: "Dank je voor je bericht.",
  },
  fr: {
    negative: "Je comprends que cela puisse etre stressant.",
    positive: "Je peux vous aider avec plaisir.",
    neutral: "Merci pour votre message.",
  },
};

const findBestSentimentLesson = ({ latestUserMessage = "", lessons = [] } = {}) => {
  if (!Array.isArray(lessons) || !lessons.length) {
    return {
      inferredLabel: inferGuestSentimentLabel(latestUserMessage),
      lesson: null,
    };
  }

  const inferredLabel = inferGuestSentimentLabel(latestUserMessage);
  const userTokens = tokenizeSentimentText(latestUserMessage);
  const normalizedUserText = sanitizeString(latestUserMessage, 700).toLowerCase();
  let bestLesson = null;
  let bestScore = 0;

  lessons.forEach((lesson) => {
    if (!lesson || typeof lesson !== "object") return;
    const lessonLabel = sanitizeString(lesson.sentimentLabel, 40).toLowerCase();
    const titleTokens = tokenizeSentimentText(lesson.title, 18);
    const triggerTokens = tokenizeSentimentText(lesson.triggerText, 32);
    const exampleTokens = tokenizeSentimentText(lesson.exampleUserMessage, 32);
    const lessonText = [
      lesson.title,
      lesson.triggerText,
      lesson.exampleUserMessage,
      lesson.responseGuidance,
      lesson.exampleAssistantStyle,
    ]
      .map((part) => sanitizeString(part, 260).toLowerCase())
      .filter(Boolean)
      .join(" ");

    let score = 0;
    if (lessonLabel && lessonLabel === inferredLabel) score += 4;
    score += countTokenOverlap(userTokens, titleTokens);
    score += countTokenOverlap(userTokens, triggerTokens) * 2;
    score += countTokenOverlap(userTokens, exampleTokens) * 3;

    if (normalizedUserText && lessonText.includes(normalizedUserText)) score += 6;
    if (
      lesson.exampleUserMessage &&
      normalizedUserText &&
      normalizedUserText.includes(sanitizeString(lesson.exampleUserMessage, 220).toLowerCase())
    ) {
      score += 8;
    }

    if (score > bestScore) {
      bestScore = score;
      bestLesson = lesson;
    }
  });

  if (bestLesson && (bestScore >= 5 || sanitizeString(bestLesson.sentimentLabel, 40).toLowerCase() === inferredLabel)) {
    return { inferredLabel, lesson: bestLesson };
  }

  const sameLabelLessons = lessons.filter(
    (lesson) => sanitizeString(lesson?.sentimentLabel, 40).toLowerCase() === inferredLabel,
  );
  if (inferredLabel === "negative" && sameLabelLessons.length === 1) {
    return { inferredLabel, lesson: sameLabelLessons[0] };
  }

  return { inferredLabel, lesson: null };
};

const buildSentimentAwareReply = ({
  reply = "",
  latestUserMessage = "",
  lessons = [],
  languageCode = "en",
} = {}) => {
  const baseReply = String(reply || "").trim();
  if (!baseReply) return "";

  const { inferredLabel, lesson } = findBestSentimentLesson({
    latestUserMessage,
    lessons,
  });

  const locale = sanitizeString(languageCode, 12).toLowerCase() || "en";
  const defaults = defaultAcknowledgementBySentimentByLocale[locale] || defaultAcknowledgementBySentimentByLocale.en;
  const lessonLead = extractReplyLeadSentence(lesson?.exampleAssistantStyle || "");
  const useLessonLead = lessonLead && (locale === "en" || /[^\u0000-\u007f]/.test(lessonLead));
  const acknowledgement = (useLessonLead ? lessonLead : defaults?.[inferredLabel]) || "";
  if (!acknowledgement) return baseReply;

  const normalizedReply = baseReply.toLowerCase();
  const normalizedAcknowledgement = acknowledgement.toLowerCase();
  if (normalizedReply.startsWith(normalizedAcknowledgement)) {
    return baseReply;
  }

  const separator = baseReply.includes("\n") ? "\n\n" : " ";
  return `${acknowledgement}${separator}${baseReply}`.trim();
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
      return "";
    case "insufficient_quota":
      return "";
    case "rate_limit":
      return "";
    case "timeout":
      return "";
    default:
      return "";
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

const isPriceQuestion = (text = "") =>
  /\b(price|pricing|rate|rates|cost|how much|nightly|per night|daily rate|daily price|price per night)\b/i.test(
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

const isSmallTalkPrompt = (text = "") => {
  const source = String(text || "").trim();
  if (!source) return false;
  const lower = source.toLowerCase();

  // English
  if (
    /^(hi|hello|hey|yo|good (morning|afternoon|evening))\b/.test(lower) ||
    /\b(how are you|how r u|hru|what's up|whats up)\b/.test(lower)
  ) {
    return true;
  }

  // Japanese
  if (/(こんにちは|こんばんは|おはよう|もしもし|元気|お元気|調子|はじめまして|よろしく)/.test(source)) {
    return true;
  }

  // Arabic (basic)
  if (/(مرحبا|السلام عليكم|كيف حالك|شلونك)/.test(source)) return true;

  return false;
};

const hasSensitivePaymentData = (text = "") => {
  const source = String(text || "");
  return /\b(credit card|card number|cvv|cvc|expiration|expiry|exp date|password|passcode)\b/i.test(source);
};

const isBookingStatusQuestion = (text = "") => {
  const source = String(text || "");
  // Lightweight non-English signals (so booking-status intent works even without prompt translation).
  if (/[予約][^ ]*(状況|確認|コード|番号)/.test(source) || /予約状況|予約確認/.test(source)) return true;
  if (/(حجز|الحجز|حجزي|رقم الحجز|تأكيد الحجز|حالة الحجز)/i.test(source)) return true;

  const hasBookingContext = /\b(booking|reservation|confirmation)\b/i.test(source);
  if (!hasBookingContext) return false;

  if (
    /\b(my booking|my reservation|our booking|our reservation|reservation status|booking status|another reservation|other reservation|different reservation)\b/i.test(
      source,
    )
  ) {
    return true;
  }

  const hasStatusIntent =
    /\b(status|confirmed|track|lookup|find|where is|check my|check this|check that|check another|check other)\b/i.test(
      source,
    );
  const hasCodeReference = /\b(code|id|number|res\.?)\b/i.test(source);
  const hasCheckVerbWithBookingObject =
    /\b(check|lookup|find|track|show)\b/i.test(source) &&
    /\b(booking|reservation|confirmation)\b/i.test(source);
  return hasStatusIntent || hasCodeReference || hasCheckVerbWithBookingObject;
};

const hasExistingBookingContext = (text = "") =>
  /\b(already booked|already have (a )?(booking|reservation)|our booking|my booking|my reservation|reservation|confirmation|confirmed booking|booking code|reservation code)\b/i.test(
    String(text || ""),
  );

const parseGuestsFromText = (text = "") => {
  const source = String(text || "").toLowerCase();
  const parseCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return null;
    return Math.min(16, parsed);
  };

  const numericMatch = source.match(
    /\b(\d{1,2})\s*(guest|guests|adult|adults|people|pax|person|persons|traveler|travelers|traveller|travellers)\b/,
  );
  if (numericMatch) {
    return parseCount(numericMatch[1]);
  }

  const partyMatch = source.match(/\bparty of\s+(\d{1,2})\b/);
  if (partyMatch) {
    return parseCount(partyMatch[1]);
  }

  const wordToNumber = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
  };
  const wordMatch = source.match(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(guest|guests|adult|adults|people|pax|person|persons|traveler|travelers|traveller|travellers)\b/,
  );
  if (wordMatch) {
    const mapped = wordToNumber[wordMatch[1]];
    return parseCount(mapped);
  }

  return null;
};

const extractBedroomPreferenceFromText = (text = "") => {
  const source = String(text || "").toLowerCase();
  if (!source) return null;

  if (/\b(no preference|flexible|anything works|any room|any option|whatever works)\b/.test(source)) {
    return { kind: "any", bedrooms: null, label: "no preference" };
  }

  if (/\bstudio\b/.test(source)) {
    return { kind: "studio", bedrooms: 0, label: "studio" };
  }

  const numericMatch = source.match(/\b([1-6])\s*(?:bed(?:room)?s?|br)\b/);
  if (numericMatch) {
    const bedrooms = Number(numericMatch[1]);
    if (Number.isFinite(bedrooms) && bedrooms > 0) {
      return {
        kind: "bedroom",
        bedrooms,
        label: `${bedrooms} bedroom${bedrooms > 1 ? "s" : ""}`,
      };
    }
  }

  const wordMap = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
  };
  const wordMatch = source.match(/\b(one|two|three|four|five|six)\s+bed(?:room)?s?\b/);
  if (wordMatch) {
    const bedrooms = wordMap[wordMatch[1]] || 0;
    if (bedrooms > 0) {
      return {
        kind: "bedroom",
        bedrooms,
        label: `${bedrooms} bedroom${bedrooms > 1 ? "s" : ""}`,
      };
    }
  }

  return null;
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
  const source = String(prompt || "");
  const now = new Date();
  const monthDayRangeRegex = new RegExp(
    `\\b${MONTH_NAME_PATTERN}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(20\\d{2}))?\\s*(?:to|through|thru|until|till|[-–])\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    "i",
  );
  const monthDayRangeMatch = source.match(monthDayRangeRegex);
  if (monthDayRangeMatch) {
    const month = monthToNumber(monthDayRangeMatch[1]);
    const checkInDay = Number(monthDayRangeMatch[2]);
    const explicitYear = monthDayRangeMatch[3] || "";
    const checkOutDay = Number(monthDayRangeMatch[4]);
    const year = inferYearForMonthDay({
      month,
      day: checkInDay,
      explicitYear,
      now,
    });
    const checkIn = toIsoDate(year, month, checkInDay);
    const checkOut = toIsoDate(year, month, checkOutDay);
    if (isValidIsoDate(checkIn) && isValidIsoDate(checkOut) && checkIn < checkOut) {
      return { checkIn, checkOut };
    }
  }

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

const buildQuickReply = (item = {}) => {
  if (!item || typeof item !== "object") return null;
  const { label = "", message = "" } = item;
  const safeLabel = sanitizeString(label, 80);
  const safeMessage = sanitizeString(message || label, 220);
  if (!safeLabel || !safeMessage) return null;
  return {
    id: sanitizeString(`${safeLabel}-${safeMessage}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"), 80),
    label: safeLabel,
    message: safeMessage,
  };
};

const buildQuickReplySet = (items = []) =>
  (Array.isArray(items) ? items : [])
    .map((item) => buildQuickReply(item))
    .filter(Boolean)
    .slice(0, 6);

const getVisibleCities = (supportedCities = []) => {
  const fallbackCities = ["Antwerp", "Los Angeles", "Miami", "Redondo Beach", "Dubai"];
  const source = supportedCities.length ? supportedCities : fallbackCities;
  return [...new Set(source.map((city) => normalizeCityLabel(city)).filter(Boolean))].slice(0, 5);
};

const buildCityQuickReplies = ({ supportedCities = [], prefix = "Check availability in" } = {}) =>
  buildQuickReplySet(
    getVisibleCities(supportedCities).map((city) => ({
      label: city,
      message: `${prefix} ${city}`,
    })),
  );

const buildAvailabilityQuickReplies = ({ city = "" } = {}) => {
  const normalizedCity = normalizeCityLabel(city);
  const locationPhrase = normalizedCity ? ` in ${normalizedCity}` : "";
  const today = new Date();
  const currentDay = today.getDay();
  let daysUntilFriday = (5 - currentDay + 7) % 7;
  if (daysUntilFriday === 0) daysUntilFriday = 7;

  const nextFriday = addDays(today, daysUntilFriday);
  const followingFriday = addDays(nextFriday, 7);
  const nextSunday = addDays(nextFriday, 2);
  const followingSunday = addDays(followingFriday, 2);

  const nextWeekendCheckIn = toIsoFromLocalDate(nextFriday);
  const nextWeekendCheckOut = toIsoFromLocalDate(nextSunday);
  const followingWeekendCheckIn = toIsoFromLocalDate(followingFriday);
  const followingWeekendCheckOut = toIsoFromLocalDate(followingSunday);

  return buildQuickReplySet([
    nextWeekendCheckIn && nextWeekendCheckOut
      ? {
          label: `${formatMonthDayLabel(nextWeekendCheckIn)} - ${formatMonthDayLabel(nextWeekendCheckOut)}`,
          message: `Check availability${locationPhrase} from ${nextWeekendCheckIn} to ${nextWeekendCheckOut} for 2 guests`,
        }
      : null,
    followingWeekendCheckIn && followingWeekendCheckOut
      ? {
          label: `${formatMonthDayLabel(followingWeekendCheckIn)} - ${formatMonthDayLabel(followingWeekendCheckOut)}`,
          message: `Check availability${locationPhrase} from ${followingWeekendCheckIn} to ${followingWeekendCheckOut} for 2 guests`,
        }
      : null,
    {
      label: "This month",
      message: `Check availability${locationPhrase} this month for 2 guests`,
    },
    {
      label: "No preference",
      message: `Show me the best available options${locationPhrase}`,
    },
    {
      label: "1 bedroom",
      message: `Check availability${locationPhrase} for a 1 bedroom`,
    },
    {
      label: "2 bedroom",
      message: `Check availability${locationPhrase} for a 2 bedroom`,
    },
  ]);
};

const buildGuestQuickReplies = ({ city = "", checkIn = "", checkOut = "", bedroomPreference = null } = {}) => {
  const normalizedCity = normalizeCityLabel(city);
  const locationPhrase = normalizedCity ? ` in ${normalizedCity}` : "";
  const datePhrase =
    isValidIsoDate(checkIn) && isValidIsoDate(checkOut) && checkIn < checkOut
      ? ` from ${checkIn} to ${checkOut}`
      : "";
  const roomPhrase =
    bedroomPreference && bedroomPreference.kind !== "any" && bedroomPreference.label
      ? ` for a ${bedroomPreference.label}`
      : "";

  return buildQuickReplySet(
    [1, 2, 3, 4, 5].map((guestCount) => ({
      label: `${guestCount} guest${guestCount > 1 ? "s" : ""}`,
      message: `Check availability${locationPhrase}${datePhrase} for ${guestCount} guest${guestCount > 1 ? "s" : ""}${roomPhrase}`,
    })),
  );
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

const listingMatchesBedroomPreference = (listing = {}, preference = null) => {
  if (!preference || preference.kind === "any") return true;

  const bedrooms = Number(listing?.bedrooms);
  const listingText = [
    listing?.title,
    listing?.nickname,
    listing?.publicDescription?.summary,
    listing?.publicDescription?.space,
    listing?.propertyType,
  ]
    .map((value) => sanitizeString(value, 240).toLowerCase())
    .filter(Boolean)
    .join(" ");

  if (preference.kind === "studio") {
    if (Number.isFinite(bedrooms)) return bedrooms === 0;
    return /\bstudio\b/.test(listingText);
  }

  if (preference.kind === "bedroom" && Number.isFinite(preference.bedrooms)) {
    if (Number.isFinite(bedrooms)) return bedrooms === preference.bedrooms;
    return new RegExp(`\\b${preference.bedrooms}\\s*(?:bed(?:room)?s?|br)\\b`, "i").test(listingText);
  }

  return true;
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

const buildListingPageUrl = ({
  event,
  listing,
  pageContext,
  guests = 1,
  checkIn = "",
  checkOut = "",
} = {}) => {
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
  if (isValidIsoDate(checkIn)) qs.set("checkIn", checkIn);
  if (isValidIsoDate(checkOut)) qs.set("checkOut", checkOut);
  return `${base}${path}?${qs.toString()}`;
};

const buildListingInfoUrl = ({ event, listing, checkIn, checkOut, guests, pageContext }) =>
  buildListingPageUrl({
    event,
    listing,
    pageContext,
    guests,
    checkIn,
    checkOut,
  });

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

const buildFallbackReply = ({ latestUserMessage, pageContext, conciergeKnowledge, supportedCities, languageProfile }) => {
  const prompt = String(latestUserMessage?.content || "").toLowerCase();
  const cityFromPrompt = normalizeCityLabel(extractCityHintFromPrompt(prompt, supportedCities));
  const pageCity = normalizeCityLabel(pageContext.city || "");
  const effectiveCity = cityFromPrompt || pageCity;
  const city = effectiveCity || "One Lux Stay";
  const onListingPage = pageContext.pageType === "listing";
  const onCityPage = pageContext.pageType === "city";
  const visibleCities = supportedCities.length
    ? supportedCities
    : ["Antwerp", "Los Angeles", "Miami", "Redondo Beach", "Dubai"];

  const locale = sanitizeString(languageProfile?.code || "", 12).toLowerCase();
  const supportsBasicLocale = locale === "ar" || locale === "nl" || locale === "fr" || locale === "ja";
  const citiesText = visibleCities.join(", ");
  const currentCitySuffix =
    city && city !== "One Lux Stay" && city !== "Global" ? city : "";

  if (/\b(cities|city|locations|where)\b/.test(prompt)) {
    if (supportsBasicLocale && locale === "ar") {
      return `نوفر حاليا إقامات في ${citiesText}. إذا أحببت، أخبرني ما الأجواء التي تفضلها وسأرشدك لأفضل خيار.`;
    }
    if (supportsBasicLocale && locale === "nl") {
      return `We hebben momenteel verblijven in ${citiesText}. Als je wilt, vertel me welke sfeer je zoekt en dan help ik je de beste keuze te vinden.`;
    }
    if (supportsBasicLocale && locale === "fr") {
      return `Nous proposons actuellement des sejours a ${citiesText}. Si vous le souhaitez, dites-moi quel style vous recherchez et je vous orienterai vers la meilleure option.`;
    }
    if (supportsBasicLocale && locale === "ja") {
      return `現在ご利用いただける滞在先は ${citiesText} です。ご希望の雰囲気や目的（家族旅行、出張など）を教えていただければ、最適な選び方をご案内します。`;
    }
    return `We currently feature stays in ${citiesText}. If you want, tell me which vibe you want most and I can point you toward the best fit.`;
  }

  if (/\b(book|booking|reserve|reservation|checkout)\b/.test(prompt)) {
    if (onListingPage) {
      return "You can usually book directly from this listing page by choosing dates, guest count, reviewing the stay details, and continuing through checkout. If anything looks unclear, I recommend double-checking the listing details and then contacting the One Lux Stay team for confirmation.";
    }

    if (effectiveCity) {
      return `Great choice. I can help with booking in ${effectiveCity}. Share your check-in and check-out dates plus guest count, and I’ll guide you to the best next step.`;
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

    if (effectiveCity) {
      return `Great choice on ${effectiveCity}. Share your check-in and check-out dates plus guest count, and I can guide you to the best next booking step.`;
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

  if (supportsBasicLocale && locale === "ar") {
    return `شكرا لرسالتك. يمكنني المساعدة بالاساسيات الآن. توفر One Lux Stay حاليا إقامات في ${citiesText}${
      currentCitySuffix ? `، وانت تتصفح حاليا ${currentCitySuffix}` : ""
    }. اسألني عن المدن او خطوات الحجز او كيفية استخدام الصفحة التي انت عليها.`;
  }
  if (supportsBasicLocale && locale === "nl") {
    return `Bedankt voor je bericht. Ik kan je nu helpen met de basis. One Lux Stay heeft momenteel verblijven in ${citiesText}${
      currentCitySuffix ? `, en je bekijkt momenteel ${currentCitySuffix}` : ""
    }. Vraag me naar steden, boekingsstappen of hoe je de pagina gebruikt waarop je bent.`;
  }
  if (supportsBasicLocale && locale === "fr") {
    return `Merci pour votre message. Je peux vous aider avec l'essentiel pour le moment. One Lux Stay propose actuellement des sejours a ${citiesText}${
      currentCitySuffix ? `, et vous consultez actuellement ${currentCitySuffix}` : ""
    }. Demandez-moi des infos sur les villes, les etapes de reservation, ou comment utiliser la page sur laquelle vous etes.`;
  }
  if (supportsBasicLocale && locale === "ja") {
    return `メッセージありがとうございます。まずは基本的なご案内が可能です。One Lux Stay では現在 ${citiesText} の滞在先をご用意しています${
      currentCitySuffix ? `（現在は ${currentCitySuffix} を閲覧中です）` : ""
    }。都市の選び方、予約手順、または今見ているページの使い方など、お気軽にご質問ください。`;
  }
  return `I can help with the basics right now. One Lux Stay currently features stays in ${citiesText}${
    currentCitySuffix ? `, and you are currently browsing ${currentCitySuffix}` : ""
  }. Ask me about cities, booking steps, or how to use the page you are on.`;
};

const buildSmallTalkReply = ({ languageProfile, supportedCities = [] } = {}) => {
  const locale = sanitizeString(languageProfile?.code || "", 12).toLowerCase();
  const citiesText = (Array.isArray(supportedCities) && supportedCities.length
    ? supportedCities
    : ["Antwerp", "Los Angeles", "Miami", "Redondo Beach", "Dubai"]
  ).join(", ");

  if (locale === "ja") {
    return `こんにちは。ご連絡ありがとうございます。元気です。\n\nご用件は何でしょうか？空室確認（チェックイン/アウト日と人数）、予約状況（予約コード）、都市選び（${citiesText}）など、基本的なご案内ができます。`;
  }

  if (locale === "ar") {
    return `مرحبا. شكرا لسؤالك. انا بخير.\n\nكيف يمكنني مساعدتك؟ يمكنني المساعدة في التوفر (تواريخ الدخول والخروج وعدد الضيوف)، حالة الحجز (رمز الحجز)، او اختيار المدينة (${citiesText}).`;
  }

  if (locale === "nl") {
    return `Hoi. Goed dat je er bent. Met mij gaat het goed.\n\nWaarmee kan ik helpen? Ik kan beschikbaarheid checken (check-in/check-out en aantal gasten), boekingsstatus (reserveringscode) of je helpen kiezen tussen steden (${citiesText}).`;
  }

  if (locale === "fr") {
    return `Bonjour. Merci, je vais bien.\n\nComment puis-je vous aider? Je peux verifier la disponibilite (dates + voyageurs), le statut de reservation (code), ou vous aider a choisir une ville (${citiesText}).`;
  }

  return `Hi. Thanks for asking, I'm doing well.\n\nHow can I help today? I can check availability (dates + guest count), booking status (reservation code), or help you choose a city (${citiesText}).`;
};

const CHAT_FLOW_VERSION = "intent-tools-gpt-smart-response-v1";

const CHAT_INTENTS = Object.freeze({
  greeting: "greeting",
  booking_status: "booking_status",
  availability: "availability",
  listing_price: "listing_price",
  checkin_checkout_time: "checkin_checkout_time",
  current_time: "current_time",
  policy: "policy",
  unit_info: "unit_info",
  destination_recommendation: "destination_recommendation",
  general_gpt: "general_gpt",
  fallback: "fallback",
});

const CHAT_TOOLS = Object.freeze({
  conversation_opening: "conversation_opening",
  reservation_lookup: "reservation_lookup",
  availability_lookup: "availability_lookup",
  monthly_availability_lookup: "monthly_availability_lookup",
  listing_quote_lookup: "listing_quote_lookup",
  checkin_checkout_policy: "checkin_checkout_policy",
  current_time_lookup: "current_time_lookup",
  policy_lookup: "policy_lookup",
  listing_details_lookup: "listing_details_lookup",
  destination_guide: "destination_guide",
  collect_missing_fields: "collect_missing_fields",
});

const isCurrentTimeQuestion = (text = "") =>
  /\b(what time( is it)?( right now)?|current time|time right now|what'?s the time)\b/i.test(String(text || ""));

const isDestinationRecommendationQuestion = (text = "") =>
  /\b(good place to visit|best place to visit|where should i visit|what should i visit|recommend (a )?(city|place|destination)|what'?s a good place|place to visit)\b/i.test(
    String(text || ""),
  );

const buildCurrentTimeReply = ({ pageContext = {}, supportedCities = [] } = {}) => {
  const city = normalizeCityLabel(pageContext?.city || "");
  const timeZone = city === "Antwerp" ? "Europe/Brussels" : "America/New_York";
  const zoneLabel = timeZone === "Europe/Brussels" ? "Brussels time" : "Eastern time";
  const formatted = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(new Date());

  const citySuffix = city && city !== "Global" ? ` for ${city}` : "";
  const supportedCitiesText = (Array.isArray(supportedCities) && supportedCities.length
    ? supportedCities
    : ["Antwerp", "Los Angeles", "Miami", "Redondo Beach", "Dubai"]
  ).join(", ");

  return `Right now it is ${formatted} (${zoneLabel})${citySuffix}. If you want, I can also help with availability, booking status, or choosing between ${supportedCitiesText}.`;
};

const buildDestinationRecommendationReply = ({ latestUserMessage, conciergeKnowledge, supportedCities = [] } = {}) => {
  const prompt = sanitizeString(latestUserMessage?.content || "", 400).toLowerCase();
  const hasBelgiumSignal = /\b(belgium|belgian|antwerp|antwerpen)\b/.test(prompt);
  const antwerp = (conciergeKnowledge?.cities || []).find((city) => normalizeCityLabel(city?.name) === "Antwerp");

  if (hasBelgiumSignal && antwerp) {
    return `If you're deciding on Belgium, Antwerp is our featured destination there. It's a strong fit for guests who want a stylish, walkable city stay with central access. If you want, I can also help compare Antwerp with ${supportedCities.filter((city) => normalizeCityLabel(city) !== "Antwerp").slice(0, 3).join(", ")}.`;
  }

  const citiesText = (Array.isArray(supportedCities) && supportedCities.length
    ? supportedCities
    : ["Antwerp", "Los Angeles", "Miami", "Redondo Beach", "Dubai"]
  ).join(", ");
  return `I can help you narrow that down. Right now One Lux Stay features stays in ${citiesText}. Tell me the vibe you want most, like beach, walkable city, calm coastal, or upscale luxury, and I’ll point you to the best fit.`;
};

const detectPrimaryIntent = ({
  greetingOnly = false,
  asksBookingStatus = false,
  asksCheckInOutTime = false,
  asksCurrentTime = false,
  isListingPriceQuestion = false,
  asksAvailability = false,
  asksPolicy = false,
  asksUnitInfo = false,
  asksDestinationRecommendation = false,
} = {}) => {
  if (greetingOnly) return CHAT_INTENTS.greeting;
  if (asksBookingStatus) return CHAT_INTENTS.booking_status;
  if (asksCheckInOutTime) return CHAT_INTENTS.checkin_checkout_time;
  if (asksCurrentTime) return CHAT_INTENTS.current_time;
  if (isListingPriceQuestion) return CHAT_INTENTS.listing_price;
  if (asksAvailability) return CHAT_INTENTS.availability;
  if (asksPolicy) return CHAT_INTENTS.policy;
  if (asksUnitInfo) return CHAT_INTENTS.unit_info;
  if (asksDestinationRecommendation) return CHAT_INTENTS.destination_recommendation;
  return CHAT_INTENTS.general_gpt;
};

const buildSmartToolReply = async ({
  apiKey = "",
  model = "gpt-5-mini",
  latestUserMessage,
  languageProfile,
  intent = "",
  tool = "",
  toolReply = "",
} = {}) => {
  const baseReply = sanitizeString(toolReply, 3000);
  if (!apiKey || !baseReply) return baseReply;

  try {
    const response = await fetchWithTimeout(
      OPENAI_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
          max_output_tokens: 500,
          input: [
            "Rewrite the tool result into a clear, warm, concise WhatsApp concierge reply.",
            `Intent: ${sanitizeString(intent, 80) || "general"}`,
            `Tool used: ${sanitizeString(tool, 80) || "none"}`,
            `Guest message: ${sanitizeString(latestUserMessage?.content || latestUserMessage || "", 600)}`,
            `Language instruction: ${buildLanguageReplyInstruction({ languageProfile, latestUserMessage })}`,
            "Preserve all facts exactly. Do not add any new facts. Do not change reservation codes, URLs, listing names, dates in YYYY-MM-DD, times, currencies, or numbers.",
            "If the tool result asks for missing information, keep the reply direct and action-oriented.",
            "Return only the final guest-facing reply text.",
            `Tool result:\n${baseReply}`,
          ].join("\n"),
        }),
      },
      15_000,
    );

    if (!response.ok) return baseReply;
    const payload = await response.json().catch(() => ({}));
    const polished = sanitizeString(extractOutputText(payload), 3000);
    return polished || baseReply;
  } catch {
    return baseReply;
  }
};

const localizeGuestVisibleContent = async ({
  apiKey = "",
  model = "gpt-5-mini",
  latestUserMessage,
  languageProfile,
  reply = "",
  notice = "",
  quickReplies = [],
} = {}) => {
  const guestText = sanitizeString(
    typeof latestUserMessage === "string" ? latestUserMessage : latestUserMessage?.content || "",
    600,
  );
  const shouldTranslate =
    Boolean(apiKey) &&
    Boolean(guestText) &&
    Boolean(languageProfile?.shouldTranslate) &&
    (reply || notice || (Array.isArray(quickReplies) && quickReplies.length));

  if (!shouldTranslate) {
    return { reply, notice, quickReplies };
  }

  try {
    const translationResponse = await fetchWithTimeout(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
        max_output_tokens: 900,
        input: [
          "Translate the One Lux Stay concierge text into the same language as the guest message.",
          'Return valid JSON only using this exact shape: {"reply":"...","notice":"...","quickReplies":[{"label":"...","message":"..."}]}',
          "Keep URLs, reservation codes, listing names, dates in YYYY-MM-DD, times, currencies, and numbers unchanged.",
          "Do not explain the translation. Do not add extra keys.",
          `Guest message language reference: ${guestText}`,
          `Target language hint: ${languageProfile?.label || "same as guest"}`,
          `Payload to translate: ${JSON.stringify({
            reply: sanitizeString(reply, 3000),
            notice: sanitizeString(notice, 300),
            quickReplies: Array.isArray(quickReplies)
              ? quickReplies.map((item) => ({
                  label: sanitizeString(item?.label, 160),
                  message: sanitizeString(item?.message, 260),
                }))
              : [],
          })}`,
        ].join("\n"),
      }),
    }, 20_000);

    if (!translationResponse.ok) return { reply, notice, quickReplies };

    const translationData = await translationResponse.json().catch(() => ({}));
    const translatedText = extractOutputText(translationData);
    const translatedObject = parseJsonObjectFromText(translatedText);
    if (!translatedObject || typeof translatedObject !== "object") {
      // If the model ignored the JSON instruction but returned plain translated text,
      // use it as the translated reply (best-effort) so guests still see their language.
      const plain = sanitizeString(translatedText, 3000);
      if (plain && reply && !plain.trim().startsWith("{")) {
        return { reply: plain, notice, quickReplies };
      }
      return { reply, notice, quickReplies };
    }

    return {
      reply: sanitizeString(translatedObject.reply, 3000) || reply,
      notice: sanitizeString(translatedObject.notice, 300) || notice,
      quickReplies: buildQuickReplySet(translatedObject.quickReplies) || quickReplies,
    };
  } catch {
    return { reply, notice, quickReplies };
  }
};

const respondWithGuestPayload = async ({
  event,
  apiKey = "",
  model = "gpt-5-mini",
  latestUserMessage,
  languageProfile,
  reply = "",
  quickReplies = [],
  notice = "",
  cards,
  mode,
  translateReply = true,
  extra = {},
} = {}) => {
  const localized = await localizeGuestVisibleContent({
    apiKey,
    model,
    latestUserMessage,
    languageProfile,
    reply: translateReply ? reply : "",
    notice,
    quickReplies,
  });

  return jsonResponse(
    200,
    {
      reply: translateReply ? localized.reply || reply : reply,
      ...(Array.isArray(cards) ? { cards } : {}),
      ...(Array.isArray(quickReplies) && quickReplies.length
        ? { quickReplies: localized.quickReplies?.length ? localized.quickReplies : quickReplies }
        : {}),
      ...(mode ? { mode } : {}),
      ...(notice || localized.notice ? { notice: localized.notice || notice } : {}),
      ...(model ? { model } : {}),
      languageCode: languageProfile?.code || "en",
      languageLabel: languageProfile?.label || "English",
      ...extra,
    },
    event,
  );
};

const respondWithIntentPayload = async ({
  event,
  apiKey = "",
  model = "gpt-5-mini",
  latestUserMessage,
  languageProfile,
  intent = CHAT_INTENTS.general_gpt,
  tool = "",
  reply = "",
  quickReplies = [],
  notice = "",
  cards,
  mode,
  translateReply = true,
  smarten = false,
  extra = {},
} = {}) => {
  const finalReply = smarten
    ? await buildSmartToolReply({
        apiKey,
        model,
        latestUserMessage,
        languageProfile,
        intent,
        tool,
        toolReply: reply,
      })
    : reply;

  return respondWithGuestPayload({
    event,
    apiKey,
    model,
    latestUserMessage,
    languageProfile,
    reply: finalReply,
    quickReplies,
    notice,
    cards,
    mode,
    translateReply,
    extra: {
      intent,
      tool: tool || null,
      responseFlow: CHAT_FLOW_VERSION,
      ...extra,
    },
  });
};

const fallbackResponse = ({
  event,
  latestUserMessage,
  pageContext,
  chatSessionId = "",
  messages = [],
  reason,
  conciergeKnowledge,
  supportedCities,
  sentimentLessons = [],
  languageProfile,
  apiKey = "",
  model = "gpt-5-mini",
}) => {
  const locale = sanitizeString(languageProfile?.code || "", 12).toLowerCase();
  const skipLocalization = locale === "ar" || locale === "nl" || locale === "fr" || locale === "ja";

  const fallbackReply = buildFallbackReply({
    latestUserMessage,
    pageContext,
    reason,
    conciergeKnowledge,
    supportedCities,
    languageProfile,
  });
  const baseReply = skipLocalization
    ? fallbackReply
    : buildSentimentAwareReply({
        reply: fallbackReply,
        latestUserMessage: latestUserMessage?.content || "",
        lessons: sentimentLessons,
      });

  return buildFallbackOrAttentionResponse({
    event,
    latestUserMessage,
    pageContext,
    chatSessionId,
    messages,
    reason,
    reply: baseReply,
    languageProfile,
    apiKey: skipLocalization ? "" : apiKey,
    model,
  });
};

const normalizeComparableReply = (value = "") =>
  sanitizeString(value, 1200)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isGenericFallbackText = (value = "") => {
  const normalized = normalizeComparableReply(value);
  if (!normalized) return false;
  return (
    normalized.includes("i can help with the basics right now") ||
    normalized.includes("ask me about cities booking steps") ||
    normalized.includes("how to use the page you are on")
  );
};

const shouldEscalateGuestAttention = ({ messages = [], reply = "" } = {}) => {
  const normalizedReply = normalizeComparableReply(reply);
  if (!normalizedReply) return false;

  const assistantReplies = (messages || [])
    .filter((message) => message?.role === "assistant")
    .map((message) => normalizeComparableReply(message?.content || ""))
    .filter(Boolean);

  const identicalReplyCount = assistantReplies.filter((entry) => entry === normalizedReply).length;
  const genericFallbackCount = assistantReplies.filter((entry) => isGenericFallbackText(entry)).length;

  return identicalReplyCount >= 1 || genericFallbackCount >= 2;
};

const hasRecentAttentionHandoff = (messages = []) =>
  (messages || [])
    .filter((message) => message?.role === "assistant")
    .some((message) =>
      /flagged this conversation for our team|one of our team members has been notified|gemarkeerd voor ons team|signale cette conversation|cette conversation a notre equipe|チームに共有しました|担当チームに共有しました|قمت بالإشارة إلى هذه المحادثة|اشعار فريق الادارة/i.test(
        String(message?.content || ""),
      ),
    );

const buildAttentionReply = ({ latestUserMessage, pageContext, languageProfile }) => {
  const city = sanitizeString(pageContext?.city || "", 120);
  const locale = sanitizeString(languageProfile?.code || "", 12).toLowerCase();
  const citySuffix = city ? ` in ${city}` : "";

  if (locale === "ar") {
    return `شكرا لصبرك. حتى لا أكرر نفس الرد، قمت بتحويل هذه المحادثة لفريقنا${
      city ? ` في ${city}` : ""
    } ليراجعوا طلبك ويردوا عليك بمساعدة أدق. إذا كان سؤالك عن حالة الحجز، أرسل رمز الحجز فقط. وإذا كان عن التوفر، أرسل تواريخ الدخول والخروج وعدد الضيوف.`;
  }
  if (locale === "nl") {
    return `Dank je voor je geduld. Om te voorkomen dat ik hetzelfde antwoord blijf herhalen, heb ik dit gesprek doorgestuurd naar ons team${citySuffix} zodat iemand je aanvraag kan bekijken en je gerichter kan helpen. Gaat het om boekingsstatus? Stuur dan alleen je reserveringscode. Gaat het om beschikbaarheid? Stuur je check-in/check-out en het aantal gasten.`;
  }
  if (locale === "fr") {
    return `Merci pour votre patience. Pour eviter de repeter la meme reponse, j'ai transmis cette conversation a notre equipe${citySuffix} afin qu'un admin puisse examiner votre demande et vous aider plus precisement. Si c'est pour le statut de reservation, envoyez seulement votre code de reservation. Si c'est pour la disponibilite, envoyez vos dates d'arrivee/depart et le nombre de voyageurs.`;
  }
  if (locale === "ja") {
    return `お待たせしてすみません。同じ返答を繰り返さないよう、この会話を担当チーム${city ? `（${city}）` : ""}に共有しました。内容を確認して、より的確にご案内します。予約状況の確認なら予約コードのみ、空室確認ならチェックイン/アウト日と人数を教えてください。`;
  }

  return `Thanks for your patience. To avoid repeating the same unhelpful reply, I’ve flagged this conversation for our team${citySuffix} so an admin can review and follow up with more specific help. If this is about booking status, please share your reservation code only. If it’s about availability, share your check-in/check-out dates and guest count.`;
};

const notifyAdminsOfGuestAttention = async ({
  event,
  chatSessionId = "",
  pageContext = {},
  latestUserMessage = {},
  reason = "",
} = {}) => {
  await logAdminsOlsActivity({
    event,
    actor: {
      id: "ai_concierge",
      fullName: "AI Concierge",
      email: "ai-concierge@internal.oneluxstay",
    },
    authMode: "system",
    eventType: "guest_attention_needed",
    message: "AI concierge flagged a guest conversation for admin attention.",
    details: {
      sessionId: sanitizeIdentifier(chatSessionId, 120) || null,
      city: sanitizeString(pageContext?.city, 120) || null,
      pageType: sanitizeString(pageContext?.pageType, 80) || null,
      listingId: sanitizeString(pageContext?.listingId, 120) || null,
      reason: sanitizeString(reason, 80) || "fallback_loop",
      latestUserMessage: sanitizeString(latestUserMessage?.content, 220) || null,
    },
  });
};

const buildFallbackOrAttentionResponse = async ({
  event,
  latestUserMessage,
  pageContext,
  chatSessionId = "",
  messages = [],
  reason = "",
  reply = "",
  languageProfile,
  apiKey = "",
  model = "gpt-5-mini",
}) => {
  const shouldEscalate =
    isGenericFallbackText(reply) &&
    shouldEscalateGuestAttention({ messages, reply }) &&
    !hasRecentAttentionHandoff(messages);

  if (shouldEscalate) {
    await notifyAdminsOfGuestAttention({
      event,
      chatSessionId,
      pageContext,
      latestUserMessage,
      reason,
    }).catch(() => null);

    const locale = sanitizeString(languageProfile?.code || "", 12).toLowerCase();
    const skipLocalization = locale === "ar" || locale === "nl" || locale === "fr" || locale === "ja";
    const localizedNotice =
      locale === "ar"
        ? "تم اشعار فريق الادارة للمتابعة."
        : locale === "nl"
          ? "Adminteam is op de hoogte gebracht voor opvolging."
          : locale === "fr"
            ? "L'equipe admin a ete informee pour un suivi."
            : locale === "ja"
              ? "管理チームに共有しました。フォローアップいたします。"
            : "Admin team notified for follow-up.";

    return respondWithGuestPayload({
      event,
      apiKey: skipLocalization ? "" : apiKey,
      model,
      latestUserMessage,
      languageProfile,
      reply: buildAttentionReply({ latestUserMessage, pageContext, languageProfile }),
      mode: "needs_attention",
      notice: localizedNotice,
    });
  }

  return respondWithGuestPayload({
    event,
    apiKey,
    model,
    latestUserMessage,
    languageProfile,
    reply,
    mode: "fallback",
    notice: fallbackNoticeFromReason(reason),
  });
};

const formatTranscript = (messages) =>
  messages
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n");

const buildInput = ({
  pageContext,
  messages,
  knowledgeText,
  retrievedPolicyText = "",
  learningText = "",
  sentimentLearningText = "",
  languageInstruction = "",
}) => {
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
    sentimentLearningText ? `Sentiment coaching:\n${sentimentLearningText}` : "",
    learningText ? `Feedback-based coaching:\n${learningText}` : "",
    retrievedPolicyText ? `Retrieved policy knowledge:\n${retrievedPolicyText}` : "",
    "Current website context:",
    ...contextLines,
    "",
    "Conversation so far:",
    formatTranscript(messages),
    "",
    languageInstruction ? `Language instruction: ${languageInstruction}` : "",
    "Reply to the latest user message as Lucy, the One Lux Stay concierge.",
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
  bedroomPreference = null,
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
  const cityScopedListings = normalizedRequestedCity && normalizedRequestedCity !== "global"
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
  const candidateListings = cityScopedListings.filter((listing) =>
    listingMatchesBedroomPreference(listing, bedroomPreference),
  );

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

  const preview = matches.slice(0, 3);
  const lines = [
    `I checked available check-in dates in ${label} for ${safeGuests} guest${safeGuests > 1 ? "s" : ""}.`,
    `I found ${matches.length} unit${matches.length > 1 ? "s" : ""} with open dates.`,
    "",
  ];

  preview.forEach((item, index) => {
    const title = sanitizeString(item?.title, 220) || `Unit ${item?.id || index + 1}`;
    const city = sanitizeString(item?.city, 120);
    const ranges = formatAvailabilityDateRanges(item?.availableDates, 8) || "No open dates found";

    lines.push(`- ${title}${city ? ` (${city})` : ""}: ${ranges}`);
  });

  if (matches.length > preview.length) {
    lines.push(`- +${matches.length - preview.length} more option${matches.length - preview.length > 1 ? "s" : ""} shown below`);
  }

  if (searched > matches.length) {
    lines.push(`I checked ${searched} candidate unit${searched > 1 ? "s" : ""}.`);
  }

  lines.push("");
  lines.push("Open any card below to view photos and continue booking.");
  lines.push("These date signals can still be affected by minimum-night rules.");
  return lines.join("\n");
};

const buildAvailabilityLinksReply = ({ checkIn, checkOut, guests, bedroomPreference = null, matches = [], searched = 0 }) => {
  const roomLabel =
    bedroomPreference && bedroomPreference.kind !== "any" && bedroomPreference.label
      ? `${bedroomPreference.label} `
      : "";
  if (!Array.isArray(matches) || !matches.length) {
    return `I checked ${roomLabel}availability for ${checkIn} to ${checkOut} (${guests} guest${guests > 1 ? "s" : ""}) and I could not find a match right now. If you want, I can try another date range or show the best options with no room preference.`;
  }

  const preview = matches.slice(0, 3);
  const lines = [
    `Great news. I found ${matches.length} available ${roomLabel}unit${matches.length > 1 ? "s" : ""} for ${checkIn} to ${checkOut} (${guests} guest${guests > 1 ? "s" : ""}).`,
  ];

  lines.push("");
  preview.forEach((item, index) => {
    const title = sanitizeString(item?.title, 220) || `Unit ${item?.id || index + 1}`;
    const city = sanitizeString(item?.city, 120);
    lines.push(`- ${title}${city ? ` (${city})` : ""}`);
  });

  if (matches.length > preview.length) {
    lines.push(`- +${matches.length - preview.length} more option${matches.length - preview.length > 1 ? "s" : ""} shown below`);
  }

  if (searched > matches.length) {
    lines.push(`I checked ${searched} candidate unit${searched > 1 ? "s" : ""}.`);
  }
  lines.push("");
  lines.push("Open any card below to view details and continue booking.");
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

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const formatMoneyForChat = (amount, currency = "USD") => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return "";
  const normalizedCurrency = sanitizeString(currency || "USD", 12).toUpperCase() || "USD";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  } catch {
    return `${normalizedCurrency} ${numeric.toFixed(2)}`;
  }
};

const extractQuotePricingForChat = (quote = null, { checkIn = "", checkOut = "" } = {}) => {
  if (!quote || typeof quote !== "object") return null;

  const ratePlan = quote?.rates?.ratePlans?.[0] || quote?.ratePlans?.[0] || null;
  const quoteMoney =
    ratePlan?.money?.money ||
    ratePlan?.money ||
    quote?.money?.money ||
    quote?.money ||
    null;
  const quoteDays = Array.isArray(ratePlan?.days) ? ratePlan.days : [];
  const currency = String(
    quoteMoney?.currency || quoteDays[0]?.currency || quote?.currency || "USD",
  ).toUpperCase();
  const nights = quoteDays.length || calculateNights(checkIn, checkOut);

  const breakdown = { accommodation: 0, cleaning: 0, taxes: 0, fees: 0 };
  const invoiceItems = Array.isArray(quoteMoney?.invoiceItems) ? quoteMoney.invoiceItems : [];
  invoiceItems.forEach((item) => {
    const amount = Number(item?.amount);
    if (!Number.isFinite(amount)) return;
    const normalType = String(item?.normalType || item?.type || "").toUpperCase();
    const secondType = String(item?.secondIdentifier || item?.secondType || "").toUpperCase();
    const label = String(item?.title || item?.name || item?.description || "").toUpperCase();
    const isCleaning =
      normalType === "CF" ||
      normalType === "CLEANING_FEE" ||
      /\bCLEAN(ING)?\b/.test(normalType) ||
      /\bCLEAN(ING)?\b/.test(secondType) ||
      /\bCLEAN(ING)?\b/.test(label);
    const isTax =
      normalType === "OCT" ||
      normalType === "TAX" ||
      normalType === "OCCUPANCY_TAX" ||
      /\b(TAX|VAT)\b/.test(normalType) ||
      /\b(TAX|VAT)\b/.test(secondType) ||
      /\b(TAX|VAT)\b/.test(label);

    if (normalType === "AF" || normalType === "ACCOMMODATION_FARE") breakdown.accommodation += amount;
    else if (isCleaning) breakdown.cleaning += amount;
    else if (isTax) breakdown.taxes += amount;
    else breakdown.fees += amount;
  });

  const daySum = quoteDays.reduce((sum, day) => {
    const price = firstFiniteNumber(day?.manualPrice, day?.price, day?.basePrice);
    return sum + (Number.isFinite(price) ? price : 0);
  }, 0);

  const accommodation = firstFiniteNumber(quoteMoney?.fareAccommodation, breakdown.accommodation, daySum) || 0;
  const cleaningFee =
    firstFiniteNumber(
      quoteMoney?.fareCleaning,
      quoteMoney?.cleaning,
      quoteMoney?.cleaningFee,
      breakdown.cleaning,
      0,
    ) || 0;
  const taxes =
    firstFiniteNumber(
      quoteMoney?.fareTaxes,
      quoteMoney?.fareTax,
      quoteMoney?.taxes,
      quoteMoney?.taxAmount,
      quoteMoney?.totalTaxes,
      breakdown.taxes,
      0,
    ) || 0;
  const fees = firstFiniteNumber(breakdown.fees, 0) || 0;
  const nightlyRate =
    firstFiniteNumber(
      quoteDays[0]?.manualPrice,
      quoteDays[0]?.price,
      quoteDays[0]?.basePrice,
      nights > 0 ? accommodation / nights : null,
    ) || 0;
  const total =
    firstFiniteNumber(
      quoteMoney?.totalPrice,
      quoteMoney?.total,
      quote?.total,
      quote?.price?.totalAmount,
      quote?.price?.totalPrice,
      typeof quote?.price?.total === "object" ? quote?.price?.total?.amount : quote?.price?.total,
      accommodation + cleaningFee + taxes + fees,
    ) || 0;

  return {
    currency,
    nights,
    nightlyRate: roundMoney(nightlyRate),
    checkInNightlyRate: roundMoney(
      firstFiniteNumber(quoteDays[0]?.manualPrice, quoteDays[0]?.price, quoteDays[0]?.basePrice, nightlyRate) || 0,
    ),
    cleaningFee: roundMoney(cleaningFee),
    taxes: roundMoney(taxes),
    fees: roundMoney(fees),
    total: roundMoney(total),
  };
};

const LANGUAGE_LABELS = {
  en: "English",
  ja: "Japanese",
  zh: "Chinese",
  ko: "Korean",
  ar: "Arabic",
  he: "Hebrew",
  th: "Thai",
  hi: "Hindi",
  el: "Greek",
  ru: "Russian",
  uk: "Ukrainian",
  tr: "Turkish",
  vi: "Vietnamese",
  es: "Spanish",
  fr: "French",
  pt: "Portuguese",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  id: "Indonesian",
  tl: "Tagalog",
  unknown: "Guest language",
};

// Keep hints ASCII-heavy for reliability; NL/FR/ES matter most for Antwerp/USA guests.
const LATIN_LANGUAGE_HINTS = [
  {
    code: "es",
    pattern:
      /\b(hola|gracias|por favor|buenas|quiero|precio|reserva|reservar|fechas|cuanto|disponible|habitacion|personas)\b/i,
  },
  {
    code: "fr",
    pattern:
      /\b(bonjour|merci|s'il vous plait|svp|reservation|reserver|prix|dates|disponibilite|personnes|chambre)\b/i,
  },
  {
    code: "nl",
    pattern:
      /\b(hallo|hoi|dank je|dankjewel|alsjeblieft|boeking|boeken|reserveren|reservering|prijs|data|datums|beschikbaar|beschikbaarheid|kamer|nachten|gasten)\b/i,
  },
  { code: "de", pattern: /\b(hallo|danke|bitte|buchung|preis|daten|verfuegbar|zimmer|gaeste)\b/i },
  { code: "it", pattern: /\b(ciao|grazie|per favore|prenotazione|prezzo|date|disponibile|camera|persone)\b/i },
  { code: "pt", pattern: /\b(ola|obrigado|obrigada|por favor|reserva|preco|datas|disponivel|quero|pessoas)\b/i },
  { code: "tr", pattern: /\b(merhaba|tesekkur|lutfen|rezervasyon|fiyat|tarih|musait)\b/i },
  { code: "id", pattern: /\b(halo|terima kasih|tolong|pemesanan|harga|tanggal|tersedia|kamar)\b/i },
  { code: "tl", pattern: /\b(kumusta|salamat|pakiusap|reserbasyon|presyo|petsa|kuwarto)\b/i },
];

const hasNonAsciiCharacters = (value = "") => /[^\u0000-\u007f]/.test(String(value || ""));

const buildLanguageProfile = (code = "en", sample = "", confidence = "medium") => {
  const normalizedCode = sanitizeString(code, 12).toLowerCase() || "en";
  const label = LANGUAGE_LABELS[normalizedCode] || LANGUAGE_LABELS.unknown;
  return {
    code: normalizedCode,
    label,
    confidence,
    sample: sanitizeString(sample, 320),
    shouldTranslate:
      normalizedCode !== "en" || (normalizedCode === "unknown" && hasNonAsciiCharacters(sample)),
  };
};

const detectLanguageFromText = (value = "") => {
  const sample = sanitizeString(value, 700);
  if (!sample) return buildLanguageProfile("en", sample, "low");

  if (/[\u3040-\u30ff]/u.test(sample)) return buildLanguageProfile("ja", sample, "high");
  if (/[\uac00-\ud7af]/u.test(sample)) return buildLanguageProfile("ko", sample, "high");
  if (/[\u0600-\u06ff]/u.test(sample)) return buildLanguageProfile("ar", sample, "high");
  if (/[\u0590-\u05ff]/u.test(sample)) return buildLanguageProfile("he", sample, "high");
  if (/[\u0e00-\u0e7f]/u.test(sample)) return buildLanguageProfile("th", sample, "high");
  if (/[\u0900-\u097f]/u.test(sample)) return buildLanguageProfile("hi", sample, "high");
  if (/[\u0370-\u03ff]/u.test(sample)) return buildLanguageProfile("el", sample, "high");
  if (/[\u4e00-\u9fff]/u.test(sample)) return buildLanguageProfile("zh", sample, "high");

  const lower = sample.toLowerCase();
  // Cyrillic: allow translation but don't overfit a specific language.
  if (/[\u0400-\u04ff]/u.test(sample)) {
    return buildLanguageProfile("unknown", sample, "low");
  }

  for (const hint of LATIN_LANGUAGE_HINTS) {
    if (hint.pattern.test(lower)) return buildLanguageProfile(hint.code, sample, "medium");
  }

  if (!hasNonAsciiCharacters(sample)) {
    return buildLanguageProfile("en", sample, "medium");
  }

  return buildLanguageProfile("unknown", sample, "low");
};

const detectGuestLanguageProfile = ({ latestUserMessage, messages = [] } = {}) => {
  const recentUserMessages = [latestUserMessage, ...(messages || []).filter((message) => message?.role === "user")]
    .map((message) => (typeof message === "string" ? message : message?.content || ""))
    .filter(Boolean)
    .slice(0, 4);

  for (const entry of recentUserMessages) {
    const profile = detectLanguageFromText(entry);
    if (profile.shouldTranslate || profile.code === "en") {
      return profile;
    }
  }

  return buildLanguageProfile("en", "", "low");
};

const buildLanguageReplyInstruction = ({ languageProfile, latestUserMessage }) => {
  const guestText = sanitizeString(
    typeof latestUserMessage === "string" ? latestUserMessage : latestUserMessage?.content || "",
    500,
  );
  if (!guestText) return "";
  if (languageProfile?.shouldTranslate) {
    return [
      `Reply in ${languageProfile?.label || "the same language as the guest"} and match the guest's language naturally.`,
      "Do not switch to English unless the guest asks you to.",
      "Keep reservation codes, links, listing names, dates in YYYY-MM-DD, times, currencies, and numbers unchanged.",
    ].join(" ");
  }
  return "Reply in clear natural English unless the guest explicitly asks for another language.";
};

const parseJsonObjectFromText = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return null;

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() || text;
  const firstBraceIndex = candidate.indexOf("{");
  const lastBraceIndex = candidate.lastIndexOf("}");
  if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex <= firstBraceIndex) {
    return null;
  }

  try {
    return JSON.parse(candidate.slice(firstBraceIndex, lastBraceIndex + 1));
  } catch {
    return null;
  }
};

const translatePromptToEnglish = async ({ apiKey = "", model = "gpt-5-mini", text = "" } = {}) => {
  const prompt = sanitizeString(text, 900);
  if (!apiKey || !prompt) return prompt;

  try {
    const response = await fetchWithTimeout(
      OPENAI_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
          max_output_tokens: 160,
          input: [
            "Translate the guest message to English for intent detection.",
            "Return only the translated English text (no JSON, no extra commentary).",
            "Keep reservation codes, listing IDs, URLs, dates in YYYY-MM-DD, times, currencies, and numbers unchanged.",
            `Guest message: ${prompt}`,
          ].join("\n"),
        }),
      },
      12_000,
    );

    if (!response.ok) return prompt;
    const data = await response.json().catch(() => ({}));
    const translated = sanitizeString(extractOutputText(data), 900);
    return translated || prompt;
  } catch {
    return prompt;
  }
};

const fetchListingQuoteForChat = async ({ event, listingId, checkIn, checkOut, guests = 1 }) => {
  const safeListingId = sanitizeString(listingId, 120);
  if (!safeListingId || !isValidIsoDate(checkIn) || !isValidIsoDate(checkOut) || checkIn >= checkOut) return null;

  const requestBody = {
    requests: [
      {
        listingId: safeListingId,
        checkInDateLocalized: checkIn,
        checkOutDateLocalized: checkOut,
        guestsCount: Math.max(1, Number(guests) || 1),
      },
    ],
  };

  const bases = resolveFunctionsBaseCandidates(event, "");
  let lastError = null;

  for (const base of bases) {
    const url = `${base}/check-units/reservations/quotes-bulk`;
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
        30_000,
      );
      const raw = await response.text();
      const payload = raw ? JSON.parse(raw) : {};
      if (!response.ok) {
        lastError = new Error(
          `Quote request failed (${response.status}) for ${url}: ${sanitizeString(
            payload?.message || payload?.error || "",
            240,
          )}`,
        );
        continue;
      }

      const results = payload?.results && typeof payload.results === "object" ? payload.results : {};
      const quote = results[safeListingId] || Object.values(results)[0] || null;
      if (!quote) {
        lastError = new Error(`Quote response did not contain pricing for listing ${safeListingId}`);
        continue;
      }

      return extractQuotePricingForChat(quote, { checkIn, checkOut });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Unable to retrieve quote for listing ${safeListingId}`);
};

const buildListingPriceReply = ({ listing, pricing, checkIn, checkOut, guests = 1 }) => {
  if (!pricing) return "";

  const title = sanitizeString(listing?.title || listing?.nickname, 220) || "This listing";
  const nights = Math.max(1, Number(pricing?.nights) || calculateNights(checkIn, checkOut) || 1);
  const guestCount = Math.max(1, Number(guests) || 1);
  const checkInNightly = formatMoneyForChat(pricing?.checkInNightlyRate, pricing?.currency);
  const averageNightly = formatMoneyForChat(pricing?.nightlyRate, pricing?.currency);
  const total = formatMoneyForChat(pricing?.total, pricing?.currency);
  const cleaningFee = formatMoneyForChat(pricing?.cleaningFee, pricing?.currency);
  const taxes = formatMoneyForChat(pricing?.taxes, pricing?.currency);
  const feeParts = [
    pricing?.cleaningFee > 0 && cleaningFee ? `cleaning ${cleaningFee}` : "",
    pricing?.taxes > 0 && taxes ? `taxes ${taxes}` : "",
  ].filter(Boolean);

  const lines = [];

  if (checkInNightly) {
    lines.push(
      `For ${title}, the live nightly rate for ${checkIn} is currently ${checkInNightly}.`,
    );
  } else if (averageNightly) {
    lines.push(
      `For ${title}, the current nightly rate for your dates is about ${averageNightly}.`,
    );
  }

  lines.push(
    `For ${checkIn} to ${checkOut} (${nights} night${nights > 1 ? "s" : ""}, ${guestCount} guest${guestCount > 1 ? "s" : ""}), the current estimated stay total is ${total || "a live quoted amount"}.`,
  );

  if (averageNightly && averageNightly !== checkInNightly) {
    lines.push(`Across the full stay, the current average nightly rate is ${averageNightly}.`);
  }

  if (feeParts.length) {
    lines.push(`That estimate includes ${feeParts.join(" and ")}.`);
  }

  lines.push("If you want, I can also check another date range, another guest count, or help you continue to checkout.");
  return lines.join("\n");
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
  const chatSessionId = sanitizeIdentifier(payload?.chatSessionId, 120);
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user");

  if (!latestUserMessage) {
    return jsonResponse(400, { error: "A user message is required" }, event);
  }

  const conciergeKnowledge = await getConciergeKnowledge();
  const supportedCities = getSupportedCities(conciergeKnowledge);
  const languageProfile = detectGuestLanguageProfile({ latestUserMessage, messages });
  const knowledgeText = buildKnowledgeText(conciergeKnowledge);
  const siteContext = buildSiteContext(supportedCities);
  const [goodExamples, badExamples, sentimentLessons] = await Promise.all([
    retrieveRatedConversationExamples({ rating: "good", limit: 3 }),
    retrieveRatedConversationExamples({ rating: "bad", limit: 2 }),
    retrieveSentimentLessons({ limit: 6 }),
  ]);
  const learningText = buildLearningText({ goodExamples, badExamples });
  const sentimentLearningText = buildSentimentLearningText(sentimentLessons);

  const apiKey = getEnv("OPENAI_API_KEY");
  const model = getEnv("OPENAI_CHAT_MODEL") || "gpt-5-mini";
  const embeddingModel = getEnv("OPENAI_EMBEDDING_MODEL") || "text-embedding-3-small";

  try {
    let retrievedPolicyText = "";
    const latestPrompt = String(latestUserMessage?.content || "");
    const translatedPromptLocale = sanitizeString(languageProfile?.code || "", 12).toLowerCase();
    const shouldTranslatePromptForIntent =
      Boolean(apiKey) &&
      Boolean(languageProfile?.shouldTranslate) &&
      (translatedPromptLocale === "ar" ||
        translatedPromptLocale === "nl" ||
        translatedPromptLocale === "fr" ||
        translatedPromptLocale === "ja");
    const latestPromptForIntent = shouldTranslatePromptForIntent
      ? await translatePromptToEnglish({ apiKey, model, text: latestPrompt })
      : latestPrompt;
    const languageInstruction = buildLanguageReplyInstruction({
      languageProfile,
      latestUserMessage,
    });
    const buildDeterministicReply = (reply = "") =>
      buildSentimentAwareReply({
        reply,
        latestUserMessage: latestPrompt,
        lessons: sentimentLessons,
        languageCode: languageProfile?.code || "en",
      });
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
    const conversationBedroomPreference =
      userMessagesNewestFirst.map((message) => extractBedroomPreferenceFromText(message)).find(Boolean) || null;
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
    const promptCityHint = extractCityHintFromPrompt(latestPromptForIntent, supportedCities);
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
    const asksPolicy = isPolicyQuestion(latestPromptForIntent);
    const asksUnitInfo = isUnitInfoQuestion(latestPromptForIntent);
    const asksPrice = isPriceQuestion(latestPromptForIntent);
    const asksCheckInOutTime = isCheckInOutTimeQuestion(latestPromptForIntent) || followsUpWithLocationOnly;
    const asksCurrentTime = isCurrentTimeQuestion(latestPromptForIntent);
    const asksDestinationRecommendation = isDestinationRecommendationQuestion(latestPromptForIntent);
    const latestIsAffirmativeFollowup = isAffirmativeFollowup(latestPromptForIntent);
    const previousAssistantOfferedAvailability =
      /\b(availability|available|check[- ]?in|check[- ]?out|dates?|month|book|booking|unit-page links?|city page link|would you like)\b/i.test(
        String(previousAssistantMessage?.content || ""),
      );
    const followUpAvailabilityIntent =
      latestIsAffirmativeFollowup && previousAssistantOfferedAvailability;
    const effectiveMonthRange = monthRange || conversationMonthRange;
    const asksAvailabilityWindow = Boolean(availabilityDateRange || effectiveMonthRange);
    const asksBookingLead = isBookingLeadQuestion(latestPromptForIntent);
    const latestPromptGuestCount = parseGuestsFromText(latestPromptForIntent);
    const latestPromptBedroomPreference = extractBedroomPreferenceFromText(latestPromptForIntent);
    const isListingPriceQuestion =
      Boolean(pageContext?.listingId) &&
      asksPrice &&
      !/\b(availability|available|open units?|which units?|best options?|show me units?|what'?s available)\b/i.test(
        latestPromptForIntent,
      );
    const hasDirectAvailabilityIntent =
      isAvailabilityQuestion(latestPromptForIntent, asksAvailabilityWindow) ||
      (asksBookingLead && !isListingPriceQuestion);
    const hasAvailabilityFollowupSignal =
      followUpAvailabilityIntent ||
      Boolean(promptDateRange) ||
      Boolean(monthRange) ||
      latestPromptGuestCount !== null ||
      Boolean(normalizedPromptCity) ||
      Boolean(latestPromptBedroomPreference);
    const asksAvailability =
      hasDirectAvailabilityIntent ||
      (asksAvailabilityWindow && hasAvailabilityFollowupSignal && !asksPolicy && !asksCheckInOutTime);
    const hasReservationCode = Boolean(reservationCode);
    const asksBookingStatus = isBookingStatusQuestion(latestPromptForIntent) || hasReservationCode;
    const includesSensitivePaymentData = hasSensitivePaymentData(latestPromptForIntent);
    let policyRows = [];

    if (includesSensitivePaymentData) {
      return respondWithGuestPayload({
        event,
        apiKey,
        model,
        latestUserMessage,
        languageProfile,
        reply:
          "For your security, please don't share payment details here. All payments should be completed through our secure booking page.",
      });
    }

    const isGreeting =
      isSmallTalkPrompt(latestPrompt) || isSmallTalkPrompt(latestPromptForIntent);
    const greetingOnly =
      isGreeting &&
      !asksBookingStatus &&
      !asksAvailability &&
      !asksCurrentTime &&
      !isListingPriceQuestion &&
      !asksPolicy &&
      !asksUnitInfo &&
      !Boolean(promptDateRange) &&
      !Boolean(monthRange) &&
      !Boolean(reservationCode) &&
      sanitizeString(latestPrompt, 200).length <= 80;
    const detectedIntent = detectPrimaryIntent({
      greetingOnly,
      asksBookingStatus,
      asksCheckInOutTime,
      asksCurrentTime,
      isListingPriceQuestion,
      asksAvailability,
      asksPolicy,
      asksUnitInfo,
      asksDestinationRecommendation,
    });

    if (greetingOnly) {
      const locale = sanitizeString(languageProfile?.code || "", 12).toLowerCase();
      const quickReplies =
        locale === "ja"
          ? buildQuickReplySet([
              { label: "空室確認", message: "空室を確認したいです" },
              { label: "予約状況", message: "予約状況を確認したいです" },
              { label: "都市一覧", message: "利用できる都市を教えて" },
            ])
          : buildQuickReplySet([
              { label: "Check availability", message: "Check availability" },
              { label: "Booking status", message: "Check my booking status" },
              { label: "Cities", message: "Which cities do you have?" },
            ]);

      return respondWithIntentPayload({
        event,
        apiKey,
        model,
        latestUserMessage,
        languageProfile,
        intent: detectedIntent,
        tool: CHAT_TOOLS.conversation_opening,
        reply: buildSmallTalkReply({ languageProfile, supportedCities }),
        quickReplies,
        smarten: true,
      });
    }

    if (detectedIntent === CHAT_INTENTS.booking_status) {
      if (!reservationCode) {
        const locale = sanitizeString(languageProfile?.code || "", 12).toLowerCase();
        const bookingStatusPrompt =
          locale === "ja"
            ? "予約状況を確認できます。予約コードを教えてください（例: GY-aeDHKynZ）。"
            : locale === "ar"
              ? "يمكنني التحقق من حالة الحجز. من فضلك ارسل رمز الحجز (مثال: GY-aeDHKynZ)."
              : locale === "nl"
                ? "Ik kan je boekingsstatus checken. Stuur je reserveringscode (bijv. GY-aeDHKynZ)."
                : locale === "fr"
                  ? "Je peux verifier le statut de votre reservation. Envoyez votre code de reservation (ex: GY-aeDHKynZ)."
                  : "I can check your booking status. Please share your reservation code (for example: GY-aeDHKynZ).";
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.collect_missing_fields,
          reply: bookingStatusPrompt,
          smarten: true,
        });
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
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.reservation_lookup,
          reply: buildReservationStatusReply({
            reservationCode,
            reservation: reservationForReply,
            supportedCities,
          }),
          smarten: true,
        });
      } catch (reservationError) {
        console.warn("Reservation lookup failed in chat flow", {
          message: reservationError?.message || String(reservationError),
        });
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.reservation_lookup,
          reply:
            "I had trouble reaching the booking status service just now. Please try again in a moment, or contact reservations@oneluxstay.com for immediate help.",
          smarten: true,
        });
      }
    }

    if (detectedIntent === CHAT_INTENTS.checkin_checkout_time && !dateRange && !monthRange) {
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
          return respondWithIntentPayload({
            event,
            apiKey,
            model,
            latestUserMessage,
            languageProfile,
            intent: detectedIntent,
            tool: CHAT_TOOLS.checkin_checkout_policy,
            reply:
              "For your booking, standard check-in is 3:00 PM and check-out is 11:00 AM. If you share your city, I can confirm the location in the same message as well.",
            smarten: true,
          });
        }
        const visibleCities = supportedCities.length
          ? supportedCities
          : ["Los Angeles", "Dubai", "Antwerp"];
        const cityOptions = visibleCities
          .map((city) => normalizeCityLabel(city))
          .filter(Boolean)
          .slice(0, 5)
          .join(", ");
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.collect_missing_fields,
          reply:
            guestAlreadyBooked
              ? `Sure, I can help with that. Which location is your booking in? (${cityOptions})`
              : `Sure, I can help with that. Which location are you planning to book first? (${cityOptions})`,
          quickReplies: buildCityQuickReplies({
            supportedCities,
            prefix: guestAlreadyBooked ? "My booking is in" : "I want to book in",
          }),
          smarten: true,
        });
      }
      return respondWithIntentPayload({
        event,
        apiKey,
        model,
        latestUserMessage,
        languageProfile,
        intent: detectedIntent,
        tool: CHAT_TOOLS.checkin_checkout_policy,
        reply:
          guestAlreadyBooked
            ? `For our units in ${cityForTimeReply}, check-in is 3:00 PM and check-out is 11:00 AM. If you need help with your reservation details, I can help with that next.`
            : `For our units in ${cityForTimeReply}, check-in is 3:00 PM and check-out is 11:00 AM. If you want, I can also help you find available dates and guide you to booking.`,
        smarten: true,
      });
    }

    if (detectedIntent === CHAT_INTENTS.current_time) {
      return respondWithIntentPayload({
        event,
        apiKey,
        model,
        latestUserMessage,
        languageProfile,
        intent: detectedIntent,
        tool: CHAT_TOOLS.current_time_lookup,
        reply: buildCurrentTimeReply({ pageContext, supportedCities }),
        smarten: true,
      });
    }

    if (detectedIntent === CHAT_INTENTS.destination_recommendation) {
      return respondWithIntentPayload({
        event,
        apiKey,
        model,
        latestUserMessage,
        languageProfile,
        intent: detectedIntent,
        tool: CHAT_TOOLS.destination_guide,
        reply: buildDestinationRecommendationReply({
          latestUserMessage,
          conciergeKnowledge,
          supportedCities,
        }),
        smarten: true,
      });
    }

    if (detectedIntent === CHAT_INTENTS.listing_price && pageContext?.listingId) {
      const conversationGuests =
        userMessagesNewestFirst.map((message) => parseGuestsFromText(message)).find((value) => value !== null) ?? null;
      const guests = extractGuests(latestPrompt, conversationGuests ?? 1);

      if (!availabilityDateRange) {
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.collect_missing_fields,
          reply:
            "I can check the live price for this listing. Please share your check-in and check-out dates plus guest count, and I'll tell you the current quoted rate.",
          smarten: true,
        });
      }

      try {
        const listing = await fetchListingForChat({
          event,
          listingId: pageContext.listingId,
        });
        const pricing = await fetchListingQuoteForChat({
          event,
          listingId: pageContext.listingId,
          checkIn: availabilityDateRange.checkIn,
          checkOut: availabilityDateRange.checkOut,
          guests,
        });
        const priceReply = buildListingPriceReply({
          listing,
          pricing,
          checkIn: availabilityDateRange.checkIn,
          checkOut: availabilityDateRange.checkOut,
          guests,
        });

        if (priceReply) {
          return respondWithIntentPayload({
            event,
            apiKey,
            model,
            latestUserMessage,
            languageProfile,
            intent: detectedIntent,
            tool: CHAT_TOOLS.listing_quote_lookup,
            reply: priceReply,
            smarten: true,
          });
        }
      } catch (pricingError) {
        console.warn("Listing price retrieval failed for chat", {
          message: pricingError?.message || String(pricingError),
          listingId: pageContext.listingId,
        });
      }

      return respondWithIntentPayload({
        event,
        apiKey,
        model,
        latestUserMessage,
        languageProfile,
        intent: detectedIntent,
        tool: CHAT_TOOLS.listing_quote_lookup,
        reply:
          "I couldn't confirm the live price for this listing right now. Please try again in a moment, or contact reservations@oneluxstay.com and we'll confirm the exact rate for your dates.",
        smarten: true,
      });
    }

    if (detectedIntent === CHAT_INTENTS.availability) {
      const conversationGuests =
        userMessagesNewestFirst.map((message) => parseGuestsFromText(message)).find((value) => value !== null) ?? null;
      const guests = extractGuests(latestPrompt, conversationGuests ?? 1);
      const availabilityCityHint = promptCityHint || conversationCityHint || pageContextCityHint;
      const availabilityCityLabel = normalizeCityLabel(availabilityCityHint);
      const bedroomPreference = extractBedroomPreferenceFromText(latestPrompt) || conversationBedroomPreference;

      if (!availabilityDateRange && !effectiveMonthRange) {
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.collect_missing_fields,
          reply: availabilityCityLabel
            ? `I'd be happy to help with that for ${availabilityCityLabel}. Please share your check-in and check-out dates plus guest count. Once I have that, I can guide you to the best available option on our secure booking page.`
            : "I'd be happy to help with that. Please share your check-in and check-out dates plus guest count. Once I have that, I can guide you to the best available option on our secure booking page.",
          quickReplies: availabilityCityLabel
            ? buildAvailabilityQuickReplies({ city: availabilityCityLabel })
            : buildCityQuickReplies({
                supportedCities,
                prefix: "Check availability in",
              }),
          smarten: true,
        });
      }

      if (!availabilityCityLabel) {
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.collect_missing_fields,
          reply: "Sure - which city would you like to book in?",
          quickReplies: buildCityQuickReplies({
            supportedCities,
            prefix: "Check availability in",
          }),
          smarten: true,
        });
      }

      if (!effectiveMonthRange && !dateRange && !conversationDateRange && !availabilityDateRange) {
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.collect_missing_fields,
          reply: `Sure - what dates are you looking at for ${availabilityCityLabel}?`,
          quickReplies: buildAvailabilityQuickReplies({ city: availabilityCityLabel }),
          smarten: true,
        });
      }

      if (conversationGuests === null && parseGuestsFromText(latestPrompt) === null) {
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.collect_missing_fields,
          reply: `Perfect - ${availabilityCityLabel}, ${availabilityDateRange?.checkIn || effectiveMonthRange?.label}${availabilityDateRange?.checkOut ? ` to ${availabilityDateRange.checkOut}` : ""}. How many guests?`,
          quickReplies: buildGuestQuickReplies({
            city: availabilityCityLabel,
            checkIn: availabilityDateRange?.checkIn || "",
            checkOut: availabilityDateRange?.checkOut || "",
            bedroomPreference,
          }),
          smarten: true,
        });
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
          return respondWithIntentPayload({
            event,
            apiKey,
            model,
            latestUserMessage,
            languageProfile,
            intent: detectedIntent,
            tool: CHAT_TOOLS.monthly_availability_lookup,
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
            smarten: true,
          });
        } catch (monthAvailabilityError) {
          console.warn("Monthly availability search failed in chat flow", {
            message: monthAvailabilityError?.message || String(monthAvailabilityError),
          });
          return respondWithIntentPayload({
            event,
            apiKey,
            model,
            latestUserMessage,
            languageProfile,
            intent: detectedIntent,
            tool: CHAT_TOOLS.monthly_availability_lookup,
            reply:
              "I had trouble checking month-wide availability right now. Please try again in a moment, or share exact check-in and check-out dates so I can retry with a direct date range.",
            smarten: true,
          });
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
          bedroomPreference,
          maxLinks: 5,
        });
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.availability_lookup,
          reply: buildAvailabilityLinksReply({
            checkIn: availabilityDateRange.checkIn,
            checkOut: availabilityDateRange.checkOut,
            guests,
            bedroomPreference,
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
          quickReplies:
            Array.isArray(availabilityMatches.results) && availabilityMatches.results.length
              ? buildQuickReplySet([
                  {
                    label: "1 bedroom",
                    message: `Check availability in ${availabilityCityLabel} from ${availabilityDateRange.checkIn} to ${availabilityDateRange.checkOut} for ${guests} guests and a 1 bedroom`,
                  },
                  {
                    label: "2 bedroom",
                    message: `Check availability in ${availabilityCityLabel} from ${availabilityDateRange.checkIn} to ${availabilityDateRange.checkOut} for ${guests} guests and a 2 bedroom`,
                  },
                  {
                    label: "No preference",
                    message: `Show me the best available options in ${availabilityCityLabel} from ${availabilityDateRange.checkIn} to ${availabilityDateRange.checkOut} for ${guests} guests`,
                  },
                ])
              : buildQuickReplySet([
                  {
                    label: "No preference",
                    message: `Show me the best available options in ${availabilityCityLabel} from ${availabilityDateRange.checkIn} to ${availabilityDateRange.checkOut} for ${guests} guests`,
                  },
                  {
                    label: "1 bedroom",
                    message: `Check availability in ${availabilityCityLabel} from ${availabilityDateRange.checkIn} to ${availabilityDateRange.checkOut} for ${guests} guests and a 1 bedroom`,
                  },
                  {
                    label: "2 bedroom",
                    message: `Check availability in ${availabilityCityLabel} from ${availabilityDateRange.checkIn} to ${availabilityDateRange.checkOut} for ${guests} guests and a 2 bedroom`,
                  },
                ]),
          smarten: true,
        });
      } catch (availabilityError) {
        console.warn("Availability search failed in chat flow", {
          message: availabilityError?.message || String(availabilityError),
        });
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.availability_lookup,
          reply:
            "I had trouble reaching live availability right now. Please try again in a moment. If this keeps happening, contact reservations@oneluxstay.com and we'll confirm dates manually.",
          smarten: true,
        });
      }
    }

    if (detectedIntent === CHAT_INTENTS.policy) {
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
        return respondWithIntentPayload({
          event,
          apiKey,
          model,
          latestUserMessage,
          languageProfile,
          intent: detectedIntent,
          tool: CHAT_TOOLS.policy_lookup,
          reply: deterministicPolicyReply,
          smarten: true,
        });
      }
    }

    if (detectedIntent === CHAT_INTENTS.unit_info && pageContext?.listingId) {
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
          return respondWithIntentPayload({
            event,
            apiKey,
            model,
            latestUserMessage,
            languageProfile,
            intent: detectedIntent,
            tool: CHAT_TOOLS.listing_details_lookup,
            reply: unitReply,
            smarten: true,
          });
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
        chatSessionId,
        messages,
        reason: "missing_api_key",
        conciergeKnowledge,
        supportedCities,
        sentimentLessons,
        languageProfile,
        apiKey,
        model,
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
        instructions: [siteContext, languageInstruction ? `Language: ${languageInstruction}` : ""]
          .filter(Boolean)
          .join("\n"),
        input: buildInput({
          pageContext,
          messages,
          knowledgeText,
          retrievedPolicyText,
          learningText,
          sentimentLearningText,
          languageInstruction,
        }),
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
          chatSessionId,
          messages,
          reason: errorCode === "insufficient_quota" ? "insufficient_quota" : "rate_limit",
          conciergeKnowledge,
          supportedCities,
          sentimentLessons,
          languageProfile,
          apiKey,
          model,
        });
      }

      if (response.status >= 500 || errorCode === "invalid_api_key") {
        return fallbackResponse({
          event,
          latestUserMessage,
          pageContext,
          chatSessionId,
          messages,
          reason: "service_unavailable",
          conciergeKnowledge,
          supportedCities,
          sentimentLessons,
          languageProfile,
          apiKey,
          model,
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
        chatSessionId,
        messages,
        reason: "service_unavailable",
        conciergeKnowledge,
        supportedCities,
        sentimentLessons,
        languageProfile,
        apiKey,
        model,
      });
    }

    return respondWithGuestPayload({
      event,
      apiKey,
      model,
      latestUserMessage,
      languageProfile,
      reply,
      // If the model responds in English despite instructions, translate as a safety net.
      translateReply: Boolean(languageProfile?.shouldTranslate),
    });
  } catch (error) {
    return fallbackResponse({
      event,
      latestUserMessage,
      pageContext,
      chatSessionId,
      messages,
      reason: error?.name === "AbortError" ? "timeout" : "service_unavailable",
      conciergeKnowledge,
      supportedCities,
      sentimentLessons,
      languageProfile,
      apiKey,
      model,
    });
  }
}

// Optional debug helpers (no runtime impact). Useful for quick local verification in Node.
export const __olsLanguageDebug = {
  detectLanguageFromText,
  detectGuestLanguageProfile,
};
