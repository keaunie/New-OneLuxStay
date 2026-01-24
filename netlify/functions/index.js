import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import serverless from "serverless-http";
import fs from "fs/promises";
import os from "os";
import path from "path";
import Stripe from "stripe";

dotenv.config();

/* =======================
   NETLIFY SAFE PATHS
======================= */

// Netlify allows writing to /tmp; in local dev use the OS tmp dir (Windows safe)
const TMP_DIR = os.tmpdir();
const OPEN_API_TOKEN_FILE = path.join(TMP_DIR, "guesty-openapi-token.json");
const OPEN_API_TOKEN_CACHE_PATH =
    process.env.GUESTY_OPEN_API_TOKEN_CACHE || OPEN_API_TOKEN_FILE;

/* =======================
   APP SETUP
======================= */

const app = express();
const corsOrigins = [
    process.env.APP_ORIGIN,
    "https://papayawhip-stinkbug-261234.hostingersite.com",
    "https://oneluxstay.com",
    "https://www.oneluxstay.com",
    "http://localhost:8888",
    "http://localhost:5173",
    "http://localhost:3000",
].filter(Boolean);
app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin) return callback(null, true);
            if (corsOrigins.includes(origin)) return callback(null, true);
            return callback(new Error("Not allowed by CORS"));
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);
app.options("/", cors());
app.use(
    express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    })
);
app.use((_req, res, next) => {
    if (Number.isFinite(openApiRateLimitState.limitSecond)) {
        res.set("X-Guesty-RateLimit-Limit-Second", String(openApiRateLimitState.limitSecond));
    }
    if (Number.isFinite(openApiRateLimitState.limitMinute)) {
        res.set("X-Guesty-RateLimit-Limit-Minute", String(openApiRateLimitState.limitMinute));
    }
    if (Number.isFinite(openApiRateLimitState.limitHour)) {
        res.set("X-Guesty-RateLimit-Limit-Hour", String(openApiRateLimitState.limitHour));
    }
    if (Number.isFinite(openApiRateLimitState.remainingSecond)) {
        res.set("X-Guesty-RateLimit-Remaining-Second", String(openApiRateLimitState.remainingSecond));
    }
    if (Number.isFinite(openApiRateLimitState.remainingMinute)) {
        res.set("X-Guesty-RateLimit-Remaining-Minute", String(openApiRateLimitState.remainingMinute));
    }
    if (Number.isFinite(openApiRateLimitState.remainingHour)) {
        res.set("X-Guesty-RateLimit-Remaining-Hour", String(openApiRateLimitState.remainingHour));
    }
    if (openApiRateLimitState.nextAllowedAt > Date.now()) {
        res.set("X-Guesty-RateLimit-Next-Allowed-At", String(openApiRateLimitState.nextAllowedAt));
    }
    next();
});
app.disable("etag");
app.use((_req, res, next) => {
    // Prevent conditional requests that return 304 with empty bodies
    res.set("Cache-Control", "no-store, no-cache, must-revalidate");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
    next();
});

/* =======================
   ENV & CONSTANTS
======================= */

const OPEN_API_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";
const OPEN_API_BASE = "https://open-api.guesty.com/v1";
 

const OPEN_API_CLIENT_ID =
    process.env.GUESTY_OPEN_API_CLIENT_ID || process.env.GUESTY_CLIENT_ID;
const OPEN_API_CLIENT_SECRET =
    process.env.GUESTY_OPEN_API_CLIENT_SECRET || process.env.GUESTY_CLIENT_SECRET;
const OPEN_API_LISTINGS_URL = "https://open-api.guesty.com/v1/listings";
const extraListingIds = (process.env.GUESTY_EXTRA_LISTING_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const appOrigin = process.env.APP_ORIGIN || "";
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2023-10-16" }) : null;

const hasOpenApiCreds = Boolean(OPEN_API_CLIENT_ID && OPEN_API_CLIENT_SECRET);

/* =======================
   UTILS
======================= */

const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (promise, timeoutMs, label = "Request") =>
    Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
        ),
    ]);
const isTimeoutError = (err) =>
    String(err?.message || "").toLowerCase().includes("timed out");

const openApiRateLimitState = {
    nextAllowedAt: 0,
    remainingSecond: null,
    remainingMinute: null,
    remainingHour: null,
    limitSecond: null,
    limitMinute: null,
    limitHour: null,
};
const parseLimitHeader = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
};
const updateRateLimitFromHeaders = (headers, state) => {
    const remainingSecond = parseLimitHeader(headers.get("x-ratelimit-remaining-second"));
    const remainingMinute = parseLimitHeader(headers.get("x-ratelimit-remaining-minute"));
    const remainingHour = parseLimitHeader(headers.get("x-ratelimit-remaining-hour"));
    const limitSecond = parseLimitHeader(headers.get("x-ratelimit-limit-second"));
    const limitMinute = parseLimitHeader(headers.get("x-ratelimit-limit-minute"));
    const limitHour = parseLimitHeader(headers.get("x-ratelimit-limit-hour"));
    const now = Date.now();
    let nextAt = state.nextAllowedAt;
    if (remainingSecond === 0) nextAt = Math.max(nextAt, now + 1000);
    if (remainingMinute === 0) nextAt = Math.max(nextAt, now + 60_000);
    if (remainingHour === 0) nextAt = Math.max(nextAt, now + 60 * 60_000);
    state.nextAllowedAt = nextAt;
    state.remainingSecond = remainingSecond;
    state.remainingMinute = remainingMinute;
    state.remainingHour = remainingHour;
    state.limitSecond = limitSecond;
    state.limitMinute = limitMinute;
    state.limitHour = limitHour;
};
const getRetryAfterMs = (headers) => {
    const retryAfter = Number(headers.get("retry-after") || 0);
    return retryAfter > 0 ? retryAfter * 1000 : 0;
};
const guestyFetch = async (url, options = {}, timeout = 10000, maxAttempts = 5) => {
    let attempt = 0;
    while (attempt <= maxAttempts) {
        const now = Date.now();
        if (openApiRateLimitState.nextAllowedAt > now) {
            await wait(openApiRateLimitState.nextAllowedAt - now);
        }
        const res = await withLimit(() => fetchWithTimeout(url, options, timeout));
        updateRateLimitFromHeaders(res.headers, openApiRateLimitState);
        if (res.status !== 429) return res;

        const retryMs = getRetryAfterMs(res.headers) || Math.min(8000, 800 * 2 ** attempt);
        openApiRateLimitState.nextAllowedAt = Math.max(
            openApiRateLimitState.nextAllowedAt,
            Date.now() + retryMs
        );
        if (attempt >= maxAttempts) {
            const body = await res.text().catch(() => "");
            const err = new Error(body || "Rate limited by Guesty");
            err.rateLimited = true;
            err.status = 429;
            throw err;
        }
        attempt += 1;
        await wait(retryMs);
    }
    throw new Error("Guesty request failed");
};


