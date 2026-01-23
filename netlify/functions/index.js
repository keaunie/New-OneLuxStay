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
const BOOKING_TOKEN_FILE = path.join(TMP_DIR, "guesty-booking-token.json");
const OPEN_API_TOKEN_CACHE_PATH =
    process.env.GUESTY_OPEN_API_TOKEN_CACHE || OPEN_API_TOKEN_FILE;

/* =======================
   APP SETUP
======================= */

const app = express();
app.use(cors());
app.use(
    express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    })
);
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
const BOOKING_TOKEN_URL = "https://booking.guesty.com/oauth2/token";
const BOOKING_API_BASE = "https://booking.guesty.com/api";

const PM_LISTINGS_URL =
    "https://app.guesty.com/api/pm-websites-backend/listings";

const OPEN_API_CLIENT_ID =
    process.env.GUESTY_OPEN_API_CLIENT_ID || process.env.GUESTY_CLIENT_ID;
const OPEN_API_CLIENT_SECRET =
    process.env.GUESTY_OPEN_API_CLIENT_SECRET || process.env.GUESTY_CLIENT_SECRET;
const BOOKING_CLIENT_ID =
    process.env.GUESTY_BE_CLIENT_ID ||
    process.env.GUESTY_BOOKING_CLIENT_ID ||
    process.env.GUESTY_CLIENT_ID;
const BOOKING_CLIENT_SECRET =
    process.env.GUESTY_BE_CLIENT_SECRET ||
    process.env.GUESTY_BOOKING_CLIENT_SECRET ||
    process.env.GUESTY_CLIENT_SECRET;

const pmAidCs = process.env.GUESTY_PM_G_AID_CS;
const pmRequestContext = process.env.GUESTY_PM_X_REQUEST_CONTEXT;
const pmOrigin =
    process.env.GUESTY_PM_ORIGIN || "https://reservations.oneluxstay.com";
const pmReferer =
    process.env.GUESTY_PM_REFERER || "https://reservations.oneluxstay.com/";
const PM_CONTENT_URL =
    "https://app.guesty.com/api/pm-websites-backend/engines/content";
const OPEN_API_LISTINGS_URL = "https://open-api.guesty.com/v1/listings";
const pmAuthToken = process.env.GUESTY_PM_AUTH_TOKEN || "";
const extraListingIds = (process.env.GUESTY_EXTRA_LISTING_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");
const pmAllowedLangs = ["de", "es", "fr", "it", "ja", "ko", "pt", "el", "pl", "ro", "in", "zh", "nl", "bg"];
const pmLangRaw = process.env.GUESTY_PM_LANG || "";
const pmLang = pmAllowedLangs.includes(pmLangRaw) ? pmLangRaw : "";
const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const appOrigin = process.env.APP_ORIGIN || "";
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2023-10-16" }) : null;

if (!OPEN_API_CLIENT_ID || !OPEN_API_CLIENT_SECRET) {
    throw new Error("Missing Open API credentials (set GUESTY_OPEN_API_CLIENT_ID / GUESTY_OPEN_API_CLIENT_SECRET)");
}
if (!BOOKING_CLIENT_ID || !BOOKING_CLIENT_SECRET) {
    throw new Error("Missing Booking Engine credentials (set GUESTY_BE_CLIENT_ID / GUESTY_BE_CLIENT_SECRET)");
}

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
const MIN_INTERVAL_MS = Number(process.env.GUESTY_MIN_INTERVAL_MS || 6000); // slower by default to avoid 429s
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
    if (openApiToken && Date.now() < openApiExp) return openApiToken;

    const cached = await readCache(OPEN_API_TOKEN_CACHE_PATH);
    if (cached && Date.now() < cached.expires_at) {
        openApiToken = cached.access_token;
        openApiExp = cached.expires_at;
        return openApiToken;
    }

    const res = await fetch(OPEN_API_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "open-api",
            client_id: OPEN_API_CLIENT_ID,
            client_secret: OPEN_API_CLIENT_SECRET,
        }),
    });

    if (!res.ok) throw new Error(await res.text());

    const json = await res.json();
    openApiToken = json.access_token;
    openApiExp = Date.now() + (json.expires_in - 300) * 1000;

    await writeCache(OPEN_API_TOKEN_CACHE_PATH, {
        access_token: openApiToken,
        expires_at: openApiExp,
    });

    return openApiToken;
}

