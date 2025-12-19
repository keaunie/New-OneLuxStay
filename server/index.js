// Local Express API that mirrors the Netlify function behavior for dev/testing against Guesty.
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import openApiDocs from "@api/open-api-docs";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const guestyHost = "https://booking.guesty.com";
const openApiHost = "https://open-api.guesty.com";
const clientId = process.env.GUESTY_CLIENT_ID;
const clientSecret = process.env.GUESTY_CLIENT_SECRET;
const pmContentUrl = "https://app.guesty.com/api/pm-websites-backend/engines/content";
const pmAidCs = process.env.GUESTY_PM_G_AID_CS || "G-89C7E-9FB65-B6F69";
const pmRequestContext = process.env.GUESTY_PM_X_REQUEST_CONTEXT;
const pmOrigin = process.env.GUESTY_PM_ORIGIN || "https://reservations.oneluxstay.com";
const pmReferer = process.env.GUESTY_PM_REFERER || "https://reservations.oneluxstay.com/";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tokenCacheFile = path.join(__dirname, "../.guesty-token-cache.json");
const openApiTokenCacheFile = path.join(__dirname, "../.guesty-openapi-token-cache.json");
const openApiServer = "https://open-api.guesty.com/v1";

app.use(cors());
app.use(express.json());

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;
let pmCache = {};
let pmContentPromise = null;
let openApiCachedToken = null;
let openApiTokenExpiresAt = 0;
let openApiTokenPromise = null;
const pmCacheTtlMs = 5 * 60 * 1000;
const isObject = (val) => val && typeof val === "object" && !Array.isArray(val);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Abort-based fetch wrapper so upstream calls cannot hang the server.
const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
};

const readTokenCache = async () => {
  try {
    const raw = await fs.readFile(tokenCacheFile, "utf-8");
    const data = JSON.parse(raw);
    if (!data?.accessToken || !data?.expiresAt) return null;
    if (Date.now() >= data.expiresAt - 60_000) return null; // refresh 60s early
    return data;
  } catch {
    return null;
  }
};

const writeTokenCache = async (accessToken, expiresAt) => {
  const payload = JSON.stringify({ accessToken, expiresAt }, null, 2);
  try {
    await fs.writeFile(tokenCacheFile, payload, "utf-8");
  } catch (err) {
    console.warn(`Failed to write token cache: ${err.message}`);
  }
};

const readOpenApiTokenCache = async () => {
  try {
    const raw = await fs.readFile(openApiTokenCacheFile, "utf-8");
    const data = JSON.parse(raw);
    if (!data?.accessToken || !data?.expiresAt) return null;
    if (Date.now() >= data.expiresAt - 60_000) return null;
    return data;
  } catch {
    return null;
  }
};

const writeOpenApiTokenCache = async (accessToken, expiresAt) => {
  const payload = JSON.stringify({ accessToken, expiresAt }, null, 2);
  try {
    await fs.writeFile(openApiTokenCacheFile, payload, "utf-8");
  } catch (err) {
    console.warn(`Failed to write open-api token cache: ${err.message}`);
  }
};