const splitName = (fullName = "") => {
    const parts = String(fullName).trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstName: "Guest", lastName: "Guest" };
    if (parts.length === 1) return { firstName: parts[0], lastName: "Guest" };
    return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
};

const buildGuestFromStripe = (session = {}) => {
    const details = session.customer_details || {};
    const metadata = session.metadata || {};
    const email = details.email || session.customer_email || metadata.guestEmail || "";
    if (!email) return null;
    const name = details.name || metadata.guestName || "";
    const phone = details.phone || metadata.guestPhone || "";
    const { firstName, lastName } = splitName(name);
    return {
        firstName,
        lastName,
        email,
        phone: phone || undefined,
    };
};

const AVAILABILITY_CACHE_TTL_MS = 10 * 60_000;
const AVAILABILITY_CACHE_MAX = 500;
const availabilityCache = new Map();
const AVAILABILITY_RATE_LIMIT_MS =
    Number(process.env.GUESTY_AVAILABILITY_RATE_LIMIT_MS || 60_000);
const availabilityRateLimitedUntil = new Map();
const AVAILABILITY_BULK_TIMEOUT_MS =
    Number(process.env.GUESTY_AVAILABILITY_BULK_TIMEOUT_MS || 25000);
const AVAILABILITY_BULK_MAX_IDS =
    Number(process.env.GUESTY_AVAILABILITY_BULK_MAX_IDS || 60);
const quoteCache = new Map();
const QUOTE_CACHE_TTL_MS =
    Number(process.env.GUESTY_QUOTE_CACHE_TTL_MS || 15 * 60_000); // default 15 min
let quoteRateLimitedUntil = 0;
const QUOTE_BULK_LIMIT = Number(process.env.GUESTY_QUOTE_BULK_LIMIT || 2);
const QUOTE_BULK_TIMEOUT_MS =
    Number(process.env.GUESTY_QUOTE_BULK_TIMEOUT_MS || 10000);
const QUOTE_BULK_TIMEOUT_RETRY_MS =
    Number(process.env.GUESTY_QUOTE_BULK_TIMEOUT_RETRY_MS || 12000);
const QUOTE_BULK_PREWARM_LIMIT =
    Number(process.env.GUESTY_QUOTE_BULK_PREWARM_LIMIT || 2);
const CALENDAR_CACHE_TTL_MS =
    Number(process.env.GUESTY_CALENDAR_CACHE_TTL_MS || 6 * 60 * 60_000); // default 6 hours
const calendarCache = new Map();
const CALENDAR_RATE_LIMIT_MS =
    Number(process.env.GUESTY_CALENDAR_RATE_LIMIT_MS || 60_000);
const calendarRateLimitedUntil = new Map();
const inflightListings = new Map();
const inflightAvailability = new Map();
const inflightQuotes = new Map();
const inflightCalendars = new Map();
const landmarksCache = new Map();
const LANDMARKS_CACHE_TTL_MS = 24 * 60 * 60_000;

const LISTINGS_CACHE_TTL_MS = Number(process.env.GUESTY_LISTINGS_CACHE_TTL_MS || 5 * 60_000); // 5 min
let listingsCache = { key: "", expiresAt: 0, data: null };
const MAX_LISTINGS_LIMIT = Number(process.env.GUESTY_LISTINGS_LIMIT || 20);
const LISTINGS_RATE_LIMIT_MS =
    Number(process.env.GUESTY_LISTINGS_RATE_LIMIT_MS || 60_000);
const listingsRateLimitedUntil = new Map();

const getListingsCache = (key) => {
    if (!listingsCache.data) return null;
    if (listingsCache.key !== key) return null;
    if (Date.now() > listingsCache.expiresAt) {
        listingsCache = { key: "", expiresAt: 0, data: null };
        return null;
    }
    return listingsCache.data;
};

const getListingsCacheStale = (key) => {
    if (!listingsCache.data) return null;
    if (listingsCache.key !== key) return null;
    return listingsCache.data;
};

const setListingsCache = (key, data) => {
    listingsCache = { key, data, expiresAt: Date.now() + LISTINGS_CACHE_TTL_MS };
};

// Simple limiter: cap concurrent Guesty calls and pace to N per second
const MAX_CONCURRENT = Number(process.env.GUESTY_MAX_CONCURRENT || 1);
const MIN_INTERVAL_MS = Number(process.env.GUESTY_MIN_INTERVAL_MS || 1000); // slower by default to avoid 429s
let activeCount = 0;
let lastStart = 0;
const pendingQueue = [];

const schedule = () =>
    new Promise((resolve) => {
        const run = () => {
            if (activeCount >= MAX_CONCURRENT) {
                pendingQueue.push(run);
                return;
            }
            const now = Date.now();
            const waitMs = Math.max(0, lastStart + MIN_INTERVAL_MS - now);
            const start = () => {
                activeCount += 1;
                lastStart = Date.now();
                resolve(() => {
                    activeCount = Math.max(0, activeCount - 1);
                    const next = pendingQueue.shift();
                    if (next) next();
                });
            };
            if (waitMs > 0) {
                setTimeout(start, waitMs);
            } else {
                start();
            }
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

const getAvailabilityCache = (key) => {
    const entry = availabilityCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        availabilityCache.delete(key);
        return null;
    }
    return entry.value;
};

const getAvailabilityCacheStale = (key) => {
    const entry = availabilityCache.get(key);
    return entry ? entry.value : null;
};

const setAvailabilityCache = (key, value) => {
    if (availabilityCache.size >= AVAILABILITY_CACHE_MAX) {
        const firstKey = availabilityCache.keys().next().value;
        if (firstKey) availabilityCache.delete(firstKey);
    }
    availabilityCache.set(key, { value, expiresAt: Date.now() + AVAILABILITY_CACHE_TTL_MS });
};

const getQuoteCache = (key) => {
    const entry = quoteCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        quoteCache.delete(key);
        return null;
    }
    return entry.value;
};

const getQuoteCacheStale = (key) => {
    const entry = quoteCache.get(key);
    return entry ? entry.value : null;
};

const getLandmarksCache = (key) => {
    const entry = landmarksCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        landmarksCache.delete(key);
        return null;
    }
    return entry.value;
};

