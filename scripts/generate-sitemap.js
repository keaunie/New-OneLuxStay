import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const appRoutesFile = path.join(projectRoot, "src", "App.jsx");
const sitemapFile = path.join(projectRoot, "public", "sitemap.xml");

const normalizeOrigin = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const DEFAULT_PUBLIC_SITE_URL = "https://oneluxstay.com";

// Public URLs that appear in the generated sitemap must always point to the production website.
const SITE_URL = normalizeOrigin(
  process.env.SITEMAP_SITE_URL ||
    process.env.PUBLIC_WEBSITE_URL ||
    process.env.PUBLIC_SITE_URL ||
    process.env.VITE_PUBLIC_WEBSITE_URL ||
    process.env.VITE_SITE_URL ||
    DEFAULT_PUBLIC_SITE_URL,
);

// Internal listing fetches should be environment-aware. Try explicit overrides first, then deploy URLs,
// then localhost for local dev, and finally fall back to the stable Netlify origin.
const FUNCTIONS_ORIGIN_CANDIDATES = [
  process.env.SITEMAP_FUNCTIONS_ORIGIN,
  process.env.INTERNAL_API_ORIGIN,
  process.env.VITE_INTERNAL_API_BASE,
  process.env.VITE_NETLIFY_SITE_URL,
  process.env.VITE_NETLIFY_FUNCTIONS_ORIGIN,
  process.env.DEPLOY_PRIME_URL,
  process.env.URL,
  "http://localhost:8888",
  "https://oneluxstayprop.netlify.app",
]
  .map(normalizeOrigin)
  .filter(Boolean);

const today = new Date();
const plusDays = (date, days) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};
const toIsoDate = (date) => date.toISOString().slice(0, 10);
const defaultCheckIn = toIsoDate(plusDays(today, 14));
const defaultCheckOut = toIsoDate(plusDays(today, 17));
const defaultGuests = "2";
const routeBookingBundle = `${defaultCheckIn}&${defaultCheckOut}&${defaultGuests}`;

const CITY_CONFIG = {
  antwerp: {
    roots: ["/antwerp", "/antwerpen"],
    areaSlugs: ["fashiondistrict", "diamonddistrict", "antwerpcentral", "citycentre", "nearcentral"],
  },
  losAngeles: {
    roots: ["/los-angeles", "/losangeles"],
    areaSlugs: ["hwh", "downtownla", "hollywood", "neardodger"],
  },
  miami: {
    roots: ["/miami-beach", "/miami"],
    areaSlugs: ["brickell", "wynwood", "designdistrict", "miami"],
  },
  redondo: {
    roots: ["/redondo-beach"],
    areaSlugs: [],
  },
  dubai: {
    roots: ["/dubai"],
    areaSlugs: ["downtowndubai", "dubaimarina", "businessbay", "palmjumeirah", "dubai"],
  },
};

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const normalizePath = (value) => {
  const v = String(value || "").trim();
  if (!v) return "/";
  if (v === "/") return "/";
  return `/${v.replace(/^\/+/, "").replace(/\/+$/, "")}`;
};

const absoluteUrlForPath = (routePath) => {
  const cleanPath = normalizePath(routePath);
  if (cleanPath === "/") return `${SITE_URL}/`;
  return `${SITE_URL}${cleanPath}`;
};

const isPublicSitemapRoute = (routePath = "") => {
  const normalized = normalizePath(routePath).toLowerCase();
  if (normalized === "/ai-agent") return false;
  if (normalized === "/admins-ols") return false;
  if (normalized === "/admins-ols/login") return false;
  if (normalized === "/admins-ols/audit") return false;
  if (normalized === "/admins-ols/guest-journeys") return false;
  if (normalized.startsWith("/private/")) return false;
  if (normalized === "/redondo-beach-legacy") return false;
  if (normalized.startsWith("/redondo-beach-legacy/")) return false;
  if (normalized === "/redondo") return false;
  if (normalized.startsWith("/redondo/")) return false;
  if (normalized.startsWith("/redondo-beach/listing/")) return false;
  if (normalized === "/redondo-beach/listing/:listingid") return false;
  if (normalized === "/redondo-beach/:areaslug") return false;
  if (normalized === "/redondo-beach/:areaslug/:bookingbundle") return false;
  return true;
};

const parsePathsFromAppRoutes = async () => {
  const content = await fs.readFile(appRoutesFile, "utf8");
  const matches = [...content.matchAll(/path\s*=\s*["']([^"']+)["']/g)];
  const paths = new Set();
  for (const match of matches) {
    const routePath = match?.[1] || "";
    if (!routePath || routePath === "*") continue;
    if (!isPublicSitemapRoute(routePath)) continue;
    paths.add(normalizePath(routePath));
  }
  return [...paths];
};

const isDynamicRoutePattern = (routePath) => routePath.includes(":");

const getListingId = (listing) =>
  String(listing?.id || listing?._id || listing?.unitTypeId || "").trim();

const normalizeListingCity = (listing) => {
  const titleLower = typeof listing?.title === "string" ? listing.title.toLowerCase() : "";
  const cityLower = String(listing?.city || listing?.address?.city || listing?.location || "")
    .trim()
    .toLowerCase();

  if (cityLower.includes("los angeles") || cityLower.includes("hollywood")) return "los-angeles";
  if (cityLower.includes("antwerp") || cityLower.includes("antwerpen")) return "antwerp";
  if (cityLower.includes("miami")) return "miami";
  if (cityLower.includes("redondo")) return "redondo";
  if (cityLower.includes("dubai")) return "dubai";

  const tags = Array.isArray(listing?.tags) ? listing.tags.map((tag) => String(tag || "").toLowerCase()) : [];
  const joinedTags = tags.join(" ");
  if (joinedTags.includes("los angeles") || joinedTags.includes("hollywood")) return "los-angeles";
  if (joinedTags.includes("antwerp") || joinedTags.includes("antwerpen")) return "antwerp";
  if (joinedTags.includes("miami")) return "miami";
  if (joinedTags.includes("redondo")) return "redondo";
  if (joinedTags.includes("dubai")) return "dubai";

  if (titleLower.includes("los angeles") || titleLower.includes("hollywood")) return "los-angeles";
  if (titleLower.includes("antwerp") || titleLower.includes("antwerpen")) return "antwerp";
  if (titleLower.includes("miami")) return "miami";
  if (titleLower.includes("redondo")) return "redondo";
  if (titleLower.includes("dubai")) return "dubai";

  return "";
};