async function getToken() {
  // Client-credentials token for booking.guesty.com, cached in memory and disk.
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;
  if (tokenPromise) return tokenPromise;

  const cachedFile = await readTokenCache();
  if (cachedFile) {
    cachedToken = cachedFile.accessToken;
    tokenExpiresAt = cachedFile.expiresAt;
    return cachedToken;
  }

  if (!clientId || !clientSecret) {
    throw new Error("Missing Guesty credentials in environment variables");
  }

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
      if (res.status === 429) {
        throw new Error("RATE_LIMITED");
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token request failed: ${res.status} ${text}`);
      }
      return res.json();
    })
    .then((json) => {
      cachedToken = json.access_token;
      tokenExpiresAt = Date.now() + (json.expires_in || 86_400) * 1000;
      writeTokenCache(cachedToken, tokenExpiresAt);
      return cachedToken;
    })
    .catch(async (err) => {
      if (err.message === "RATE_LIMITED") {
        // simple backoff and retry once after 1.5s
        await wait(1500);
        return getToken();
      }
      throw err;
    })
    .finally(() => {
      tokenPromise = null;
    });

  return tokenPromise;
}

async function getOpenApiToken() {
  // Client-credentials token for the Open API (used only by the SDK helpers).
  const now = Date.now();
  if (openApiCachedToken && now < openApiTokenExpiresAt - 60_000) return openApiCachedToken;
  if (openApiTokenPromise) return openApiTokenPromise;

  const cachedFile = await readOpenApiTokenCache();
  if (cachedFile) {
    openApiCachedToken = cachedFile.accessToken;
    openApiTokenExpiresAt = cachedFile.expiresAt;
    return openApiCachedToken;
  }

  if (!clientId || !clientSecret) {
    throw new Error("Missing Guesty credentials in environment variables");
  }

  openApiTokenPromise = fetchWithTimeout(`${openApiHost}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "open-api",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
    .then(async (res) => {
      if (res.status === 429) throw new Error("RATE_LIMITED");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Open API token request failed: ${res.status} ${text}`);
      }
      return res.json();
    })
    .then((json) => {
      openApiCachedToken = json.access_token;
      openApiTokenExpiresAt = Date.now() + ((json.expires_in || 86_400) - 300) * 1000; // refresh 5m early
      writeOpenApiTokenCache(openApiCachedToken, openApiTokenExpiresAt);
      return openApiCachedToken;
    })
    .catch(async (err) => {
      if (err.message === "RATE_LIMITED") {
        await wait(1500);
        return getOpenApiToken();
      }
      throw err;
    })
    .finally(() => {
      openApiTokenPromise = null;
    });

  return openApiTokenPromise;
}

async function guestyFetch(path, init = {}) {
  // Thin wrapper that injects the booking API bearer token and throws on non-2xx.
  const token = await getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(init.headers || {}),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetchWithTimeout(`${guestyHost}${path}`, { ...init, headers });

  if (res.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guesty API error ${res.status}: ${text}`);
  }

  return res.json();
}

// Cached pull of PM website content (listings data) with pm headers.
const fetchPmContent = async (lang = "en") => {
  const now = Date.now();
  const cacheEntry = pmCache[lang];
  if (cacheEntry && now < cacheEntry.expiresAt - 60_000) return cacheEntry.data;
  if (pmContentPromise) return pmContentPromise;
  if (!pmAidCs || !pmRequestContext) {
    throw new Error("Missing pm content headers in environment");
  }

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
};

// Quote creation via PM websites backend (no OAuth; uses pm headers).
const fetchPmReservationQuote = async (payload) => {
  if (!pmAidCs || !pmRequestContext) {
    throw new Error("Missing pm content headers in environment");
  }

  // 🔒 Validate required fields before sending
  const required = ["listingId", "checkInDateLocalized", "checkOutDateLocalized"];
  for (const key of required) {
    if (!payload?.[key]) {
      throw new Error(`Missing required payload field: ${key}`);
    }
  }

  const headers = {
    accept: "application/json, text/plain, */*",
    "content-type": "application/json",
    "g-aid-cs": pmAidCs,
    "x-request-context": pmRequestContext,
    origin: pmOrigin,
    referer: pmReferer,
  };

  const url =
    "https://app.guesty.com/api/pm-websites-backend/reservations/quotes";

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload), // ✅ FIXED
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(`pm reservations quote error ${res.status}: ${text}`);
  }

  return text ? JSON.parse(text) : { text };
};