/* =======================
   BOOKING ENGINE TOKEN
======================= */

let bookingToken = null;
let bookingTokenExp = 0;

async function getBookingEngineToken() {
    if (bookingToken && Date.now() < bookingTokenExp) return bookingToken;

    const cached = await readCache(BOOKING_TOKEN_FILE);
    if (cached && Date.now() < cached.expires_at) {
        bookingToken = cached.access_token;
        bookingTokenExp = cached.expires_at;
        return bookingToken;
    }

    const res = await fetch(BOOKING_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "booking_engine:api",
            client_id: BOOKING_CLIENT_ID,
            client_secret: BOOKING_CLIENT_SECRET,
        }),
    });

    if (!res.ok) throw new Error(await res.text());

    const json = await res.json();
    bookingToken = json.access_token;
    bookingTokenExp = Date.now() + (json.expires_in - 300) * 1000;

    await writeCache(BOOKING_TOKEN_FILE, {
        access_token: bookingToken,
        expires_at: bookingTokenExp,
    });

    return bookingToken;
}

/* =======================
   PM CONTENT (LISTINGS)
======================= */

async function fetchPmListings(options = {}) {
    // Prefer Booking Engine / PM content using BE credentials; fallback to Open API if needed
    const contentListings = await fetchPmContentListings(options);
    if (Array.isArray(contentListings) && contentListings.length > 0) {
        return normalizePmListings(contentListings);
    }
    const openApiList = await fetchOpenApiListings(options);
    if (!Array.isArray(openApiList) || openApiList.length === 0) {
        throw new Error("Open API listings returned no results");
    }
    return normalizePmListings(openApiList);
}