const fetchListingsPage = async (skip) => {
  const params = new URLSearchParams({
    limit: "200",
    skip: String(skip),
  });

  const uniqueOrigins = [...new Set(FUNCTIONS_ORIGIN_CANDIDATES)];
  let lastError = null;

  for (const origin of uniqueOrigins) {
    const endpoint = `${origin}/.netlify/functions/listings?${params.toString()}`;
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`Failed to fetch listings (${response.status}) from ${origin}: ${text.slice(0, 300)}`);
      }
      const payload = text ? JSON.parse(text) : {};
      return {
        results: Array.isArray(payload?.results) ? payload.results : [],
        count: Number.isFinite(Number(payload?.count)) ? Number(payload.count) : null,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Failed to fetch listings: no origins available");
};

const fetchAllListings = async () => {
  const listings = [];
  let skip = 0;
  let expectedCount = null;
  const pageLimit = 50;

  for (let page = 0; page < pageLimit; page += 1) {
    const { results, count } = await fetchListingsPage(skip);
    if (expectedCount == null && count != null) expectedCount = count;
    if (!results.length) break;
    listings.push(...results);
    skip += results.length;
    if (expectedCount != null && listings.length >= expectedCount) break;
  }

  const seen = new Set();
  return listings.filter((listing) => {
    const id = getListingId(listing);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const buildRouteSet = (baseRoutes, listings) => {
  const routes = new Set();

  for (const routePath of baseRoutes) {
    if (!isDynamicRoutePattern(routePath)) {
      routes.add(normalizePath(routePath));
    }
  }

  Object.values(CITY_CONFIG).forEach((city) => {
    city.roots.forEach((rootPath) => {
      city.areaSlugs.forEach((areaSlug) => {
        const cleanRoot = normalizePath(rootPath);
        routes.add(`${cleanRoot}/${areaSlug}`);
        routes.add(`${cleanRoot}/${areaSlug}/${routeBookingBundle}`);
      });
    });
  });

  listings.forEach((listing) => {
    const listingId = getListingId(listing);
    if (!listingId) return;
    const cityKey = normalizeListingCity(listing);
    if (!cityKey) return;

    let config = null;
    if (cityKey === "antwerp") config = CITY_CONFIG.antwerp;
    if (cityKey === "los-angeles") config = CITY_CONFIG.losAngeles;
    if (cityKey === "miami") config = CITY_CONFIG.miami;
    if (cityKey === "redondo") return;
    if (cityKey === "dubai") config = CITY_CONFIG.dubai;
    if (!config) return;

    const encodedId = encodeURIComponent(listingId);
    config.roots.forEach((rootPath) => {
      const cleanRoot = normalizePath(rootPath);
      routes.add(`${cleanRoot}/listing/${encodedId}`);
      routes.add(`${cleanRoot}/listing/${encodedId}/${defaultCheckIn}/${defaultCheckOut}/${defaultGuests}`);
    });
  });

  return [...routes];
};

const BLOG_POST_SLUGS = [
  "luxury-stays-dubai-2026-guide",
  "antwerp-travel-guide-2026",
  "miami-beachfront-vacation-guide",
  "redondo-beach-vacation-guide",
  "business-travel-antwerp-guide",
];

const buildXml = (urls, lastmod) => {
  const blogPostUrls = BLOG_POST_SLUGS.map((slug) => `${SITE_URL}/blog/${slug}`);
  const allUrls = [...new Set([...urls, ...blogPostUrls])];
  const sorted = allUrls.sort((a, b) => a.localeCompare(b));
  const entries = sorted
    .map((url) => {
      const isBlogPost = url.includes("/blog/") && url.split("/blog/")[1]?.length > 0;
      const isBlogIndex = url.endsWith("/blog");
      const priority = url === `${SITE_URL}/` ? "1.0"
        : url.includes("/listing/") ? "0.8"
        : isBlogPost ? "0.8"
        : isBlogIndex ? "0.8"
        : "0.7";
      const changefreq = url.includes("/listing/") ? "weekly"
        : isBlogPost ? "monthly"
        : "monthly";
      return `  <url>
    <loc>${xmlEscape(url)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
};

const main = async () => {
  const routePaths = await parsePathsFromAppRoutes();
  let listings = [];

  try {
    listings = await fetchAllListings();
  } catch (error) {
    console.warn(`[sitemap] Listing fetch failed: ${error.message}`);
    console.warn("[sitemap] Continuing with static and area-based routes.");
  }

  const dynamicRoutes = buildRouteSet(routePaths, listings);
  const urls = dynamicRoutes.map((routePath) => absoluteUrlForPath(routePath));
  const xml = buildXml(urls, toIsoDate(today));

  await fs.writeFile(sitemapFile, xml, "utf8");
  console.log(`[sitemap] Wrote ${urls.length} URLs to ${path.relative(projectRoot, sitemapFile)} (listings: ${listings.length}).`);
};

main().catch((error) => {
  console.error(`[sitemap] Generation failed: ${error.message}`);
  process.exit(1);
});