// Walk the PM content tree and extract listing records in a flat array.
const normalizePmListings = (pmData) => {
  const stack = [pmData];
  const listingsMap = new Map();

  while (stack.length) {
    const cur = stack.pop();
    if (Array.isArray(cur)) {
      stack.push(...cur);
    } else if (isObject(cur)) {
      const hasBeds = cur.title && (cur.bedrooms !== undefined || cur.bathrooms !== undefined || cur.beds !== undefined);
      const id = cur._id || cur.id;
      if (hasBeds && id && !listingsMap.has(id)) {
        listingsMap.set(id, cur);
      }
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
};

const normalizePmQuotes = (pmData) => {
  const stack = [pmData];
  const quotesMap = new Map();

  while (stack.length) {
    const cur = stack.pop();

    if (Array.isArray(cur)) {
      stack.push(...cur);
      continue;
    }

    if (!isObject(cur)) continue;

    const isQuote =
      cur._id &&
      cur.expiresAt &&
      Array.isArray(cur.stay) &&
      cur.stay.length > 0 &&
      cur.rates?.ratePlans;


    if (isQuote && !quotesMap.has(cur._id)) {
      quotesMap.set(cur._id, cur);
    }

    stack.push(...Object.values(cur));
  }

  const mapQuote = (quote) => ({
    id: quote._id,
    status: quote.status,
    createdAt: quote.createdAt,
    expiresAt: quote.expiresAt,

    accountId: quote.accountId,
    channel: quote.channel,
    source: quote.source,

    unitTypeId: quote.unitTypeId,
    guestsCount: quote.guestsCount,

    checkIn: quote.checkInDateLocalized,
    checkOut: quote.checkOutDateLocalized,

    numberOfGuests: quote.numberOfGuests,

    stay: quote.stay.map((s) => ({
      unitTypeId: s.unitTypeId,
      checkIn: s.checkInDateLocalized,
      checkOut: s.checkOutDateLocalized,
      guestsCount: s.guestsCount,
      eta: s.eta,
      etd: s.etd,
    })),

    ratePlans: quote.rates.ratePlans.map((rp) => {
      const plan = rp.ratePlan || {};
      const money = plan.money || {};

      return {
        inquiryId: rp.inquiryId,
        ratePlanId: plan._id,
        name: plan.name,
        cancellationPolicy: plan.cancellationPolicy,
        minNights: plan.minNights,

        currency: money.currency,

        pricing: {
          accommodation: money.fareAccommodation,
          accommodationAdjusted: money.fareAccommodationAdjusted,
          cleaningFee: money.fareCleaning,
          totalFees: money.totalFees,
          subtotal: money.subTotalPrice,
          taxes: money.totalTaxes,
          hostPayout: money.hostPayout,
          hostPayoutUsd: money.hostPayoutUsd,
          invoiceItems: money.invoiceItems || [],
        },

        days: rp.days.map((d) => ({
          date: d.date,
          price: d.price,
          basePrice: d.basePrice,
          manualPrice: d.manualPrice,
          minNights: d.minNights,
          maxNights: d.maxNights,
          currency: d.currency,
        })),
      };
    }),

    coupons: quote.coupons || [],
    promotions: quote.promotions || {},
  });

  return Array.from(quotesMap.values()).map(mapQuote);
};


// Optional fallback: create quote through Open API SDK (rarely used).
const createQuoteViaSdk = async (payload) => {
  // Configure per-call to avoid stale auth/server
  openApiDocs.server(openApiServer);
  const token = await getOpenApiToken();
  openApiDocs.auth(`Bearer ${token}`);
  const response = await openApiDocs.quotesOpenApiController_create(payload);
  // SDK returns { data, status, headers }; we only need the data payload
  return response?.data || response;
};

const getQuoteViaSdk = async (quoteId) => {
  openApiDocs.server(openApiServer);
  const token = await getOpenApiToken();
  openApiDocs.auth(`Bearer ${token}`);
  const response = await openApiDocs.quotesOpenApiController_getQuote({ quoteId });
  return response?.data || response;
};

app.get("/api/listings", async (_req, res) => {
  try {
    const pmData = await fetchPmContent("en");
    const listings = normalizePmListings(pmData);
    res.json({ results: listings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load listings", error: err.message });
  }
});

const buildQuotePayload = ({
  listingId,
  checkInDateLocalized,
  checkOutDateLocalized,
  guestsCount,
  guest,
  coupons,
}) => ({
  listingId,
  checkInDateLocalized,
  checkOutDateLocalized,
  guestsCount: Number(guestsCount), // ✅ MUST BE NUMBER
  ...(guest ? { guest } : {}),
  ...(coupons ? { coupons } : {}),
});




// app.post("/api/reservations/quotes", async (_req, res) => {
//   const { listingId, checkInDateLocalized, checkOutDateLocalized, guestsCount } = _req.body || {};

//   if (!listingId || !checkInDateLocalized || !checkOutDateLocalized || guestsCount === undefined) {
//     return res.status(400).json({ message: "listingId, checkInDateLocalized, checkOutDateLocalized, and guestsCount are required kupal" });
//   }

//   try {
//     const payload = buildQuotePayload({
//       listingId,
//       checkInDateLocalized,
//       checkOutDateLocalized,
//       guestsCount: Number(guestsCount),
//     });

//     const pmData = await fetchPmReservationQuote(payload)
//     console.log("RAW PM QUOTE:", JSON.stringify(pmData, null, 2));
//     const quotes = normalizePmQuotes(pmData);
//     res.json({ results: quotes });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: "Failed to load Quotes", error: err.message });
//   }
// });


app.post("/api/reservations/quotes", async (req, res) => {
  try {
    const payload = {
      listingId: req.body.listingId,
      checkInDateLocalized: req.body.checkInDateLocalized,
      checkOutDateLocalized: req.body.checkOutDateLocalized,
      guestsCount: Number(req.body.guestsCount),
    };

    const pmData = await fetchPmReservationQuote(payload);

    // 🔥 RETURN RAW DATA — NO NORMALIZATION
    return res.json({ raw: pmData });
  } catch (err) {
    console.error("QUOTE ERROR:", err);
    return res.status(500).json({
      message: "Failed to load Quotes",
      error: err.message,
    });
  }
});



app.get("/api/listings/:id/availability", async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate, adults = 1 } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate and endDate are required (YYYY-MM-DD)" });
  }

  try {
    const query = `listingId=${id}&startDate=${startDate}&endDate=${endDate}&adults=${adults}`;
    const primary = await guestyFetch(`/api/availability-pricing/availability?${query}`);
    res.json(primary);
  } catch (primaryErr) {
    console.warn("Primary availability endpoint failed, attempting fallback:", primaryErr.message);
    try {
      const fallback = await guestyFetch(`/api/availability/${id}?startDate=${startDate}&endDate=${endDate}&adults=${adults}`);
      res.json(fallback);
    } catch (fallbackErr) {
      console.error(fallbackErr);
      res.status(502).json({
        message: "Unable to fetch availability from Guesty",
        error: fallbackErr.message,
      });
    }
  }
});

app.get("/api/listings/:id/price-estimate", async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate, adults = 1, children = 0 } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate and endDate are required (YYYY-MM-DD)" });
  }

  try {
    const query = `listingId=${id}&startDate=${startDate}&endDate=${endDate}&adults=${adults}&children=${children}`;
    const estimate = await guestyFetch(`/api/availability-pricing/price-estimate?${query}`);
    res.json(estimate);
  } catch (err) {
    console.error(err);
    res.status(502).json({ message: "Unable to fetch price estimate", error: err.message });
  }
});