const cityOverride = (() => {
    const map = new Map();
    (process.env.GUESTY_EXTRA_LISTING_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((id) => map.set(id, "Redondo Beach"));
    return map;
})();

function normalizePmListings(listings) {
    const list = Array.isArray(listings) ? listings : [];
    const knownCities = ["hollywood", "los angeles", "antwerp", "antwerpen", "dubai", "redondo beach", "miami beach"];

    const inferCity = (l) => {
        const titleLower = typeof l.title === "string" ? l.title.toLowerCase() : "";
        if (titleLower.includes("hollywood")) return "Hollywood";
        const fromAddress = l.address?.city || l.city || l.location || l.address?.full || "";
        if (fromAddress) return fromAddress;
        const tagCity =
            Array.isArray(l.tags) &&
            l.tags.find((t) => typeof t === "string" && knownCities.includes(t.toLowerCase()));
        if (tagCity) return tagCity;
        if (titleLower) {
            const match = knownCities.find((c) => titleLower.includes(c));
            if (match)
                return match
                    .split(" ")
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(" ");
        }
        return "";
    };

    const map = new Map();
    list.forEach((l) => {
        const id = l._id || l.id;
        if (id && l.title) map.set(id, l);
    });

    return [...map.values()].map((l) => {
        const city =
            cityOverride.get(l._id || l.id) ||
            inferCity(l);
        return {
            id: l._id || l.id,
            _id: l._id || l.id,
            unitTypeId: l.unitTypeId || l.listingId || l.mtl?.unitTypeId || l.mtl?.listingId || l.mtl?.id,
            title: l.title,
            nickname: l.nickname,
            accommodates: l.accommodates,
            accountId: l.accountId,
            address: l.address,
            city,
            bathrooms: l.bathrooms,
            bedrooms: l.bedrooms,
            beds: l.beds,
            propertyType: l.propertyType,
            tags: l.tags,
            timezone: l.timezone,
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
            cleaningFee: l.prices?.cleaningFee,
            publicDescription: l.publicDescription,
            reviews: l.reviews,
            roomType: l.roomType,
        };
    });
}

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

const fetchPmContentListings = async ({
    city = "",
    tags = "",
    ids = "",
    limit = 50,
} = {}) => {
    const cacheKey = JSON.stringify({ city, tags, ids, limit, source: "pm-content" });
    const cached = getListingsCache(cacheKey);
    if (cached) return cached;
    const deduped = inflightListings.get(cacheKey);
    if (deduped) return deduped;

    const promise = (async () => {
        const token = await getBookingEngineToken();
        const url = new URL(PM_CONTENT_URL);
        if (pmLang) url.searchParams.set("lang", pmLang);
        if (city) url.searchParams.set("city", city);
        if (tags) url.searchParams.set("tags", tags);
        if (ids) url.searchParams.set("ids", ids);
        if (limit) url.searchParams.set("limit", limit);

        const headers = {
            accept: "application/json",
            origin: pmOrigin,
            referer: pmReferer,
            authorization: `Bearer ${token}`,
        };
        if (pmAidCs) headers["g-aid-cs"] = pmAidCs;
        if (pmRequestContext) headers["x-request-context"] = pmRequestContext;

        const res = await withLimit(() =>
            fetchWithTimeout(url.toString(), {
                headers,
            })
        );
        if (res.status === 401 || res.status === 403) {
            const err = new Error("PM content unauthorized");
            err.status = res.status;
            throw err;
        }
        if (!res.ok) {
            const body = await res.text().catch(() => "");
            throw new Error(body || res.status);
        }
        const json = await res.json();
        const flat = extractFromPmContent(json);
        setListingsCache(cacheKey, flat);
        return flat;
    })();

    inflightListings.set(cacheKey, promise);
    return promise;
};

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
            let cursor = "";
            let guard = 0;

            const pageLimit = Math.max(1, Math.min(Number(limit) || 50, MAX_LISTINGS_LIMIT));

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
                        fetchWithTimeout(`${OPEN_API_LISTINGS_URL}?${qs.toString()}`, { headers })
                    );
                    if (res.status === 429) {
                        const retryAfter = Number(res.headers.get("retry-after") || 0);
                        if (attempt >= 4) {
                            const err = new Error("Rate limited by Guesty (listings)");
                            err.rateLimited = true;
                            err.status = 429;
                            throw err;
                        }
                        const backoff =
                            retryAfter > 0
                                ? retryAfter * 1000
                                : Math.min(6000, 900 * 2 ** attempt) + Math.random() * 400;
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
   QUOTES (BOOKING ENGINE)
======================= */

const BOOKING_FALLBACK_STATUSES = new Set([400, 401, 403, 404, 410, 501]);

async function createQuoteBookingEngine(payload) {
    const token = await getBookingEngineToken();

    const tryPost = async (attempt = 0) => {
        const res = await withLimit(() =>
            fetch(`${BOOKING_API_BASE}/reservations/quotes`, {
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
                    guestsCount: payload.guestsCount,
                    source: "website",
                }),
            })
        );

        if (res.status === 429) {
            const retryAfter = Number(res.headers.get("retry-after") || 0);
            if (attempt >= 5) {
                const body = await res.text().catch(() => "");
                const err = new Error(body || "Rate limited by Guesty");
                err.rateLimited = true;
                err.status = 429;
                throw err;
            }
            const backoff =
                retryAfter > 0
                    ? retryAfter * 1000
                    : Math.min(8000, 800 * 2 ** attempt) + Math.random() * 300;
            await wait(backoff);
            return tryPost(attempt + 1);
        }

        if (!res.ok) {
            const body = await res.text().catch(() => "");
            const err = new Error(body || "Booking Engine quote failed");
            err.status = res.status;
            throw err;
        }
        return res.json();
    };

    return tryPost();
}

