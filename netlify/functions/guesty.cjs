// Netlify function acting as the Guesty API proxy with timeouts, retries, and PM content support (CommonJS).

const https = require("https");

// Netlify runs on Node 18/20 with global fetch/AbortController available.
const fetchFn = (...args) => globalThis.fetch(...args);
const getAbortController = () => globalThis.AbortController;

const guestyHost = "https://booking.guesty.com";
const clientId = process.env.GUESTY_CLIENT_ID;
const clientSecret = process.env.GUESTY_CLIENT_SECRET;
const pmContentUrl = "https://app.guesty.com/api/pm-websites-backend/engines/content";
const pmAidCs = process.env.GUESTY_PM_G_AID_CS;
const pmRequestContext = process.env.GUESTY_PM_X_REQUEST_CONTEXT;
const pmOrigin = process.env.GUESTY_PM_ORIGIN || "https://reservations.oneluxstay.com";
const pmReferer = process.env.GUESTY_PM_REFERER || "https://reservations.oneluxstay.com/";

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;
let pmCache = {};
let pmContentPromise = null;
const pmCacheTtlMs = 5 * 60 * 1000;
const isObject = (val) => val && typeof val === "object" && !Array.isArray(val);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const AbortController = getAbortController();
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(id);
  }
};

async function getToken(retry = 0) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;
  if (tokenPromise) return tokenPromise;
  if (!clientId || !clientSecret) throw new Error("Missing Guesty credentials in environment variables");

  const maxRetries = 2;

  tokenPromise = fetchWithTimeout(`${guestyHost}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
    .then(async (res) => {
      if (res.status === 429) throw new Error("RATE_LIMITED");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token request failed: ${res.status} ${text}`);
      }
      return res.json();
    })
    .then((json) => {
      cachedToken = json.access_token;
      tokenExpiresAt = Date.now() + (json.expires_in || 86_400) * 1000;
      return cachedToken;
    })
    .catch(async (err) => {
      if (err.message === "RATE_LIMITED" && retry < maxRetries) {
        await wait(1500 * (retry + 1));
        return getToken(retry + 1);
      }
      throw err;
    })
    .finally(() => {
      tokenPromise = null;
    });

  return tokenPromise;
}

async function guestyFetch(path, init = {}, timeoutMs = 8000) {
  const token = await getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(init.headers || {}),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetchWithTimeout(`${guestyHost}${path}`, { ...init, headers }, timeoutMs);
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guesty API error ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchPmContent(lang = "en") {
  const now = Date.now();
  const cacheEntry = pmCache[lang];
  if (cacheEntry && now < cacheEntry.expiresAt - 60_000) return cacheEntry.data;
  if (pmContentPromise) return pmContentPromise;
  if (!pmAidCs || !pmRequestContext) throw new Error("Missing pm content headers in environment variables");

  const headers = {
    accept: "application/json, text/plain, */*",
    "g-aid-cs": pmAidCs,
    "x-request-context": pmRequestContext,
    origin: pmOrigin,
    referer: pmReferer,
  };

  const url = `${pmContentUrl}?lang=${encodeURIComponent(lang)}`;

  pmContentPromise = fetchWithTimeout(url, { headers })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`pm content error ${res.status}: ${text}`);
      }
      return res.json();
    })
    .then((json) => {
      pmCache[lang] = { data: json, expiresAt: Date.now() + pmCacheTtlMs };
      return json;
    })
    .finally(() => {
      pmContentPromise = null;
    });

  return pmContentPromise;
}

