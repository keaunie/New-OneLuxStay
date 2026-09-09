import { useEffect } from "react";

const upsertMeta = (attr, key, content) => {
  if (typeof document === "undefined" || !content) return null;
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  const existed = Boolean(el);
  const prevContent = el ? el.getAttribute("content") : null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
  return { el, existed, prevContent };
};

const upsertCanonical = (href) => {
  if (typeof document === "undefined" || !href) return null;
  let el = document.querySelector('link[rel="canonical"]');
  const existed = Boolean(el);
  const prevHref = el ? el.getAttribute("href") : null;
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
  return { el, existed, prevHref };
};

/**
 * Temporarily overrides document title + description/canonical/OG/Twitter
 * meta tags for as long as the calling component keeps `active` truthy,
 * restoring whatever was there before (typically the defaults from
 * index.html) once it goes false or the component unmounts.
 */
export default function useDocumentMeta({ title, description, canonicalUrl, active = true } = {}) {
  useEffect(() => {
    if (!active || (!title && !description && !canonicalUrl)) return undefined;

    const prevTitle = document.title;
    if (title) document.title = title;

    const restores = [
      upsertMeta("name", "description", description),
      upsertMeta("property", "og:title", title),
      upsertMeta("property", "og:description", description),
      upsertMeta("property", "og:url", canonicalUrl),
      upsertMeta("name", "twitter:title", title),
      upsertMeta("name", "twitter:description", description),
    ].filter(Boolean);
    const canonical = upsertCanonical(canonicalUrl);

    return () => {
      document.title = prevTitle;
      restores.forEach(({ el, existed, prevContent }) => {
        if (existed) {
          if (prevContent != null) el.setAttribute("content", prevContent);
        } else {
          el.remove();
        }
      });
      if (canonical) {
        if (canonical.existed) {
          if (canonical.prevHref != null) canonical.el.setAttribute("href", canonical.prevHref);
        } else {
          canonical.el.remove();
        }
      }
    };
  }, [active, title, description, canonicalUrl]);
}
