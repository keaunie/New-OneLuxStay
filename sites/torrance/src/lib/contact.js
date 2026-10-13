import { SITE } from "../data/content.js";

export const whatsappLink = (message) =>
  `https://wa.me/${SITE.whatsapp.digits}?text=${encodeURIComponent(message)}`;

export const inquiryMailto = ({ fullName, email, phone, moveIn, stayLength, guests, residence, message }) => {
  const lines = [
    `Hi OneLuxStay,`,
    ``,
    `I'd like to ask about a long-term stay in Torrance.`,
    residence ? `Residence: ${residence}` : "",
    moveIn ? `Move-in date: ${moveIn}` : "",
    stayLength ? `Length of stay: ${stayLength}` : "",
    guests ? `Guests: ${guests}` : "",
    ``,
    message || "",
    ``,
    `${fullName}`,
    `${email}${phone ? ` · ${phone}` : ""}`,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  const subject = `Long-term stay inquiry — Torrance${residence ? ` (${residence})` : ""}`;
  return `mailto:${SITE.inquiryTo.join(",")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join("\n"))}`;
};
