import { useEffect } from "react";
import { SITE } from "../data/content.js";

const SUFFIX = "OneLuxStay";
const DEFAULT_TITLE = "Furnished Monthly Rentals in Redondo Beach, CA | 31+ Nights";
const SHARE_IMAGE = `${SITE.domain}/images/redondo-waterfront.jpg`;

const setTag = (selector, attrs) => {
  let tag = document.head.querySelector(selector);
  if (!tag) {
    tag = document.createElement(selector.startsWith("link") ? "link" : "meta");
    document.head.appendChild(tag);
  }
  Object.entries(attrs).forEach(([key, value]) => tag.setAttribute(key, value));
};

// Sets the tab title, meta description, canonical URL and social-share tags for the current page,
// so every route (not just the homepage) presents its own title, link and preview to search engines.
export default function usePageMeta(title, description, { noindex = false } = {}) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SUFFIX}` : DEFAULT_TITLE;
    const path = window.location.pathname.replace(/\/+$/, "");
    const url = `${SITE.domain}${path}${path ? "" : "/"}`;

    document.title = fullTitle;
    if (description) setTag('meta[name="description"]', { name: "description", content: description });
    setTag('link[rel="canonical"]', { rel: "canonical", href: url });
    setTag('meta[property="og:title"]', { property: "og:title", content: fullTitle });
    if (description) setTag('meta[property="og:description"]', { property: "og:description", content: description });
    setTag('meta[property="og:url"]', { property: "og:url", content: url });
    setTag('meta[name="twitter:title"]', { name: "twitter:title", content: fullTitle });
    if (description) setTag('meta[name="twitter:description"]', { name: "twitter:description", content: description });
    setTag('meta[name="robots"]', {
      name: "robots",
      content: noindex ? "noindex, follow" : "index, follow, max-image-preview:large, max-snippet:-1",
    });
  }, [title, description, noindex]);
}