function normalizePmListings(pmData) {
  const stack = [pmData];
  const listingsMap = new Map();

  while (stack.length) {
    const cur = stack.pop();
    if (Array.isArray(cur)) {
      stack.push(...cur);
    } else if (isObject(cur)) {
      const hasBeds = cur.title && (cur.bedrooms !== undefined || cur.bathrooms !== undefined || cur.beds !== undefined);
      const id = cur._id || cur.id;
      if (hasBeds && id && !listingsMap.has(id)) listingsMap.set(id, cur);
      stack.push(...Object.values(cur));
    }
  }

  const mapListing = (item) => {
    const itemId = item._id || item.id;
    const location =
      item.address?.city || item.address?.state || item.address?.country
        ? [item.address?.city, item.address?.state || item.address?.country].filter(Boolean).join(", ")
        : item.address?.full || "";

    const primaryPicture =
      item.picture?.regular || item.picture?.large || item.picture?.thumbnail || item.picture?.original || "";

    const gallery = Array.isArray(item.pictures)
      ? item.pictures
          .map((p) => p.original || p.regular || p.large || p.thumbnail)
          .filter(Boolean)
      : [];

    return {
      id: itemId,
      title: item.title || "",
      location,
      picture: primaryPicture,
      gallery,
      accommodates: item.accommodates,
      bedrooms: item.bedrooms,
      bathrooms: item.bathrooms,
      beds: item.beds,
      basePrice: item.prices?.basePrice,
      currency: item.prices?.currency || "USD",
      cleaningFee: item.prices?.cleaningFee,
      tags: item.tags || [],
      propertyType: item.propertyType || "",
      summary: item.publicDescription?.summary || "",
    };
  };

  return Array.from(listingsMap.values()).map(mapListing);
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const normalizeResource = (path) => {
  if (!path) return "";
  const marker = "/.netlify/functions/guesty";
  const idx = path.indexOf(marker);
  let resource = idx >= 0 ? path.slice(idx + marker.length) : path;
  resource = resource.replace(/^\/+/, "").replace(/^api\//, "");
  return resource;
};

module.exports.handler = async (event) => {
  try {
    const { path, httpMethod, queryStringParameters } = event;
    const resource = normalizeResource(path);

    if (httpMethod === "GET" && (resource === "listings" || resource === "")) {
      const data = await guestyFetch("/api/listings");
      const lightResults = (data?.results || []).map((item) => ({
        id: item._id,
        title: item.title,
        location: item.address?.city ? `${item.address.city}, ${item.address.state || ""}`.trim() : "",
        picture: item.picture?.regular || item.picture?.thumbnail || "",
        accommodates: item.accommodates,
        bedrooms: item.bedrooms,
        bathrooms: item.bathrooms,
        beds: item.beds,
        basePrice: item.prices?.basePrice,
        currency: item.prices?.currency || "USD",
        cleaningFee: item.prices?.cleaningFee,
        minNights: item.terms?.minNights || 1,
        tags: item.tags || [],
        timezone: item.timezone,
      }));
      return json(200, { results: lightResults });
    }

    if (httpMethod === "GET" && /^listings\/[^/]+\/availability/.test(resource)) {
      const [, listingId] = resource.split("/");
      const { startDate, endDate, adults = 1, children = 0 } = queryStringParameters || {};
      if (!startDate || !endDate) return json(400, { message: "startDate and endDate are required (YYYY-MM-DD)" });

      try {
        const query = `listingId=${listingId}&startDate=${startDate}&endDate=${endDate}&adults=${adults}&children=${children}`;
        const primary = await guestyFetch(`/api/availability-pricing/availability?${query}`);
        return json(200, primary);
      } catch {
        try {
          const fallback = await guestyFetch(
            `/api/availability/${listingId}?startDate=${startDate}&endDate=${endDate}&adults=${adults}&children=${children}`,
          );
          return json(200, fallback);
        } catch (fallbackErr) {
          return json(502, { message: "Unable to fetch availability from Guesty", error: fallbackErr.message });
        }
      }
    }

    if (httpMethod === "GET" && /^listings\/[^/]+\/price-estimate/.test(resource)) {
      const [, listingId] = resource.split("/");
      const { startDate, endDate, adults = 1, children = 0 } = queryStringParameters || {};
      if (!startDate || !endDate) return json(400, { message: "startDate and endDate are required (YYYY-MM-DD)" });
      const query = `listingId=${listingId}&startDate=${startDate}&endDate=${endDate}&adults=${adults}&children=${children}`;
      const estimate = await guestyFetch(`/api/availability-pricing/price-estimate?${query}`);
      return json(200, estimate);
    }

    if (httpMethod === "POST" && resource === "book") {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return json(400, { message: "Invalid JSON body" });
      }
      const { listingId, checkIn, checkOut, adults = 1, children = 0, guest } = body;
      if (!listingId || !checkIn || !checkOut || !guest?.firstName || !guest?.lastName || !guest?.email) {
        return json(400, { message: "Missing required booking fields" });
      }
      const payload = {
        listingId,
        checkIn,
        checkOut,
        numberOfAdults: Number(adults),
        numberOfChildren: Number(children),
        guest,
      };
      const result = await guestyFetch("/api/reservations", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return json(200, { message: "Booking created", data: result });
    }

    if (httpMethod === "GET" && resource === "pm-content") {
      const lang = queryStringParameters?.lang || "en";
      const data = await fetchPmContent(lang);
      return json(200, data);
    }

    if (httpMethod === "GET" && resource === "pm-available") {
      const lang = queryStringParameters?.lang || "en";
      const data = await fetchPmContent(lang);
      const listings = normalizePmListings(data);
      return json(200, { results: listings });
    }

    return json(404, { message: "Not Found" });
  } catch (err) {
    if (err.message === "RATE_LIMITED") {
      return json(429, { message: "Guesty rate limit hit. Please retry shortly." });
    }
    return json(500, { message: "Internal error", error: err.message });
  }
};
