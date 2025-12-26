const fetchFn = (...args) => {
  if (!globalThis.fetch) throw new Error("Fetch not available");
  return globalThis.fetch(...args);
};

const openApiHost = "https://open-api.guesty.com";
const openApiServer = "https://open-api.guesty.com/v1";
const pmListingsUrl =
  "https://app.guesty.com/api/pm-websites-backend/listings";
const pmContentUrl =
  "https://app.guesty.com/api/pm-websites-backend/engines/content";
const openApiListingsUrl = "https://open-api.guesty.com/v1/listings";
const pmAuthToken = process.env.GUESTY_PM_AUTH_TOKEN || "";
const pmAllowedLangs = ["de", "es", "fr", "it", "ja", "ko", "pt", "el", "pl", "ro", "in", "zh", "nl", "bg"];
const pmLangRaw = process.env.GUESTY_PM_LANG || "";
const pmLang = pmAllowedLangs.includes(pmLangRaw) ? pmLangRaw : "";

const clientId = process.env.GUESTY_CLIENT_ID;
const clientSecret = process.env.GUESTY_CLIENT_SECRET;
const pmAidCs = process.env.GUESTY_PM_G_AID_CS;
const pmRequestContext = process.env.GUESTY_PM_X_REQUEST_CONTEXT;

let openApiToken = null;
let openApiExp = 0;

const LISTINGS_CACHE_TTL_MS = Number(process.env.GUESTY_LISTINGS_CACHE_TTL_MS || 5 * 60_000); // 5 min
let listingsCache = { key: "", expiresAt: 0, data: null };

const getListingsCache = (key) => {
  if (!listingsCache.data) return null;
  if (listingsCache.key !== key) return null;
  if (Date.now() > listingsCache.expiresAt) {
    listingsCache = { key: "", expiresAt: 0, data: null };
    return null;
  }
  return listingsCache.data;
};

const setListingsCache = (key, data) => {
  listingsCache = { key, data, expiresAt: Date.now() + LISTINGS_CACHE_TTL_MS };
};

