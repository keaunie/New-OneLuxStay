export const PRIMARY_US_CONTACT = Object.freeze({
  display: "+1 213 866 3589",
  digits: "12138663589",
  telHref: "tel:+12138663589",
});

export const PRIMARY_US_WHATSAPP_CONTACT = Object.freeze({
  display: "+1 618 881 2613",
  digits: "16188812613",
  telHref: "tel:+16188812613",
  whatsappFrom: "whatsapp:+16188812613",
});

export const PRIMARY_US_WHATSAPP_LABEL = `WhatsApp ${PRIMARY_US_WHATSAPP_CONTACT.display}`;

export const BELGIUM_CONTACT = Object.freeze({
  display: "+32 460 25 4886",
  digits: "32460254886",
  telHref: "tel:+32460254886",
  whatsappFrom: "whatsapp:+32460254886",
});

export const buildWhatsAppHref = (digits, message = "") =>
  `https://wa.me/${String(digits || "").replace(/[^\d]/g, "")}?text=${encodeURIComponent(String(message || ""))}`;

const normalizeContactHint = (source) => {
  if (!source) return "";
  if (typeof source === "string") return source.toLowerCase();
  return [
    source?.title,
    source?.city,
    source?.location,
    source?.country,
    source?.address?.city,
    source?.address?.state,
    source?.address?.country,
  ]
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .toLowerCase();
};

const isAntwerpContactHint = (source) =>
  /\b(antwerp|antwerpen|belgium|belgie|belgië|belgique)\b/i.test(normalizeContactHint(source));

export const resolveListingContactProfile = (source) => {
  if (isAntwerpContactHint(source)) {
    return {
      phone: BELGIUM_CONTACT,
      whatsapp: BELGIUM_CONTACT,
    };
  }
  return {
    phone: PRIMARY_US_CONTACT,
    whatsapp: PRIMARY_US_WHATSAPP_CONTACT,
  };
};

export const buildWhatsAppLabel = (contact) => `WhatsApp ${(contact || PRIMARY_US_WHATSAPP_CONTACT).display}`;