const setLandmarksCache = (key, value) => {
    landmarksCache.set(key, { value, expiresAt: Date.now() + LANDMARKS_CACHE_TTL_MS });
};

const setQuoteCache = (key, value) => {
    quoteCache.set(key, { value, expiresAt: Date.now() + QUOTE_CACHE_TTL_MS });
};

const getCalendarCache = (key) => {
    const entry = calendarCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        calendarCache.delete(key);
        return null;
    }
    return entry.value;
};

const getCalendarCacheStale = (key) => {
    const entry = calendarCache.get(key);
    return entry ? entry.value : null;
};

const setCalendarCache = (key, value) => {
    calendarCache.set(key, { value, expiresAt: Date.now() + CALENDAR_CACHE_TTL_MS });
};

const runDeduped = (map, key, fn) => {
    const existing = map.get(key);
    if (existing) return existing;
    const promise = (async () => {
        try {
            return await fn();
        } finally {
            map.delete(key);
        }
    })();
    map.set(key, promise);
    return promise;
};

const prewarmQuoteCache = (ids, { checkInDateLocalized, checkOutDateLocalized, guestsCount }) => {
    if (!Array.isArray(ids) || !ids.length) return;
    const guestsNum = Number.parseInt(guestsCount, 10);
    const guests = Number.isFinite(guestsNum) ? Math.max(1, guestsNum) : 1;
    const warmIds = ids.slice(0, Math.max(1, QUOTE_BULK_PREWARM_LIMIT));
    setTimeout(() => {
        warmIds.forEach(async (listingId) => {
            const cacheKey = [
                "quote",
                listingId,
                checkInDateLocalized,
                checkOutDateLocalized,
                guests,
            ].join("|");
            if (getQuoteCache(cacheKey)) return;
            try {
                const quote = await createQuote({
                    unitTypeId: listingId,
                    checkInDateLocalized,
                    checkOutDateLocalized,
                    numberOfGuests: { numberOfAdults: guests, numberOfChildren: 0 },
                    guestsCount: guests,
                    source: "website",
                });
                const out = { results: [quote] };
                setQuoteCache(cacheKey, out);
            } catch {
                // best-effort warmup
            }
        });
    }, 0);
};