// app.post("/api/book", async (req, res) => {
//   // Creates a booking via the booking API using the bearer token.
//   const { listingId, checkIn, checkOut, adults = 1, children = 0, guest } = req.body || {};
//   if (!listingId || !checkIn || !checkOut || !guest?.firstName || !guest?.lastName || !guest?.email) {
//     return res.status(400).json({ message: "Missing required booking fields" });
//   }

//   try {
//     const payload = {
//       listingId,
//       checkIn,
//       checkOut,
//       numberOfAdults: Number(adults),
//       numberOfChildren: Number(children),
//       guest,
//     };

//     const result = await guestyFetch("/api/reservations", {
//       method: "POST",
//       body: JSON.stringify(payload),
//     });

//     res.json({ message: "Booking created", data: result });
//   } catch (err) {
//     console.error(err);
//     res.status(502).json({ message: "Booking failed", error: err.message });
//   }
// });

// const buildQuotePayload = ({ listingId, checkInDateLocalized, checkOutDateLocalized, guestsCount, source = "manual", guest, coupons }) => ({
//   listingId,
//   checkInDateLocalized,
//   checkOutDateLocalized,
//   guestsCount,
//   source,
//   ...(guest ? { guest } : {}),
//   ...(coupons ? { coupons } : {}),
// });

// const handleQuoteRequest = async (req, res) => {
//   // Creates a quote to lock pricing; primary path is PM backend with pm headers.
//   const { listingId, checkInDateLocalized, checkOutDateLocalized, guestsCount, source, guest, coupons } = req.body || {};

//   if (!listingId || !checkInDateLocalized || !checkOutDateLocalized || guestsCount === undefined) {
//     return res.status(400).json({ message: "listingId, checkInDateLocalized, checkOutDateLocalized, and guestsCount are required" });
//   }

//   try {
//     const payload = buildQuotePayload({
//       listingId,
//       checkInDateLocalized,
//       checkOutDateLocalized,
//       guestsCount: Number(guestsCount),
//       source: source || "manual",
//       guest,
//       coupons,
//     });
//     const quote = await fetchPmReservationQuote(payload);

//     res.json({ data: quote });

//   } catch (err) {
//     console.error(err);
//     res.status(502).json({ message: "Quote request failed", error: err.message });
//   }
// };

// // Allow frontend to call the same handler using the Guesty-style path.
// app.post("/api/reservations/quotes", handleQuoteRequest);

// app.get("/api/quotes/:id", async (req, res) => {
//   const { id } = req.params;
//   if (!id) return res.status(400).json({ message: "quote id is required" });
//   try {
//     let quote;
//     try {
//       quote = await getQuoteViaSdk(id);
//     } catch (sdkErr) {
//       console.warn("SDK get quote failed, falling back to direct fetch:", sdkErr.message);
//       quote = await guestyFetch(`/v1/quotes/${encodeURIComponent(id)}`);
//     }
//     res.json(quote);
//   } catch (err) {
//     console.error(err);
//     res.status(502).json({ message: "Failed to fetch quote", error: err.message });
//   }
// });

app.get("/api/pm-content", async (req, res) => {
  const { lang = "en" } = req.query;
  try {
    const data = await fetchPmContent(lang);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load pm content", error: err.message });
  }
});

app.get("/api/pm-available", async (req, res) => {
  const { lang = "en" } = req.query;
  try {
    const data = await fetchPmContent(lang);
    const listings = normalizePmListings(data);
    res.json({ results: listings });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load pm content", error: err.message });
  }
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});

// Simple root handler to indicate the API is running.
app.get("/", (_req, res) => {
  res.send("API is running. Use /api/* endpoints (e.g., /api/listings).");
});