async function createQuoteOpenApi(payload) {
    const token = await getOpenApiToken();

    const tryPost = async (attempt = 0) => {
        const res = await withLimit(() =>
            fetch(`${OPEN_API_BASE}/quotes`, {
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
            })
        );

        if (res.status === 429) {
            const retryAfter = Number(res.headers.get("retry-after") || 0);
            if (attempt >= 5) {
                const body = await res.text().catch(() => "");
                const err = new Error(body || "Rate limited by Guesty");
                err.rateLimited = true;
                err.status = 429;
                throw err;
            }
            const backoff =
                retryAfter > 0
                    ? retryAfter * 1000
                    : Math.min(8000, 800 * 2 ** attempt) + Math.random() * 300;
            await wait(backoff);
            return tryPost(attempt + 1);
        }

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
    try {
        return await createQuoteBookingEngine(payload);
    } catch (err) {
        if (BOOKING_FALLBACK_STATUSES.has(err?.status)) {
            return createQuoteOpenApi(payload);
        }
        throw err;
    }
}

async function createReservationOpenApi(payload) {
    const token = await getOpenApiToken();
    const res = await fetch(`${OPEN_API_BASE}/reservations`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            accept: "application/json",
        },
        body: JSON.stringify(payload),
    });
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

        const pm = await fetchPmListings({
            checkIn,
            checkOut,
            minOccupancy,
            city,
            tags,
            ids: idsCombined,
            limit,
        });

        // Ensure manually specified IDs are present even if source feeds miss them
        const baseResults = normalizePmListings(pm);
        const manualIds = extraListingIds ? extraListingIds.split(",").filter(Boolean) : [];
        const missingIds = manualIds.filter(
            (mid) => !baseResults.some((r) => r.id === mid || r._id === mid)
        );

        let merged = baseResults;
        if (missingIds.length) {
            try {
                const missing = await fetchOpenApiListings({ ids: missingIds.join(","), limit });
                const normalizedMissing = normalizePmListings(missing);
                const map = new Map();
                [...baseResults, ...normalizedMissing].forEach((r) => {
                    const id = r.id || r._id;
                    if (id) map.set(id, r);
                });
                merged = [...map.values()];
            } catch (err) {
                console.error("Failed to backfill manual listing IDs", err?.message || err);
            }
        }

        const results = merged;
        setListingsCache(cacheKey, results);
        res.json({ results });
    } catch (e) {
        const isRateLimited = e?.status === 429 || e?.rateLimited;
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
        res.status(500).json({
            message: "Listings failed",
            error: e.message,
        });
    }
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
            const token = await getOpenApiToken();
            const available = JSON.stringify({
                checkIn: startDate,
                checkOut: endDate,
                minOccupancy: Number(minOccupancy) || 1,
            });

            const tryQuery = async (query, attempt = 0) => {
                const url = `${OPEN_API_BASE}/listings?${query}&fields=_id availability availabilityStatus prices terms title address&available=${encodeURIComponent(
                    available
                )}`;
                const response = await withLimit(() =>
                    fetchWithTimeout(url, {
                        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
                    })
                );
                if (response.status === 429) {
                    const retryAfter = Number(response.headers.get("retry-after") || 0);
                    errors.push({ status: 429, body: "Rate limited", attempt });
                    if (attempt >= 4) {
                        return null;
                    }
                    // exponential backoff with jitter, fall back to Retry-After if provided
                    const backoff =
                        retryAfter > 0
                            ? retryAfter * 1000
                            : Math.min(4000, 600 * 2 ** attempt) + Math.random() * 200;
                    await wait(backoff);
                    return tryQuery(query, attempt + 1);
                }
                if (!response.ok) {
                    errors.push({ status: response.status, body: await response.text().catch(() => "") });
                    return null;
                }
                const json = await response.json();
                if (Array.isArray(json?.results) && json.results.length > 0) return json;
                errors.push({ status: 200, body: "No results" });
                return null;
            };

            let json =
                (await tryQuery(`ids=${encodeURIComponent(id)}${city ? `&city=${encodeURIComponent(city)}` : ""}`)) ||
                (city ? await tryQuery(`city=${encodeURIComponent(city)}`) : null) ||
                (unitTypeId
                    ? await tryQuery(`ids=${encodeURIComponent(unitTypeId)}${city ? `&city=${encodeURIComponent(city)}` : ""}`)
                    : null);

            if (!json) {
                const rateLimited = errors.some((e) => e.status === 429);
                const noResults = errors.some((e) => e.body === "No results");
                if (noResults) {
                    const payload = { isAvailable: false, availability: [], raw: null, errors };
                    if (rateLimited) {
                        return { status: 429, payload: { message: "Rate limited by Guesty", ...payload } };
                    }
                    return { status: 200, payload };
                }
                try {
                    const quote = await createQuote({
                        unitTypeId: unitTypeId || id,
                        checkInDateLocalized: startDate,
                        checkOutDateLocalized: endDate,
                        numberOfGuests: { numberOfAdults: Number(minOccupancy) || 1, numberOfChildren: 0 },
                        guestsCount: Number(minOccupancy) || 1,
                        source: "website",
                    });
                    const payload = { isAvailable: true, availability: [], raw: { quote }, errors };
                    setAvailabilityCache(cacheKey, payload);
                    return { status: 200, payload };
                } catch (quoteErr) {
                    errors.push({
                        status: quoteErr?.status || 500,
                        body: quoteErr?.message || "Quote fallback failed",
                    });
                }
                const payload = { isAvailable: false, availability: [], raw: null, errors };
                if (rateLimited) {
                    return { status: 429, payload: { message: "Rate limited by Guesty", ...payload } };
                }
                return { status: 200, payload };
            }

            const record = Array.isArray(json?.results) ? json.results[0] : null;
            const days = record?.availability || [];
            const status = record?.availabilityStatus;
            const isAvailable =
                Array.isArray(days) && days.length
                    ? days.every((d) => (d?.isAvailable ?? d?.available ?? true) !== false)
                    : record
                        ? typeof status === "string"
                            ? status.toUpperCase() === "AVAILABLE"
                            : true
                        : false;
            const payload = { isAvailable, availability: days, raw: json, errors };
            setAvailabilityCache(cacheKey, payload);
            return { status: 200, payload };
        });

        res.status(result.status).json(result.payload);
    } catch (e) {
        res.status(502).json({ message: "Availability failed", error: e.message, errors });
    }
});