const readCache = async (file) => {
    try {
        const raw = await fs.readFile(file, "utf-8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const toIsoDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate()
    ).padStart(2, "0")}`;

const parseIsoDate = (value) => {
    if (!value || typeof value !== "string") return null;
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
};

const addDays = (date, days) => {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
};

const addMonths = (date, months) => {
    const next = new Date(date);
    next.setMonth(next.getMonth() + months);
    return next;
};

const normalizeDayDate = (day) => {
    const raw = day?.date || day?.dateLocalized || day?.startDate || day?.day || null;
    if (!raw) return null;
    if (typeof raw === "string") return raw.split("T")[0];
    if (raw instanceof Date) return toIsoDate(raw);
    return null;
};

const writeCache = async (file, data) => {
    await fs.writeFile(file, JSON.stringify(data, null, 2));
};

/* =======================
   OPEN API TOKEN (PMS)
======================= */

let openApiToken = null;
let openApiExp = 0;

async function getOpenApiToken() {
    if (!hasOpenApiCreds) {
        throw new Error(
            "Missing Open API credentials (set GUESTY_OPEN_API_CLIENT_ID / GUESTY_OPEN_API_CLIENT_SECRET)"
        );
    }
    if (openApiToken && Date.now() < openApiExp) return openApiToken;

    const cached = await readCache(OPEN_API_TOKEN_CACHE_PATH);
    if (cached && Date.now() < cached.expires_at) {
        openApiToken = cached.access_token;
        openApiExp = cached.expires_at;
        return openApiToken;
    }

    const res = await guestyFetch(
        OPEN_API_TOKEN_URL,
        {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "client_credentials",
                scope: "open-api",
                client_id: OPEN_API_CLIENT_ID,
                client_secret: OPEN_API_CLIENT_SECRET,
            }),
        },
        10000,
        5
    );

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(body || String(res.status));
        err.status = res.status;
        if (res.status === 429) err.rateLimited = true;
        throw err;
    }

    const json = await res.json();
    openApiToken = json.access_token;
    openApiExp = Date.now() + (json.expires_in - 300) * 1000;

    await writeCache(OPEN_API_TOKEN_CACHE_PATH, {
        access_token: openApiToken,
        expires_at: openApiExp,
    });

    return openApiToken;
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
        const deduped = inflightListings.get(cacheKey);
        if (deduped) return deduped;

        const promise = (async () => {
            const token = await getOpenApiToken();
            const headers = {
                accept: "application/json",
                Authorization: `Bearer ${token}`,
            };
            const results = [];
            const pageLimit = Math.max(1, Math.min(Number(limit) || 50, 100));
            const maxPages = Number(process.env.GUESTY_LISTINGS_MAX_PAGES || 1);
            let guard = 0;
            let skip = 0;

            do {
                const qs = new URLSearchParams();
                qs.set("limit", String(pageLimit));
                qs.set("sort", "-createdAt");
                qs.set(
                    "fields",
                    "_id nickname title type address address.full address.city address.country terms prices picture pictures accommodates bedrooms bathrooms propertyType timezone tags mtl"
                );
                qs.set("active", "true");
                qs.set("listed", "true");
                qs.set("pmsActive", "true");
                if (checkIn && checkOut) {
                    const occupancy = Number(minOccupancy) || 1;
                    qs.set(
                        "available",
                        `{"checkIn":"${checkIn}","checkOut":"${checkOut}","minOccupancy":${occupancy}}`
                    );
                }
                if (city) qs.set("city", city);
                if (tags) qs.set("tags", tags);
                if (ids) qs.set("ids", ids);
                qs.set("skip", String(skip));

                const fetchPage = async () => {
                    const res = await guestyFetch(
                        `${OPEN_API_LISTINGS_URL}?${qs.toString()}`,
                        { headers },
                        4000,
                        5
                    );
                    if (!res.ok) {
                        const body = await res.text().catch(() => "");
                        const err = new Error(body || String(res.status));
                        err.status = res.status;
                        err.details = body || null;
                        if (res.status === 429) err.rateLimited = true;
                        throw err;
                    }
                    return res.json();
                };

                const json = await fetchPage();
                const pageResults = Array.isArray(json?.results) ? json.results : [];
                if (pageResults.length) results.push(...pageResults);
                skip += pageResults.length || pageLimit;
                guard += 1;
            } while (guard < maxPages);

            setListingsCache(cacheKey, results);
            return results;
        })();

        inflightListings.set(cacheKey, promise);
        return promise;
    } catch (err) {
        console.error("Open API listings fetch failed", err?.message || err);
        if (err?.status === 429 || err?.rateLimited) {
            err.rateLimited = true;
            err.status = err.status || 429;
        }
        throw err;
    }
};

/* =======================
   QUOTES (OPEN API)
======================= */

async function createQuoteOpenApi(payload) {
    const token = await getOpenApiToken();

    const tryPost = async (attempt = 0) => {
        const res = await guestyFetch(
            `${OPEN_API_BASE}/quotes`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                    accept: "application/json",
                },
                body: JSON.stringify({
                    listingId: payload.unitTypeId || payload.listingId,
                    checkInDateLocalized: payload.checkInDateLocalized,
                    checkOutDateLocalized: payload.checkOutDateLocalized,
                    numberOfGuests: payload.numberOfGuests,
                    guestsCount: payload.guestsCount, // include for back-compat validation
                    source: "website",
                }),
            },
            10000,
            5
        );

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const err = new Error(body || "Open API quote failed");
            err.status = res.status;
            throw err;
        }
        return res.json();
    };

    return tryPost();
}

async function createQuote(payload) {
    return createQuoteOpenApi(payload);
}

async function createReservationOpenApi(payload) {
    const token = await getOpenApiToken();
    const res = await guestyFetch(
        `${OPEN_API_BASE}/reservations`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                accept: "application/json",
            },
            body: JSON.stringify(payload),
        },
        10000,
        5
    );
    if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`Reservation create failed: ${res.status} ${detail}`);
    }
    return res.json();
}

/* =======================
   ROUTES
======================= */

app.get("/api/listings", async (req, res) => {
    try {
        const {
            checkIn,
            checkOut,
            minOccupancy = 1,
            city = "",
            tags = "",
            ids = "",
            limit = 50,
        } = req.query || {};
        const idsCombined = [ids, extraListingIds].filter(Boolean).join(",");
        const cacheKey = JSON.stringify({
            checkIn,
            checkOut,
            minOccupancy,
            city,
            tags,
            ids: idsCombined,
            limit,
        });
        const cachedStale = getListingsCacheStale(cacheKey);
        const rateLimitedUntil = listingsRateLimitedUntil.get(cacheKey) || 0;
        if (Date.now() < rateLimitedUntil && cachedStale) {
            return res.json({ results: cachedStale, cached: true, stale: true, rateLimited: true });
        }

        const results = await fetchOpenApiListings({
            checkIn,
            checkOut,
            minOccupancy,
            city,
            tags,
            ids: idsCombined,
            limit,
        });
        setListingsCache(cacheKey, results);
        res.json({ results });
    } catch (e) {
        const isRateLimited =
            e?.status === 429 ||
            e?.rateLimited ||
            String(e?.message || "").includes("TOO_MANY_REQUESTS");
        if (isRateLimited) {
            const {
                checkIn,
                checkOut,
                minOccupancy = 1,
                city = "",
                tags = "",
                ids = "",
                limit = 50,
            } = req.query || {};
            const idsCombined = [ids, extraListingIds].filter(Boolean).join(",");
            const cacheKey = JSON.stringify({
                checkIn,
                checkOut,
                minOccupancy,
                city,
                tags,
                ids: idsCombined,
                limit,
            });
            listingsRateLimitedUntil.set(cacheKey, Date.now() + LISTINGS_RATE_LIMIT_MS);
            const cachedStale = getListingsCacheStale(cacheKey);
            if (cachedStale) {
                return res.json({ results: cachedStale, cached: true, stale: true, rateLimited: true });
            }
            return res.status(200).json({
                results: [],
                errors: [{ message: "Rate limited by Guesty" }],
                rateLimited: true,
            });
        }
        res.status(502).json({
            message: "Listings failed",
            error: e.message,
            status: e.status || null,
            details: e.details || null,
        });
    }
});

app.get("/api/open-api-token", async (_req, res) => {
    try {
        const token = await getOpenApiToken();
        res.json({ access_token: token, expires_at: openApiExp });
    } catch (e) {
        res.status(500).json({ message: "Token fetch failed", error: e.message });
    }
});

app.get("/api/diagnostics/listings", async (_req, res) => {
    const diagnostics = {
        openApi: { ok: false, status: null, headers: {}, error: null },
        rateLimit: {
            openApi: {
                nextAllowedAt: openApiRateLimitState.nextAllowedAt,
                remainingSecond: openApiRateLimitState.remainingSecond,
                remainingMinute: openApiRateLimitState.remainingMinute,
                remainingHour: openApiRateLimitState.remainingHour,
            },
        },
    };

    const safeTimeout = (promise, ms, label) =>
        Promise.race([
            promise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
            ),
        ]);

    try {
        const token = await getOpenApiToken();
        const url = new URL(OPEN_API_LISTINGS_URL);
        url.searchParams.set("limit", "1");
        url.searchParams.set("sort", "-createdAt");
        url.searchParams.set("fields", "_id title");
        const openRes = await safeTimeout(
            guestyFetch(
                url.toString(),
                { headers: { accept: "application/json", Authorization: `Bearer ${token}` } },
                6000,
                0
            ),
            6500,
            "Open API diagnostics"
        );
        diagnostics.openApi.status = openRes.status;
        diagnostics.openApi.headers = {
            "retry-after": openRes.headers.get("retry-after"),
            "x-ratelimit-remaining-second": openRes.headers.get("x-ratelimit-remaining-second"),
            "x-ratelimit-remaining-minute": openRes.headers.get("x-ratelimit-remaining-minute"),
            "x-ratelimit-remaining-hour": openRes.headers.get("x-ratelimit-remaining-hour"),
        };
        diagnostics.openApi.ok = openRes.ok;
        if (!openRes.ok) {
            diagnostics.openApi.error = await openRes.text().catch(() => "");
        }
    } catch (err) {
        diagnostics.openApi.error = err?.message || String(err);
    }

    res.json(diagnostics);
});

app.post("/api/checkout", async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
        const {
            listingId,
            listingTitle,
            checkIn,
            checkOut,
            amount,
            currency = "USD",
            guests = 1,
            guest,
        } = req.body || {};

        if (!listingId || !checkIn || !checkOut) {
            return res.status(400).json({ message: "Missing checkout parameters" });
        }
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ message: "Missing or invalid amount" });
        }

        const origin = req.headers.origin || appOrigin || "http://localhost:8888";
        const guestName =
            guest && (guest.firstName || guest.lastName)
                ? [guest.firstName, guest.lastName].filter(Boolean).join(" ")
                : "";
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [
                {
                    quantity: 1,
                    price_data: {
                        currency,
                        unit_amount: Math.round(Number(amount) * 100),
                        product_data: {
                            name: listingTitle || "Stay booking",
                            description: `Check-in: ${checkIn} | Check-out: ${checkOut} | Guests: ${guests}`,
                        },
                    },
                },
            ],
            metadata: {
                listingId,
                checkIn,
                checkOut,
                guests: String(guests),
                guestName,
                guestEmail: guest?.email || "",
                guestPhone: guest?.phone || "",
            },
            customer_email: guest?.email || undefined,
            success_url: `${origin}/?payment=success`,
            cancel_url: `${origin}/?payment=cancel`,
        });

        res.json({ url: session.url });
    } catch (e) {
        res.status(500).json({ message: "Checkout failed", error: e.message });
    }
});

app.get("/api/listings/:id/availability", async (req, res) => {
    const { id } = req.params;
    const { startDate, endDate, minOccupancy = 1, city = "", unitTypeId = "" } = req.query || {};

    if (!id || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing availability parameters" });
    }

    const errors = [];
    const cacheKey = [
        "availability",
        id,
        startDate,
        endDate,
        minOccupancy,
        city,
        unitTypeId,
    ].join("|");
    const cached = getAvailabilityCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    try {
        const result = await runDeduped(inflightAvailability, cacheKey, async () => {
            const ids = [id, unitTypeId].filter(Boolean).join(",");
            const results = await fetchOpenApiListings({
                checkIn: startDate,
                checkOut: endDate,
                minOccupancy,
                city,
                ids,
                limit: Math.min(100, ids ? ids.split(",").length : 1),
            });
            const matched = results.find((item) => item?._id === id || item?.id === id);
            const payload = {
                isAvailable: Boolean(matched),
                availability: [],
                raw: results,
                errors,
            };
            setAvailabilityCache(cacheKey, payload);
            return { status: 200, payload };
        });

        res.status(result.status).json(result.payload);
    } catch (e) {
        res.status(502).json({ message: "Availability failed", error: e.message, errors });
    }
});

app.get("/api/listings/availability-bulk", async (req, res) => {
    const { ids = "", startDate, endDate, minOccupancy = 1, city = "", debug = "", noCache = "" } = req.query || {};
    let idList = String(ids)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    if (idList.length > AVAILABILITY_BULK_MAX_IDS) {
        idList = idList.slice(0, AVAILABILITY_BULK_MAX_IDS);
    }

    if (!idList.length || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing availability parameters" });
    }

    const errors = [];
    const cacheKey = [
        "availability-bulk",
        idList.join(","),
        startDate,
        endDate,
        minOccupancy,
        city,
    ].join("|");
    const debugMode = String(debug) === "1";
    const skipCache = debugMode || String(noCache) === "1";
    const cached = getAvailabilityCache(cacheKey);
    if (!skipCache && cached) return res.json({ ...cached, cached: true });
    const cachedStale = getAvailabilityCacheStale(cacheKey);
    const rateLimitedUntil = availabilityRateLimitedUntil.get(cacheKey) || 0;
    if (!skipCache && Date.now() < rateLimitedUntil) {
        if (cachedStale) {
            return res.json({ ...cachedStale, cached: true, stale: true, rateLimited: true });
        }
        return res.json({
            results: idList.map((id) => ({ id, available: false })),
            errors: [{ message: "Rate limited by Guesty" }],
            rateLimited: true,
        });
    }

    try {
        const result = await runDeduped(inflightAvailability, cacheKey, async () => {
            const results = await fetchOpenApiListings({
                checkIn: startDate,
                checkOut: endDate,
                minOccupancy,
                city,
                ids: idList.join(","),
                limit: Math.min(100, idList.length || 1),
            });
            const map = new Map();
            results.forEach((listing) => {
                const listingId = listing?._id || listing?.id;
                if (listingId) map.set(listingId, true);
            });
            const output = idList.map((listingId) => ({
                id: listingId,
                available: map.get(listingId) ?? false,
            }));

            const payload = { results: output, errors };
            setAvailabilityCache(cacheKey, payload);
            const prewarmIds = output.filter((item) => item.available).map((item) => item.id);
            prewarmQuoteCache(prewarmIds, {
                checkInDateLocalized: startDate,
                checkOutDateLocalized: endDate,
                guestsCount: minOccupancy,
            });
            return { status: 200, payload };
        });

        res.status(result.status).json(result.payload);
    } catch (e) {
        const isRateLimited =
            e?.status === 429 ||
            e?.rateLimited ||
            String(e?.message || "").includes("TOO_MANY_REQUESTS");
        if (isRateLimited) {
            availabilityRateLimitedUntil.set(cacheKey, Date.now() + AVAILABILITY_RATE_LIMIT_MS);
            if (cachedStale) {
                return res.status(200).json({ ...cachedStale, cached: true, stale: true, rateLimited: true });
            }
            return res.status(200).json({
                results: idList.map((id) => ({ id, available: false })),
                errors: [{ message: "Rate limited by Guesty" }],
                rateLimited: true,
            });
        }
        res.status(502).json({ message: "Availability failed", error: e.message, errors });
    }
});

app.get("/api/listings/:id/calendar-prices", async (req, res) => {
    const { id } = req.params;
    const { startDate, months = 24, guests = 1 } = req.query || {};

    if (!id) {
        return res.status(400).json({ message: "Missing listing id" });
    }

    const parsedMonths = Math.min(24, Math.max(1, Number.parseInt(months, 10) || 1));
    const start = parseIsoDate(startDate) || new Date();
    if (!Number.isFinite(start.getTime())) {
        return res.status(400).json({ message: "Invalid start date" });
    }
    start.setHours(0, 0, 0, 0);

    const guestsCount = Math.max(1, Number.parseInt(guests, 10) || 1);
    const cacheKey = ["calendar", id, toIsoDate(start), parsedMonths, guestsCount].join("|");
    const cached = getCalendarCache(cacheKey);
    if (cached) {
        const hasRateLimit =
            cached?.rateLimited ||
            (Array.isArray(cached?.errors) &&
                cached.errors.some((err) =>
                    String(err?.message || "").includes("TOO_MANY_REQUESTS")
                ));
        return res.json({ ...cached, cached: true, rateLimited: hasRateLimit });
    }
    const cachedStale = getCalendarCacheStale(cacheKey);

    const rateLimitedUntil = calendarRateLimitedUntil.get(id) || 0;
    if (Date.now() < rateLimitedUntil) {
        if (cachedStale) {
            return res.json({ ...cachedStale, cached: true, stale: true, rateLimited: true });
        }
        return res.json({
            listingId: id,
            startDate: toIsoDate(start),
            months: parsedMonths,
            guests: guestsCount,
            days: [],
            errors: [{ message: "Rate limited by Guesty" }],
            rateLimited: true,
        });
    }

    const end = addMonths(start, parsedMonths);
    const chunkDays = Math.max(
        28,
        Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
    );
    const startIso = toIsoDate(start);
    const endIso = toIsoDate(end);
    const errors = [];
    let rateLimited = false;

    try {
        const result = await runDeduped(inflightCalendars, cacheKey, async () => {
            const dayMap = new Map();
            const normalizePlanLabel = (plan = {}) => {
                const ratePlan = plan?.ratePlan || {};
                const raw = ratePlan?.name || ratePlan?.title || ratePlan?.description || "";
                return String(raw).trim();
            };
            const isNonRefundablePlan = (plan = {}) => {
                const ratePlan = plan?.ratePlan || {};
                const raw = normalizePlanLabel(plan);
                return Boolean(
                    ratePlan?.cancellationPolicy?.isNonRefundable ??
                    ratePlan?.nonRefundable ??
                    /non[- ]?refundable/i.test(raw)
                );
            };
            const isStandardPlan = (plan = {}) => /standard/i.test(normalizePlanLabel(plan));
            const pickPreferredPlan = (plans = []) => {
                if (!plans.length) return null;
                const standard = plans.find((p) => isStandardPlan(p));
                if (standard) return standard;
                const refundable = plans.find((p) => !isNonRefundablePlan(p));
                return refundable || plans[0];
            };
            const mergeRestrictions = (base = {}, next = {}) => {
                const minNightsValues = [base.minNights, next.minNights].filter(
                    (value) => typeof value === "number"
                );
                const maxNightsValues = [base.maxNights, next.maxNights].filter(
                    (value) => typeof value === "number"
                );
                return {
                    minNights: minNightsValues.length ? Math.max(...minNightsValues) : null,
                    maxNights: maxNightsValues.length ? Math.min(...maxNightsValues) : null,
                    closedToArrival: Boolean(base.closedToArrival || next.closedToArrival),
                    closedToDeparture: Boolean(base.closedToDeparture || next.closedToDeparture),
                };
            };
            const getRestrictions = (day = {}) => {
                const minNights =
                    day.minNights ??
                    day.minimumStay ??
                    day.minStay ??
                    day.minStayLength ??
                    day?.restrictions?.minNights ??
                    day?.restrictions?.minStay ??
                    null;
                const maxNights =
                    day.maxNights ??
                    day.maximumStay ??
                    day.maxStay ??
                    day.maxStayLength ??
                    day?.restrictions?.maxNights ??
                    day?.restrictions?.maxStay ??
                    null;
                const closedToArrival =
                    day.closedToArrival ??
                    day.cta ??
                    day?.restrictions?.closedToArrival ??
                    day?.restrictions?.cta ??
                    null;
                const closedToDeparture =
                    day.closedToDeparture ??
                    day.ctd ??
                    day?.restrictions?.closedToDeparture ??
                    day?.restrictions?.ctd ??
                    null;
                return {
                    minNights: typeof minNights === "number" ? minNights : null,
                    maxNights: typeof maxNights === "number" ? maxNights : null,
                    closedToArrival: Boolean(closedToArrival),
                    closedToDeparture: Boolean(closedToDeparture),
                };
            };
            let cursor = new Date(start);

            while (cursor < end && !rateLimited) {
                const chunkEnd = addDays(cursor, chunkDays);
                const safeEnd = chunkEnd < end ? chunkEnd : end;

                try {
                    const quote = await createQuote({
                        listingId: id,
                        checkInDateLocalized: toIsoDate(cursor),
                        checkOutDateLocalized: toIsoDate(safeEnd),
                        numberOfGuests: { numberOfAdults: guestsCount, numberOfChildren: 0 },
                        guestsCount,
                        source: "website",
                    });

                    const plans = Array.isArray(quote?.rates?.ratePlans)
                        ? quote.rates.ratePlans
                        : [];
                    const selectedPlan = pickPreferredPlan(plans);
                    const usablePlans = plans.length ? plans : [];
                    usablePlans.forEach((plan, index) => {
                        const isPricingPlan = selectedPlan ? plan === selectedPlan : index === 0;
                        const planCurrency =
                            plan?.money?.money?.currency ||
                            plan?.money?.currency ||
                            quote?.money?.money?.currency ||
                            quote?.money?.currency ||
                            "USD";
                        const days = Array.isArray(plan?.days) ? plan.days : [];
                        days.forEach((day) => {
                            const dateKey = normalizeDayDate(day);
                            const price = day?.manualPrice ?? day?.price ?? day?.basePrice;
                            if (!dateKey || typeof price !== "number") return;
                            if (dateKey < startIso || dateKey >= endIso) return;
                            const existing = dayMap.get(dateKey);
                            if (!existing) {
                                dayMap.set(dateKey, {
                                    date: dateKey,
                                    price,
                                    currency: day?.currency || planCurrency,
                                    restrictions: getRestrictions(day),
                                    ratePlanLabel: normalizePlanLabel(plan),
                                });
                                return;
                            }
                            existing.restrictions = mergeRestrictions(
                                existing.restrictions,
                                getRestrictions(day)
                            );
                            if (isPricingPlan) {
                                existing.price = price;
                                existing.currency = day?.currency || planCurrency;
                                existing.ratePlanLabel = normalizePlanLabel(plan);
                            }
                        });
                    });
                } catch (err) {
                    const tooMany =
                        err?.status === 429 ||
                        err?.rateLimited ||
                        String(err?.message || "").includes("TOO_MANY_REQUESTS");
                    if (tooMany) {
                        rateLimited = true;
                        calendarRateLimitedUntil.set(id, Date.now() + CALENDAR_RATE_LIMIT_MS);
                        errors.push({
                            message: "Rate limited by Guesty",
                            start: toIsoDate(cursor),
                            end: toIsoDate(safeEnd),
                        });
                        break;
                    }
                    errors.push({
                        message: err?.message || "Quote failed",
                        start: toIsoDate(cursor),
                        end: toIsoDate(safeEnd),
                    });
                }

                cursor = safeEnd;
            }

            const days = Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
            const payload = {
                listingId: id,
                startDate: toIsoDate(start),
                months: parsedMonths,
                guests: guestsCount,
                days,
                errors,
                rateLimited:
                    rateLimited ||
                    errors.some((err) =>
                        String(err?.message || "").includes("TOO_MANY_REQUESTS")
                    ),
            };
            setCalendarCache(cacheKey, payload);
            return { status: rateLimited ? 429 : 200, payload };
        });

        res.status(result.status === 429 ? 200 : result.status).json(result.payload);
    } catch (e) {
        res.status(502).json({ message: "Calendar pricing failed", error: e.message, errors });
    }
});

app.post("/api/stripe/webhook", async (req, res) => {
    if (!stripe || !stripeWebhookSecret) {
        return res.status(500).json({ message: "Stripe webhook not configured" });
    }

    const sig = req.headers["stripe-signature"];
    if (!sig) {
        return res.status(400).send("Missing Stripe signature");
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, stripeWebhookSecret);
    } catch (err) {
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        const session = event.data.object || {};
        const metadata = session.metadata || {};
        const listingId = metadata.listingId;
        const checkInDateLocalized = metadata.checkIn;
        const checkOutDateLocalized = metadata.checkOut;
        const guest = buildGuestFromStripe(session);

        if (listingId && checkInDateLocalized && checkOutDateLocalized && guest) {
            try {
                await createReservationOpenApi({
                    listingId,
                    checkInDateLocalized,
                    checkOutDateLocalized,
                    status: "confirmed",
                    guest,
                    source: "stripe",
                    originId: `stripe:${session.id}`,
                });
            } catch (err) {
                console.error("Reservation create failed", err?.message || err);
                return res.status(500).send("Reservation create failed");
            }
        } else {
            console.error("Missing reservation metadata or guest info", {
                listingId,
                checkInDateLocalized,
                checkOutDateLocalized,
                hasGuest: Boolean(guest),
            });
            return res.status(400).send("Missing reservation metadata or guest info");
        }
    }

    res.json({ received: true });
});

app.post("/api/reservations", async (req, res) => {
    const {
        listingId,
        checkInDateLocalized,
        checkOutDateLocalized,
        status = "confirmed",
        guestId,
        guest,
        money,
        source = "website",
        originId,
        ignoreCalendar,
        ignoreTerms,
    } = req.body || {};

    if (!listingId || !checkInDateLocalized || !checkOutDateLocalized) {
        return res.status(400).json({ message: "Missing reservation parameters" });
    }
    if (!guestId && !guest) {
        return res.status(400).json({ message: "Missing guestId or guest" });
    }

    try {
        const payload = {
            listingId,
            checkInDateLocalized,
            checkOutDateLocalized,
            status,
            source,
        };
        if (guestId) payload.guestId = guestId;
        if (guest) payload.guest = guest;
        if (money) payload.money = money;
        if (originId) payload.originId = originId;
        if (typeof ignoreCalendar === "boolean") payload.ignoreCalendar = ignoreCalendar;
        if (typeof ignoreTerms === "boolean") payload.ignoreTerms = ignoreTerms;

        const reservation = await createReservationOpenApi(payload);
        res.json(reservation);
    } catch (e) {
        res.status(502).json({ message: "Reservation create failed", error: e.message });
    }
});

app.post("/api/reservations/quotes", async (req, res) => {
    const {
        listingId,
        checkInDateLocalized,
        checkOutDateLocalized,
        guestsCount,
    } = req.body || {};

    const guestsNum = Number.parseInt(guestsCount, 10);
    const guests = Number.isFinite(guestsNum) ? Math.max(1, guestsNum) : 1;

    if (!listingId || !checkInDateLocalized || !checkOutDateLocalized) {
        return res.status(400).json({ message: "Missing quote parameters" });
    }

    const cacheKey = [
        "quote",
        listingId,
        checkInDateLocalized,
        checkOutDateLocalized,
        guests,
    ].join("|");
    const cached = getQuoteCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });
    const cachedStale = getQuoteCacheStale(cacheKey);
    if (Date.now() < quoteRateLimitedUntil && cachedStale) {
        return res.json({ ...cachedStale, cached: true, stale: true });
    }

    try {
        const payload = await runDeduped(inflightQuotes, cacheKey, async () => {
            const quote = await createQuote({
                unitTypeId: listingId,
                checkInDateLocalized,
                checkOutDateLocalized,
                numberOfGuests: { numberOfAdults: guests, numberOfChildren: 0 },
                guestsCount: guests,
                source: "website",
            });

            const out = { results: [quote] };
            setQuoteCache(cacheKey, out);
            return out;
        });

        res.json(payload);
    } catch (e) {
        const rateLimited = e?.rateLimited || e?.status === 429;
        if (rateLimited) {
            quoteRateLimitedUntil = Date.now() + 60_000;
            if (cachedStale) {
                return res.json({ ...cachedStale, cached: true, stale: true });
            }
            return res
                .status(429)
                .json({ message: "Rate limited by Guesty", error: e.message });
        }
        res.status(502).json({ message: "Quote failed", error: e.message });
    }
});

app.post("/api/reservations/quotes-bulk", async (req, res) => {
    const { requests } = req.body || {};
    if (!Array.isArray(requests) || requests.length === 0) {
        return res.status(400).json({ message: "Missing quote requests" });
    }

    const limitedRequests = requests.slice(0, Math.max(1, QUOTE_BULK_LIMIT));
    const skipped = requests
        .slice(limitedRequests.length)
        .map((entry) => entry?.listingId)
        .filter(Boolean);
    const results = {};
    const errors = [];

    for (const entry of limitedRequests) {
        const {
            listingId,
            checkInDateLocalized,
            checkOutDateLocalized,
            guestsCount,
        } = entry || {};
        if (!listingId || !checkInDateLocalized || !checkOutDateLocalized) {
            errors.push({ listingId, message: "Missing quote parameters" });
            continue;
        }

        const guestsNum = Number.parseInt(guestsCount, 10);
        const guests = Number.isFinite(guestsNum) ? Math.max(1, guestsNum) : 1;
        const cacheKey = [
            "quote",
            listingId,
            checkInDateLocalized,
            checkOutDateLocalized,
            guests,
        ].join("|");
        const cached = getQuoteCache(cacheKey);
        if (cached) {
            results[listingId] = cached.results?.[0] || cached.results || cached;
            continue;
        }
        const cachedStale = getQuoteCacheStale(cacheKey);
        if (Date.now() < quoteRateLimitedUntil && cachedStale) {
            results[listingId] = cachedStale.results?.[0] || cachedStale.results || cachedStale;
            continue;
        }

        try {
            const quote = await withTimeout(
                createQuote({
                    unitTypeId: listingId,
                    checkInDateLocalized,
                    checkOutDateLocalized,
                    numberOfGuests: { numberOfAdults: guests, numberOfChildren: 0 },
                    guestsCount: guests,
                    source: "website",
                }),
                QUOTE_BULK_TIMEOUT_MS,
                "Quote"
            );
            const out = { results: [quote] };
            setQuoteCache(cacheKey, out);
            results[listingId] = quote;
        } catch (e) {
            if (e?.rateLimited || e?.status === 429) {
                quoteRateLimitedUntil = Date.now() + 60_000;
            }
            if (isTimeoutError(e)) {
                const cachedStale = getQuoteCacheStale(cacheKey);
                if (cachedStale) {
                    results[listingId] = cachedStale.results?.[0] || cachedStale.results || cachedStale;
                    errors.push({ listingId, message: "Quote timeout, served cached pricing", status: null });
                    continue;
                }
                try {
                    await wait(400);
                    const retryQuote = await withTimeout(
                        createQuote({
                            unitTypeId: listingId,
                            checkInDateLocalized,
                            checkOutDateLocalized,
                            numberOfGuests: { numberOfAdults: guests, numberOfChildren: 0 },
                            guestsCount: guests,
                            source: "website",
                        }),
                        QUOTE_BULK_TIMEOUT_RETRY_MS,
                        "Quote retry"
                    );
                    const out = { results: [retryQuote] };
                    setQuoteCache(cacheKey, out);
                    results[listingId] = retryQuote;
                    continue;
                } catch (retryErr) {
                    errors.push({
                        listingId,
                        message: retryErr.message || "Quote retry failed",
                        status: retryErr.status || null,
                    });
                    continue;
                }
            }
            errors.push({ listingId, message: e.message, status: e.status || null });
        }
    }

    res.json({ results, errors, skipped });
});

app.get("/api/landmarks", async (req, res) => {
    const { address = "" } = req.query || {};
    const apiKey = process.env.GOOGLE_PLACES_API_KEY || "";
    if (!apiKey) {
        return res.status(500).json({ message: "Missing GOOGLE_PLACES_API_KEY" });
    }
    if (!address) {
        return res.status(400).json({ message: "Missing address" });
    }

    const cacheKey = `landmarks:${address}`;
    const cached = getLandmarksCache(cacheKey);
    if (cached) return res.json(cached);

    try {
        const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        geocodeUrl.searchParams.set("address", address);
        geocodeUrl.searchParams.set("key", apiKey);
        const geoRes = await withLimit(() => fetchWithTimeout(geocodeUrl.toString()));
        if (!geoRes.ok) throw new Error(await geoRes.text());
        const geoJson = await geoRes.json();
        const loc = geoJson?.results?.[0]?.geometry?.location;
        if (!loc) {
            return res.status(200).json({ address, landmarks: [], transport: [] });
        }

        const fetchPlaces = async (type) => {
            const url = new URL("https://maps.googleapis.com/maps/api/place/nearbysearch/json");
            url.searchParams.set("location", `${loc.lat},${loc.lng}`);
            url.searchParams.set("radius", "1500");
            url.searchParams.set("type", type);
            url.searchParams.set("key", apiKey);
            const r = await withLimit(() => fetchWithTimeout(url.toString()));
            if (!r.ok) throw new Error(await r.text());
            const json = await r.json();
            return Array.isArray(json?.results) ? json.results : [];
        };

        const [attractions, transit, train] = await Promise.all([
            fetchPlaces("tourist_attraction"),
            fetchPlaces("transit_station"),
            fetchPlaces("train_station"),
        ]);

        const normalize = (items) =>
            items
                .filter((item) => item?.name)
                .map((item) => ({
                    name: item.name,
                    rating: item.rating,
                    userRatingsTotal: item.user_ratings_total,
                    vicinity: item.vicinity,
                    types: item.types,
                }));

        const payload = {
            address,
            landmarks: normalize(attractions).slice(0, 8),
            transport: normalize([...transit, ...train]).slice(0, 8),
        };
        setLandmarksCache(cacheKey, payload);
        res.json(payload);
    } catch (e) {
        res.status(502).json({ message: "Landmarks lookup failed", error: e.message });
    }
});

/* =======================
   NETLIFY EXPORT
======================= */

// Respect Netlify function mount path so Express routes remain at /api/*
export const handler = serverless(app, { basePath: "/.netlify/functions/index" });
