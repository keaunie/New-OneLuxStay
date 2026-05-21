import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  ANALYTICS_EVENTS,
  FUNNEL_STAGES,
  SCROLL_DEPTH_THRESHOLDS,
} from "../lib/analyticsEvents";
import {
  captureUtmAttribution,
  getPageContext,
  trackCityView,
  trackCtaClick,
  trackEventSafe,
  trackFunnelStage,
  trackListingView,
  trackNavigationClick,
  trackPageView,
  trackPhoneCallClick,
  trackReviewExpanded,
  trackReviewScrollEngaged,
  trackReviewsViewed,
  trackScrollDepth,
  trackWhatsAppClick,
} from "../lib/analytics";

const CITY_PATHS = new Set([
  "/antwerp",
  "/antwerpen",
  "/los-angeles",
  "/losangeles",
  "/miami",
  "/miami-beach",
  "/redondo",
  "/redondo-beach",
  "/dubai",
]);

const isCityPath = (pathname = "") => CITY_PATHS.has(String(pathname || "").toLowerCase());

const normalizeText = (value = "") =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const extractButtonContext = (target) => {
  const actionable = target?.closest?.("a,button");
  if (!actionable) return { text: "", href: "", className: "", explicit: false };
  return {
    text: normalizeText(actionable.textContent || actionable.getAttribute("aria-label") || ""),
    href: String(actionable.getAttribute("href") || ""),
    className: String(actionable.className || ""),
    explicit: actionable.getAttribute("data-analytics-explicit") === "true",
  };
};

export default function AnalyticsTracker() {
  const location = useLocation();
  const fullPath = useMemo(
    () => `${location.pathname || "/"}${location.search || ""}`,
    [location.pathname, location.search],
  );
  const reviewObserverRef = useRef(null);

  useEffect(() => {
    captureUtmAttribution(location.search);
    const context = getPageContext(location.pathname);
    trackPageView(fullPath);

    if (context.pathname === "/") {
      trackFunnelStage(FUNNEL_STAGES.HOMEPAGE_VIEWED, { source_page: fullPath });
    }
    if (isCityPath(context.pathname)) {
      trackCityView({
        cityName: context.city,
        sourcePage: fullPath,
      });
    }
    if (context.pageType === "listing" && context.listingId) {
      trackListingView({
        listingId: context.listingId,
        city: context.city,
        pageUrl: fullPath,
      });
    }
  }, [fullPath, location.pathname, location.search]);

  useEffect(() => {
    const firedDepth = new Set();
    const handleScroll = () => {
      const doc = document.documentElement;
      const body = document.body;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const scrollHeight = Math.max(
        body.scrollHeight,
        doc.scrollHeight,
        body.offsetHeight,
        doc.offsetHeight,
      );
      const viewport = window.innerHeight || doc.clientHeight || 1;
      const maxScrollable = Math.max(1, scrollHeight - viewport);
      const percent = Math.round((scrollTop / maxScrollable) * 100);
      SCROLL_DEPTH_THRESHOLDS.forEach((threshold) => {
        if (percent >= threshold && !firedDepth.has(threshold)) {
          firedDepth.add(threshold);
          const page = getPageContext();
          trackScrollDepth(threshold, {
            source_page: page.fullPath,
            city: page.city,
            listing_id: page.listingId,
          });
        }
      });
    };

    const throttled = () => {
      window.requestAnimationFrame(handleScroll);
    };

    window.addEventListener("scroll", throttled, { passive: true });
    handleScroll();
    return () => {
      window.removeEventListener("scroll", throttled);
    };
  }, [fullPath]);

  useEffect(() => {
    const clickHandler = (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const page = getPageContext();
      const ctx = extractButtonContext(target);
      if (ctx.explicit) return;

      if (ctx.href.startsWith("tel:")) {
        trackPhoneCallClick({
          phone: ctx.href.replace(/^tel:/i, ""),
          sourcePage: page.fullPath,
          city: page.city,
          location: ctx.className || "link",
        });
      }

      if (ctx.href.includes("wa.me") || ctx.href.includes("whatsapp")) {
        trackWhatsAppClick({
          listing: page.listingId,
          city: page.city,
          sourcePage: page.fullPath,
          buttonType: ctx.text || "whatsapp",
          location: ctx.className || "link",
        });
      }

      const isCta =
        ctx.text.includes("book") ||
        ctx.text.includes("availability") ||
        ctx.text.includes("contact") ||
        ctx.text.includes("call") ||
        ctx.text.includes("view listing") ||
        ctx.text.includes("view unit") ||
        ctx.text.includes("whatsapp");
      if (isCta) {
        trackCtaClick({
          ctaText: ctx.text,
          location: ctx.className || "unknown",
          sourcePage: page.fullPath,
          city: page.city,
          listing: page.listingId,
        });
      }

      if (target.closest("nav, .policy-footer, .landing-nav")) {
        trackNavigationClick({
          navItem: ctx.text,
          destination: ctx.href || "",
          location: "navigation",
        });
      }

      if (ctx.text.includes("review")) {
        trackReviewExpanded({
          source_page: page.fullPath,
          city: page.city,
          listing_id: page.listingId,
        });
      }
    };

    document.addEventListener("click", clickHandler, true);
    return () => {
      document.removeEventListener("click", clickHandler, true);
    };
  }, [fullPath]);

  useEffect(() => {
    const changeHandler = (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) return;
      const id = normalizeText(target.id || target.name || "");
      const page = getPageContext();
      if (id.includes("guest") || id.includes("adult") || id.includes("children")) {
        trackEventSafe({
          eventName: ANALYTICS_EVENTS.GUEST_COUNT_CHANGED,
          params: {
            source_page: page.fullPath,
            field: id,
            value: String(target.value || ""),
            city: page.city,
            listing_id: page.listingId,
          },
          dedupeKey: `${id}:${target.value}:${page.fullPath}`,
          dedupeMs: 700,
        });
      }
    };

    document.addEventListener("change", changeHandler, true);
    return () => {
      document.removeEventListener("change", changeHandler, true);
    };
  }, [fullPath]);

  useEffect(() => {
    if (reviewObserverRef.current) {
      reviewObserverRef.current.disconnect();
      reviewObserverRef.current = null;
    }
    const reviewNodes = Array.from(
      document.querySelectorAll('[id*="review"], [class*="review"]'),
    );
    if (!reviewNodes.length || typeof IntersectionObserver === "undefined") return;

    const seen = new WeakSet();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || seen.has(entry.target)) return;
          seen.add(entry.target);
          const page = getPageContext();
          trackReviewsViewed({
            source_page: page.fullPath,
            city: page.city,
            listing_id: page.listingId,
          });
          trackReviewScrollEngaged({
            source_page: page.fullPath,
            city: page.city,
            listing_id: page.listingId,
          });
        });
      },
      { threshold: 0.35 },
    );

    reviewNodes.forEach((node) => observer.observe(node));
    reviewObserverRef.current = observer;
    return () => observer.disconnect();
  }, [fullPath]);

  return null;
}
