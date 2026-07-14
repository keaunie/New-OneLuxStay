const CITY_LINK_MAP = [
  { pattern: /\bDubai Marina\b/gi, href: "/dubai", label: "Dubai Marina" },
  { pattern: /\bDowntown Dubai\b/gi, href: "/dubai", label: "Downtown Dubai" },
  { pattern: /\bPalm Jumeirah\b/gi, href: "/dubai", label: "Palm Jumeirah" },
  { pattern: /\bluxury (?:stays?|apartments?|rentals?) in Dubai\b/gi, href: "/dubai", label: null },
  { pattern: /\bDubai (?:quality|short-term|modern) (?:apartments?|rentals?|stays?)\b/gi, href: "/dubai", label: null },
  { pattern: /\bAntwerp (?:short[- ]term rentals?|furnished apartments?|stays?)\b/gi, href: "/antwerp", label: null },
  { pattern: /\bluxury (?:stays?|apartments?|rentals?) in Antwerp\b/gi, href: "/antwerp", label: null },
  { pattern: /\bZurenborg\b/gi, href: "/antwerp", label: "Zurenborg, Antwerp" },
  { pattern: /\bHet Eilandje\b/gi, href: "/antwerp", label: "Het Eilandje" },
  { pattern: /\bSouth Antwerp\b/gi, href: "/antwerp", label: "South Antwerp" },
  { pattern: /\bRedondo Beach\b/gi, href: "/redondo-beach", label: "Redondo Beach" },
  { pattern: /\bSouth Bay\b/gi, href: "/redondo-beach", label: "South Bay, LA" },
  { pattern: /\bLos Angeles\b/gi, href: "/los-angeles", label: "Los Angeles" },
  { pattern: /\bLA\b/g, href: "/los-angeles", label: "LA" },
];

export const CITY_INTERNAL_LINKS = CITY_LINK_MAP;

export const applyInternalLinks = (text = "") => {
  if (typeof text !== "string" || !text) return text;
  return text;
};
