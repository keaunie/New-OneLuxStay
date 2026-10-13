import { useEffect } from "react";

const SUFFIX = "OneLuxStay Torrance";
const DEFAULT_TITLE = "Furnished Apartments in Torrance, CA | Monthly Rentals | OneLuxStay";
const ORIGIN = "https://torrance.oneluxstay.com";

const setMeta = (selector, attr, key, content) => {
  let tag = document.querySelector(selector);
  if (!tag) {
    tag = document.createElement("meta");
    tag.setAttribute(attr, key);
    document.head.appendChild(tag);
  }
  tag.setAttribute("content", content);
};

// Sets the browser tab title, meta description, canonical link and social tags for the current page.
export default function usePageMeta(title, description) {
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SUFFIX}` : DEFAULT_TITLE;
    document.title = fullTitle;
    setMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    if (description) {
      setMeta('meta[name="description"]', "name", "description", description);
      setMeta('meta[property="og:description"]', "property", "og:description", description);
    }
    const canonical = document.querySelector('link[rel="canonical"]');
    const url = `${ORIGIN}${window.location.pathname === "/" ? "/" : window.location.pathname.replace(/\/$/, "")}`;
    if (canonical) canonical.setAttribute("href", url);
    setMeta('meta[property="og:url"]', "property", "og:url", url);
  }, [title, description]);
}
