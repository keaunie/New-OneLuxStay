// Entry point for the redondobeach.oneluxstay.com Cloudflare site.
//
// Static pages are served from ./dist by Cloudflare's asset handler. This small script only adds one
// rule: alternate hostnames guests might type (like redondo.oneluxstay.com) are permanently redirected
// to the main address, keeping the page and query string. One official address is better for search
// engines than two identical copies of the site. It also serves POST /api/inquiry, the inquiry form.

import { handleInquiry } from "./inquiry.js";

export const CANONICAL_HOST = "redondobeach.oneluxstay.com";
export const ALIAS_HOSTS = ["redondo.oneluxstay.com"];

// Returns the address to redirect to, or null if the request is already on the canonical host.
export const canonicalRedirectUrl = (requestUrl) => {
  const url = new URL(requestUrl);
  if (!ALIAS_HOSTS.includes(url.hostname.toLowerCase())) return null;
  url.protocol = "https:";
  url.hostname = CANONICAL_HOST;
  url.port = "";
  return url.toString();
};

// Short, readable paths used in Google Ads display URLs and sitelinks. Each one is permanently
// redirected to the real page, keeping the query string so ad tracking (gclid, utm_*) survives.
export const PATH_REDIRECTS = {
  "/31-night-stays": "/long-term-stays",
  "/31-plus-nights": "/long-term-stays",
  "/monthly-stays": "/long-term-stays",
  "/monthly-rentals": "/residences",
  "/monthly-rental": "/residences",
  "/furnished-homes": "/residences",
  "/furnished-homes/31-night-stays": "/long-term-stays",
  "/furnished-homes/monthly-stays": "/long-term-stays",
  "/furnished-homes/monthly-rentals": "/residences",
  "/residences/31-night-stays": "/long-term-stays",
  "/residences/monthly-stays": "/long-term-stays",
  "/residences/monthly-rentals": "/residences",
  "/residences/monthly-rental": "/residences",
  "/redondo-beach": "/",
  "/redondo-beach/monthly-rentals": "/residences",
  "/redondo-beach/monthly-stays": "/long-term-stays",
};

// Returns the address to redirect to, or null if the path needs no redirect.
export const pathRedirectUrl = (requestUrl) => {
  const url = new URL(requestUrl);
  const path = url.pathname.toLowerCase().replace(/\/+$/, "");
  const target = PATH_REDIRECTS[path];
  if (!target) return null;
  url.pathname = target;
  return url.toString();
};

export default {
  async fetch(request, env) {
    const target = canonicalRedirectUrl(request.url);
    if (target) return Response.redirect(target, 301);
    const pathTarget = pathRedirectUrl(request.url);
    if (pathTarget) return Response.redirect(pathTarget, 301);
    if (new URL(request.url).pathname === "/api/inquiry") return handleInquiry(request, env);
    return env.ASSETS.fetch(request);
  },
};