/* =========================
   UTILS
========================= */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchWithTimeout = async (url, options = {}, timeoutMs = 9000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

/* =========================
   OPEN API TOKEN
========================= */

async function getOpenApiToken() {
  if (openApiToken && Date.now() < openApiExp - 60_000) return openApiToken;

  const res = await fetchWithTimeout(`${openApiHost}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "open-api",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) throw new Error(await res.text());

  const json = await res.json();
  openApiToken = json.access_token;
  openApiExp = Date.now() + (json.expires_in - 300) * 1000;
  return openApiToken;
}

/* =========================
   PM CONTENT
========================= */

async function fetchPmListings(options = {}) {
  // Use Open API listings only
  const openApiList = await fetchOpenApiListings(options);
  if (!Array.isArray(openApiList) || openApiList.length === 0) {
    throw new Error("Open API listings returned no results");
  }
  return normalizePmListings(openApiList);
}

function normalizePmListings(listings) {
  const list = Array.isArray(listings) ? listings : [];
  const map = new Map();

  list.forEach((l) => {
    const id = l._id || l.id;
    if (id && l.title) map.set(id, l);
  });

  return [...map.values()].map((l) => ({
    id: l._id || l.id,
    _id: l._id || l.id,
    title: l.title,
    nickname: l.nickname,
    accommodates: l.accommodates,
    accountId: l.accountId,
    address: l.address,
    bathrooms: l.bathrooms,
    bedrooms: l.bedrooms,
    beds: l.beds,
    propertyType: l.propertyType,
    tags: l.tags,
    picture:
      l.picture?.original ||
      l.picture?.large ||
      l.picture?.regular ||
      l.picture?.thumbnail ||
      l.picture ||
      {},
    pictures: Array.isArray(l.pictures) ? l.pictures : [],
    prices: l.prices,
    basePrice: l.prices?.basePrice,
    currency: l.prices?.currency || "USD",
    publicDescription: l.publicDescription,
    reviews: l.reviews,
    roomType: l.roomType,
  }));
}

const fetchOpenApiListings = async ({
  checkIn,
  checkOut,
  minOccupancy = 1,
  city = "",
  tags = "",
  ids = "",
  limit = 50,
} = {}) => {
  try {
    const cacheKey = JSON.stringify({ checkIn, checkOut, minOccupancy, city, tags, ids, limit });
    const cached = getListingsCache(cacheKey);
    if (cached) return cached;

    const token = await getOpenApiToken();
    const headers = {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
    };

    const MAX_CONCURRENT = Number(process.env.GUESTY_MAX_CONCURRENT || 1);
    const MIN_INTERVAL_MS = Number(process.env.GUESTY_MIN_INTERVAL_MS || 1200);
    let activeCount = 0;
    let lastStart = 0;
    const pending = [];
    const schedule = () =>
      new Promise((resolve) => {
        const run = () => {
          if (activeCount >= MAX_CONCURRENT) {
            pending.push(run);
            return;
          }
          const now = Date.now();
          const waitMs = Math.max(0, lastStart + MIN_INTERVAL_MS - now);
          const start = () => {
            activeCount += 1;
            lastStart = Date.now();
            resolve(() => {
              activeCount = Math.max(0, activeCount - 1);
              const next = pending.shift();
              if (next) next();
            });
          };
          if (waitMs > 0) setTimeout(start, waitMs);
          else start();
        };
        run();
      });
    const withLimit = async (fn) => {
      const release = await schedule();
      try {
        return await fn();
      } finally {
        release();
      }
    };

    const results = [];
    let cursor = "";
    let guard = 0;

    do {
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      qs.set("sort", "-createdAt");
      qs.set(
        "fields",
        "_id nickname title type address address.full address.city address.country terms prices picture pictures accommodates bedrooms bathrooms propertyType timezone tags mtl"
      );
      if (checkIn && checkOut) {
        qs.set(
          "available",
          JSON.stringify({
            checkIn,
            checkOut,
            minOccupancy: Number(minOccupancy) || 1,
          })
        );
      }
      if (city) qs.set("city", city);
      if (tags) qs.set("tags", tags);
      if (ids) qs.set("ids", ids);
      if (cursor) qs.set("cursor", cursor);

      const fetchPage = async (attempt = 0) => {
        const res = await withLimit(() =>
          fetchWithTimeout(`${openApiListingsUrl}?${qs.toString()}`, { headers })
        );
        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after") || 0);
          if (attempt >= 4) throw new Error("Rate limited by Guesty (listings)");
          const backoff =
            retryAfter > 0
              ? retryAfter * 1000
              : Math.min(5000, 700 * 2 ** attempt) + Math.random() * 200;
          await wait(backoff);
          return fetchPage(attempt + 1);
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(body || res.status);
        }
        return res.json();
      };

      const json = await fetchPage();
      if (Array.isArray(json?.results)) results.push(...json.results);
      cursor = json?.pagination?.cursor?.next || "";
      guard += 1;
    } while (cursor && guard < 25);

    setListingsCache(cacheKey, results);
    return results;
  } catch (err) {
    console.error("Open API listings fetch failed", err?.message || err);
    throw err;
  }
};

const extractFromPmContent = (pmData) => {
  const stack = [pmData];
  const out = [];
  while (stack.length) {
    const cur = stack.pop();
    if (Array.isArray(cur)) stack.push(...cur);
    else if (cur && typeof cur === "object") {
      if ((cur._id || cur.id) && cur.title) out.push(cur);
      stack.push(...Object.values(cur));
    }
  }
  return out;
};

/* =========================
   NETLIFY HANDLER
========================= */

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

module.exports.handler = async (event) => {
  try {
    const path = event.path.replace("/.netlify/functions/guesty", "");
    const method = event.httpMethod;

    /* LISTINGS */
    if (method === "GET" && path === "/listings") {
      const params = event.queryStringParameters || {};
      const {
        checkIn,
        checkOut,
        minOccupancy = 1,
        city = "",
        tags = "",
        ids = "",
        limit = 50,
      } = params;

      const pm = await fetchPmListings({
        checkIn,
        checkOut,
        minOccupancy,
        city,
        tags,
        ids,
        limit,
      });
      return json(200, { results: normalizePmListings(pm) });
    }

    /* QUOTES (OPEN API) */
    if (method === "POST" && path === "/reservations/quotes") {
      const body = JSON.parse(event.body || "{}");
      const token = await getOpenApiToken();

      const res = await fetchWithTimeout(`${openApiServer}/quotes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId: body.listingId,
          checkInDateLocalized: body.checkInDateLocalized,
          checkOutDateLocalized: body.checkOutDateLocalized,
          numberOfGuests: {
            numberOfAdults: Number(body.guestsCount) || 1,
          },
          source: "website",
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const quote = await res.json();
      return json(200, { results: [quote] });
    }

    return json(404, { message: "Not Found" });
  } catch (err) {
    return json(500, { message: "Error", error: err.message });
  }
};
