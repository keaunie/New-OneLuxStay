// Website visitors are anonymous, so the team can only get back to them if Lucy
// collects an email address or phone number. This adds a short request to Lucy's
// reply at the right moments, and thanks the guest when they share one.

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_PATTERN = /(?:\+|00)?\d[\d\s().-]{7,}\d/g;
const TEAM_REQUEST_PATTERN =
  /\b(real person|human|agent|representative|someone from (the|your) team|talk to (someone|a person|the team)|call me|phone me|contact me|reach me|get back to me|front desk|manager)\b/i;
const BOOKING_INTENT_PATTERN = /\b(book|booking|reserve|reservation|price|cost|quote|available|availability)\b/i;

export const findGuestEmail = (text = "") => (String(text).match(EMAIL_PATTERN) || [])[0] || "";

// Phone numbers have at least 9 digits; dates such as 2026-11-20 or 20/11/2026 are removed first.
export const findGuestPhone = (text = "") => {
  const withoutDates = String(text || "").replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g, " ");
  const candidate = (withoutDates.match(PHONE_PATTERN) || []).find((match) => match.replace(/\D/g, "").length >= 9);
  return candidate ? candidate.trim() : "";
};

export const isTeamRequest = (text = "") => TEAM_REQUEST_PATTERN.test(String(text));

const ASK = {
  en: "So our team can get back to you personally as soon as possible, could you share your email address or WhatsApp number?",
  nl: "Zodat ons team je zo snel mogelijk persoonlijk kan antwoorden: wil je je e-mailadres of WhatsApp-nummer delen?",
  fr: "Pour que notre équipe puisse vous recontacter personnellement au plus vite, pouvez-vous partager votre adresse e-mail ou votre numéro WhatsApp ?",
  de: "Damit sich unser Team so schnell wie möglich persönlich bei Ihnen melden kann: Teilen Sie uns Ihre E-Mail-Adresse oder WhatsApp-Nummer mit?",
  es: "Para que nuestro equipo pueda responderte personalmente lo antes posible, ¿podrías compartir tu correo electrónico o número de WhatsApp?",
  it: "Per permettere al nostro team di ricontattarti personalmente il prima possibile, puoi condividere la tua email o il tuo numero WhatsApp?",
  ar: "حتى يتمكن فريقنا من التواصل معك شخصيا في أقرب وقت، هل يمكنك مشاركة بريدك الإلكتروني أو رقم واتساب؟",
  ja: "担当チームからできるだけ早くご連絡できるよう、メールアドレスまたはWhatsApp番号を教えていただけますか？",
};

const THANKS = {
  en: (contact) => `Thank you! Our team will get back to you at ${contact} as soon as possible.`,
  nl: (contact) => `Dank je! Ons team neemt zo snel mogelijk contact met je op via ${contact}.`,
  fr: (contact) => `Merci ! Notre équipe vous recontactera au plus vite à ${contact}.`,
  de: (contact) => `Vielen Dank! Unser Team meldet sich so schnell wie möglich unter ${contact} bei Ihnen.`,
  es: (contact) => `¡Gracias! Nuestro equipo se pondrá en contacto contigo lo antes posible en ${contact}.`,
  it: (contact) => `Grazie! Il nostro team ti ricontatterà il prima possibile a ${contact}.`,
  ar: (contact) => `شكرا لك! سيتواصل معك فريقنا في أقرب وقت على ${contact}.`,
  ja: (contact) => `ありがとうございます！担当チームより ${contact} へできるだけ早くご連絡いたします。`,
};

const MORE_HELP = {
  en: "In the meantime, is there anything else I can help you with?",
  nl: "Kan ik je ondertussen nog ergens anders mee helpen?",
  fr: "En attendant, puis-je vous aider pour autre chose ?",
  de: "Kann ich Ihnen in der Zwischenzeit noch bei etwas anderem helfen?",
  es: "Mientras tanto, ¿puedo ayudarte con algo más?",
  it: "Nel frattempo, posso aiutarti con qualcos'altro?",
  ar: "في هذه الأثناء، هل يمكنني مساعدتك في شيء آخر؟",
  ja: "その間、ほかにお手伝いできることはありますか？",
};

const pick = (table, language) => table[language] || table.en;
const askedBefore = (content = "") => Object.values(ASK).some((line) => String(content).includes(line));

// Returns Lucy's reply with a contact request or a thank-you added when it fits.
export const withContactRequest = ({ messages = [], reply = "", mode = "", language = "en" }) => {
  if (!reply) return reply;
  const userMessages = messages.filter((message) => message.role === "user");
  const latest = String(userMessages[userMessages.length - 1]?.content || "");
  const earlier = userMessages.slice(0, -1).map((message) => message.content).join("\n");
  const sharedNow = findGuestEmail(latest) || findGuestPhone(latest);
  const sharedBefore = findGuestEmail(earlier) || findGuestPhone(earlier);

  if (sharedNow && !sharedBefore) {
    const thanks = pick(THANKS, language)(sharedNow);
    // A message that is little more than the contact details gets just the thank-you.
    const otherWords = latest.replace(sharedNow, " ").split(/\s+/).filter((word) => word.length > 2);
    return otherWords.length <= 8 ? `${thanks} ${pick(MORE_HELP, language)}` : `${thanks}\n\n${reply}`;
  }
  if (sharedBefore || sharedNow) return reply;

  const timesAsked = messages.filter((message) => message.role === "assistant" && askedBefore(message.content)).length;
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  if (timesAsked >= 2 || askedBefore(lastAssistant?.content)) return reply;

  const shouldAsk =
    userMessages.length === 1 ||
    mode === "needs_attention" ||
    isTeamRequest(latest) ||
    (timesAsked === 0 && BOOKING_INTENT_PATTERN.test(latest));
  return shouldAsk ? `${reply}\n\n${pick(ASK, language)}` : reply;
};