app.get("/api/listings/availability-bulk", async (req, res) => {
    const { ids = "", startDate, endDate, minOccupancy = 1, city = "" } = req.query || {};
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
    const cached = getAvailabilityCache(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });
    const cachedStale = getAvailabilityCacheStale(cacheKey);
    const rateLimitedUntil = availabilityRateLimitedUntil.get(cacheKey) || 0;
    if (Date.now() < rateLimitedUntil) {
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
            const deadline = Date.now() + AVAILABILITY_BULK_TIMEOUT_MS;
            const token = await getOpenApiToken();
            const available = JSON.stringify({
                checkIn: startDate,
                checkOut: endDate,
                minOccupancy: Number(minOccupancy) || 1,
            });

            const fetchChunk = async (chunk, attempt = 0) => {
                const url = `${OPEN_API_BASE}/listings?ids=${encodeURIComponent(
                    chunk.join(",")
                )}${city ? `&city=${encodeURIComponent(city)}` : ""}&fields=_id availability availabilityStatus&available=${encodeURIComponent(
                    available
                )}`;
                const response = await withLimit(() =>
                    fetchWithTimeout(url, {
                        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
                    })
                );
                if (response.status === 429) {
                    const retryAfter = Number(response.headers.get("retry-after") || 0);
                    errors.push({ status: 429, body: "Rate limited", attempt });
                    if (attempt >= 4) return null;
                    const backoff =
                        retryAfter > 0
                            ? retryAfter * 1000
                            : Math.min(4000, 600 * 2 ** attempt) + Math.random() * 200;
                    await wait(backoff);
                    return fetchChunk(chunk, attempt + 1);
                }
                if (!response.ok) {
                    errors.push({ status: response.status, body: await response.text().catch(() => "") });
                    return null;
                }
                return response.json();
            };

            const results = [];
            const chunkSize = 20;
            for (let i = 0; i < idList.length; i += chunkSize) {
                if (Date.now() > deadline) {
                    errors.push({ status: 408, body: "Availability bulk timed out" });
                    break;
                }
                const chunk = idList.slice(i, i + chunkSize);
                const json = await fetchChunk(chunk);
                if (Array.isArray(json?.results)) results.push(...json.results);
            }
            const rateLimited = errors.some((e) => e.status === 429);
            const timedOut = errors.some((e) => e.status === 408);
            if (rateLimited && results.length === 0 && cachedStale) {
                availabilityRateLimitedUntil.set(
                    cacheKey,
                    Date.now() + AVAILABILITY_RATE_LIMIT_MS
                );
                return {
                    status: 200,
                    payload: { ...cachedStale, cached: true, stale: true, rateLimited: true },
                };
            }
            if (rateLimited && results.length === 0) {
                availabilityRateLimitedUntil.set(
                    cacheKey,
                    Date.now() + AVAILABILITY_RATE_LIMIT_MS
                );
                return {
                    status: 200,
                    payload: {
                        results: idList.map((id) => ({ id, available: false })),
                        errors: [{ message: "Rate limited by Guesty" }],
                        rateLimited: true,
                    },
                };
            }
            if (timedOut && results.length === 0 && cachedStale) {
                return {
                    status: 200,
                    payload: { ...cachedStale, cached: true, stale: true, timedOut: true },
                };
            }

            const map = new Map();
            results.forEach((record) => {
                const id = record?._id || record?.id;
                if (!id) return;
                const days = record?.availability || [];
                const status = record?.availabilityStatus;
                const available =
                    Array.isArray(days) && days.length
                        ? days.every((d) => (d?.isAvailable ?? d?.available ?? true) !== false)
                        : typeof status === "string"
                            ? status.toUpperCase() === "AVAILABLE"
                            : false;
                map.set(id, available);
            });

            const missingIds = idList.filter((id) => !map.has(id));
            for (const missingId of missingIds) {
                if (rateLimited || timedOut || Date.now() > deadline) {
                    map.set(missingId, false);
                    continue;
                }
                try {
                    const quote = await createQuote({
                        unitTypeId: missingId,
                        checkInDateLocalized: startDate,
                        checkOutDateLocalized: endDate,
                        numberOfGuests: { numberOfAdults: Number(minOccupancy) || 1, numberOfChildren: 0 },
                        guestsCount: Number(minOccupancy) || 1,
                        source: "website",
                    });
                    if (quote) map.set(missingId, true);
                } catch (err) {
                    errors.push({ status: err?.status || 500, body: err?.message || "Quote fallback failed" });
                    map.set(missingId, false);
                }
            }

            const output = idList.map((id) => ({
                id,
                available: map.get(id) ?? false,
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
        const rateLimited = errors.some((err) => err.status === 429);
        if (rateLimited) {
            availabilityRateLimitedUntil.set(
                cacheKey,
                Date.now() + AVAILABILITY_RATE_LIMIT_MS
            );
        }
        if (rateLimited && cachedStale) {
            return res.status(200).json({ ...cachedStale, cached: true, stale: true, rateLimited: true });
        }
        if (rateLimited) {
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
                        unitTypeId: id,
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
