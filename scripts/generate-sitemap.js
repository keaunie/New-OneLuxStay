import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const appRoutesFile = path.join(projectRoot, "src", "App.jsx");
const sitemapFile = path.join(projectRoot, "public", "sitemap.xml");

const SITE_URL = String(process.env.SITEMAP_SITE_URL || process.env.VITE_SITE_URL || "https://oneluxstay.com")
  .trim()
  .replace(/\/+$/, "");
const FUNCTIONS_ORIGIN = String(
  process.env.SITEMAP_FUNCTIONS_ORIGIN ||
  process.env.VITE_NETLIFY_SITE_URL ||
  process.env.VITE_NETLIFY_FUNCTIONS_ORIGIN ||
  "https://oneluxstayprop.netlify.app"
)
  .trim()
  .replace(/\/+$/, "");

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
    roots: ["/redondo-beach", "/redondo"],
    areaSlugs: ["pier", "rivieravillage", "southbay", "redondo"],
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

const parsePathsFromAppRoutes = async () => {
  const content = await fs.readFile(appRoutesFile, "utf8");
  const matches = [...content.matchAll(/path\s*=\s*["']([^"']+)["']/g)];
  const paths = new Set();
  for (const match of matches) {
    const routePath = match?.[1] || "";
    if (!routePath || routePath === "*") continue;
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
  const endpoint = `${FUNCTIONS_ORIGIN}/.netlify/functions/listings?${params.toString()}`;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch listings (${response.status}): ${text.slice(0, 300)}`);
  }
  const payload = await response.json();
  return {
    results: Array.isArray(payload?.results) ? payload.results : [],
    count: Number.isFinite(Number(payload?.count)) ? Number(payload.count) : null,
  };
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
    if (cityKey === "redondo") config = CITY_CONFIG.redondo;
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

const buildXml = (urls, lastmod) => {
  const sorted = [...new Set(urls)].sort((a, b) => a.localeCompare(b));
  const entries = sorted
    .map((url) => {
      const priority = url === `${SITE_URL}/` ? "1.0" : url.includes("/listing/") ? "0.8" : "0.7";
      const changefreq = url.includes("/listing/") ? "weekly" : "monthly";
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
