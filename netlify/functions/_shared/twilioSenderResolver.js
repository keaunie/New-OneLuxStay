const DEFAULT_US_SMS_FROM = "+16188812613";
const DEFAULT_US_WHATSAPP_FROM = "whatsapp:+16188812613";
const DEFAULT_US_VOICE_FROM = "+16188812613";
const DEFAULT_BE_SMS_FROM = "+32460254886";
const DEFAULT_BE_WHATSAPP_FROM = "whatsapp:+32460254886";
const DEFAULT_BE_VOICE_FROM = "+32460254886";

const sanitizeString = (value = "", maxLength = 400) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizeRegion = (value = "") => {
  const normalized = sanitizeString(value, 120).toLowerCase();
  if (!normalized) return "";
  if (["us", "usa", "united states", "unitedstates", "america", "na"].includes(normalized)) return "us";
  if (["be", "belgium", "belgique", "belgie", "eu"].includes(normalized)) return "be";
  return "";
};

export const normalizePhoneNumber = (value = "") => {
  const raw = sanitizeString(value, 120);
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return `${hasPlus ? "+" : ""}${digits}`;
};

export const normalizeWhatsAppAddress = (value = "") => {
  const raw = sanitizeString(value, 120);
  if (!raw) return "";
  const noPrefix = raw.replace(/^whatsapp:/i, "");
  const digits = normalizePhoneNumber(noPrefix);
  if (!digits) return "";
  return `whatsapp:${digits}`;
};

export const inferRegionFromNumber = (value = "") => {
  const digits = normalizePhoneNumber(value).replace(/[^\d]/g, "");
  if (!digits) return "";
  if (digits.startsWith("32")) return "be";
  if (digits.startsWith("1")) return "us";
  return "";
};

export const getRegionBadgeLabel = (region = "") => {
  const normalized = normalizeRegion(region);
  if (normalized === "be") return "BE";
  return "US";
};

const inferRegionFromHints = ({ country = "", guestRegion = "", property = "" } = {}) => {
  const explicit = normalizeRegion(country) || normalizeRegion(guestRegion);
  if (explicit) return explicit;

  const searchable = [country, guestRegion, property]
    .map((value) => sanitizeString(value, 160).toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (!searchable) return "";

  if (/(belgium|antwerp|brussels|ghent|bruges|belgique|belgie)/.test(searchable)) return "be";
  if (/(united states|usa|los angeles|miami|redondo|california|new york|america)/.test(searchable)) return "us";
  return "";
};

const normalizeChannel = (value = "") => {
  const normalized = sanitizeString(value, 40).toLowerCase();
  if (normalized === "voice") return "voice";
  if (normalized === "sms") return "sms";
  return "whatsapp";
};

const unique = (items = []) => [...new Set(items.filter(Boolean))];

export const getTwilioSenderPool = ({ getEnv }) => {
  const read = (name) => sanitizeString(getEnv?.(name), 160);

  const usSms =
    normalizePhoneNumber(read("TWILIO_US_SMS_FROM")) ||
    normalizePhoneNumber(read("TWILIO_SMS_FROM")) ||
    normalizePhoneNumber(read("TWILIO_PHONE_NUMBER")) ||
    normalizePhoneNumber(read("TWILIO_FROM_NUMBER")) ||
    normalizePhoneNumber(DEFAULT_US_SMS_FROM);
  const usWhatsApp =
    normalizeWhatsAppAddress(read("TWILIO_US_WHATSAPP_FROM")) ||
    normalizeWhatsAppAddress(read("TWILIO_WHATSAPP_FROM")) ||
    normalizeWhatsAppAddress(read("TWILIO_WHATSAPP_NUMBER")) ||
    normalizeWhatsAppAddress(DEFAULT_US_WHATSAPP_FROM);
  const usVoice =
    normalizePhoneNumber(read("TWILIO_US_VOICE_FROM")) ||
    normalizePhoneNumber(read("TWILIO_VOICE_FROM")) ||
    normalizePhoneNumber(read("TWILIO_PHONE_NUMBER")) ||
    normalizePhoneNumber(read("TWILIO_FROM_NUMBER")) ||
    normalizePhoneNumber(DEFAULT_US_VOICE_FROM);

  const beSms = normalizePhoneNumber(read("TWILIO_BE_SMS_FROM")) || normalizePhoneNumber(DEFAULT_BE_SMS_FROM);
  const beWhatsApp =
    normalizeWhatsAppAddress(read("TWILIO_BE_WHATSAPP_FROM")) || normalizeWhatsAppAddress(DEFAULT_BE_WHATSAPP_FROM);
  const beVoice = normalizePhoneNumber(read("TWILIO_BE_VOICE_FROM")) || normalizePhoneNumber(DEFAULT_BE_VOICE_FROM);

  return {
    us: { sms: usSms, whatsapp: usWhatsApp, voice: usVoice },
    be: { sms: beSms, whatsapp: beWhatsApp, voice: beVoice },
  };
};

export const resolveSender = ({
  channel = "whatsapp",
  country = "",
  property = "",
  inboundNumber = "",
  guestRegion = "",
  getEnv,
} = {}) => {
  const normalizedChannel = normalizeChannel(channel);
  const pool = getTwilioSenderPool({ getEnv });

  const inboundRegion = inferRegionFromNumber(inboundNumber);
  const requestedRegion = normalizeRegion(country) || normalizeRegion(guestRegion);
  const hintedRegion = inferRegionFromHints({ country, guestRegion, property });

  const regionCandidates = unique([inboundRegion, requestedRegion, hintedRegion, "us", "be"]);

  let chosenRegion = "";
  let from = "";
  regionCandidates.some((candidate) => {
    const resolved = pool?.[candidate]?.[normalizedChannel] || "";
    if (!resolved) return false;
    chosenRegion = candidate;
    from = resolved;
    return true;
  });

  const anyRegion = unique(["us", "be"]).find((candidate) => pool?.[candidate]?.[normalizedChannel]);
  if (!from && anyRegion) {
    chosenRegion = anyRegion;
    from = pool[anyRegion][normalizedChannel];
  }

  const source = inboundRegion
    ? "inbound_number"
    : requestedRegion
      ? "requested_region"
      : hintedRegion
        ? "context_hint"
        : "default";

  return {
    channel: normalizedChannel,
    region: chosenRegion || "us",
    regionLabel: getRegionBadgeLabel(chosenRegion || "us"),
    from,
    source,
    fallbackUsed: source !== "inbound_number" && source !== "requested_region",
    availableSenders: {
      us: pool?.us?.[normalizedChannel] || "",
      be: pool?.be?.[normalizedChannel] || "",
    },
  };
};
