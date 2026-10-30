// Cloudflare Worker for oneluxstay.com. Static files in dist/ (including the per-page
// HTML written by scripts/prerender-seo.js) are served by Cloudflare before this runs;
// the worker only sees requests that matched no file. It:
//   1. 301-redirects old and duplicate URLs to the one we want indexed,
//   2. serves dated URLs (/antwerp/listing/<id>/<in>/<out>/<guests>) with their base page,
//   3. serves the app shell for other app routes, marked noindex,
//   4. returns a real 404 for anything else, so unknown URLs don't get indexed.

const REDONDO_SITE_URL = "https://redondobeach.oneluxstay.com";

const ANTWERP_AREA_SLUGS = {
  diamonddistrict: "diamond-district",
  fashiondistrict: "fashion-district",
  antwerpcentral: "antwerp-central",
  citycentre: "city-centre",
  nearcentral: "near-central-station",
};

const REDIRECTS = [
  [/^\/redondo-beach(\/.*)?$/i, () => REDONDO_SITE_URL],
  [/^\/antwerpen(\/.*)?$/i, (m) => `/antwerp${m[1] || ""}`],
  [/^\/losangeles(\/.*)?$/i, (m) => `/los-angeles${m[1] || ""}`],
  [/^\/hollywood\/listing\/(.+)$/i, (m) => `/los-angeles/listing/${m[1]}`],
  [/^\/antwerp\/(diamonddistrict|fashiondistrict|antwerpcentral|citycentre|nearcentral)(\/.*)?$/i,
    (m) => `/antwerp/${ANTWERP_AREA_SLUGS[m[1].toLowerCase()]}${m[2] || ""}`],
  [/^\/(global-units|one-lux-stay-global)$/i, () => "/global"],
  [/^\/business\/healthcare-professionals$/i, () => "/healthcare-professionals"],
  [/^\/privacy$/i, () => "/privacy-policy"],
  [/^\/california-privacy$/i, () => "/california-privacy-policy"],
];

// Dated or guest-count variants that show the same page as their base URL.
const VARIANT_BASES = [
  /^(\/[^/]+\/listing\/[^/]+)\/.+$/i,
  /^(\/(?:antwerp|los-angeles|dubai)\/(?!listing\/)[^/]+)\/[^/]+$/i,
];

// App routes that exist but have no page of their own for search engines.
const APP_ROUTES = [
  /^\/[^/]+\/listing\/[^/]+(\/.*)?$/i,
  /^\/(antwerp|los-angeles|dubai|miami|miami-beach|redondo|redondo-beach-legacy)(\/[^/]+){0,2}$/i,
  /^\/[^/]+\/attractions$/i,
  /^\/blog(\/[^/]+)?$/i,
  /^\/(listings|global|hollywood|reserve|acknowledge|booking-confirmation|thank-you|maintenance|under-maintenance|ai-agent|apaleo-test|admin-reservations|admin-presence)$/i,
  /^\/(executive-ols|admins-ols|admin\/properties|private\/roadmap|dev-ols)(\/.*)?$/i,
];

const withStatus = (response, status, extraHeaders = {}) => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(extraHeaders)) headers.set(key, value);
  return new Response(response.body, { status, headers });
};

const fetchAsset = (env, request, pathname) => env.ASSETS.fetch(new Request(new URL(pathname, request.url), request));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    for (const [pattern, target] of REDIRECTS) {
      const match = pathname.match(pattern);
      if (match) {
        const location = new URL(target(match), url);
        if (location.origin === url.origin) location.search = url.search;
        return Response.redirect(location.toString(), 301);
      }
    }

    // Only page navigations get the app shell; missing scripts, images etc. stay 404.
    const accept = request.headers.get("accept") || "";
    if (/\.[a-z0-9]{2,5}$/i.test(pathname) && !accept.includes("text/html")) {
      return new Response("Not found", { status: 404 });
    }

    for (const pattern of VARIANT_BASES) {
      const match = pathname.match(pattern);
      if (!match) continue;
      const base = await fetchAsset(env, request, match[1]);
      if (base.ok) return base;
    }

    const shell = await fetchAsset(env, request, "/spa-shell");
    const isAppRoute = APP_ROUTES.some((pattern) => pattern.test(pathname));
    return withStatus(shell, isAppRoute ? 200 : 404, { "X-Robots-Tag": "noindex" });
  },
};
