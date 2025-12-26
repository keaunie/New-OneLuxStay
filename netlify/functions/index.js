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
app.use(express.json());
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

const CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;

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
const pmAllowedLangs = ["de", "es", "fr", "it", "ja", "ko", "pt", "el", "pl", "ro", "in", "zh", "nl", "bg"];
const pmLangRaw = process.env.GUESTY_PM_LANG || "";
const pmLang = pmAllowedLangs.includes(pmLangRaw) ? pmLangRaw : "";
const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
const appOrigin = process.env.APP_ORIGIN || "";
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2023-10-16" }) : null;

if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET");
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

const AVAILABILITY_CACHE_TTL_MS = 10 * 60_000;
const AVAILABILITY_CACHE_MAX = 500;
const availabilityCache = new Map();
const quoteCache = new Map();
const QUOTE_CACHE_TTL_MS =
    Number(process.env.GUESTY_QUOTE_CACHE_TTL_MS || 15 * 60_000); // default 15 min

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

// Simple limiter: cap concurrent Guesty calls and pace to N per second
const MAX_CONCURRENT = Number(process.env.GUESTY_MAX_CONCURRENT || 1);
const MIN_INTERVAL_MS = Number(process.env.GUESTY_MIN_INTERVAL_MS || 1200); // default <1 req/sec
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

const setQuoteCache = (key, value) => {
    quoteCache.set(key, { value, expiresAt: Date.now() + QUOTE_CACHE_TTL_MS });
};

const readCache = async (file) => {
    try {
        const raw = await fs.readFile(file, "utf-8");
        return JSON.parse(raw);
    } catch {
        return null;
    }
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
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
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
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
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
    // Use Open API listings only
    const openApiList = await fetchOpenApiListings(options);
    if (!Array.isArray(openApiList) || openApiList.length === 0) {
        throw new Error("Open API listings returned no results");
    }
    return normalizePmListings(openApiList);
}

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
        const city = inferCity(l);
        return {
            id: l._id || l.id,
            _id: l._id || l.id,
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

/* =======================
   QUOTES (BOOKING ENGINE)
======================= */

async function createQuote(payload) {
    // Booking API 404s in some tenants; open-api quotes is stable for pricing.
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
                    listingId: payload.unitTypeId,
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

        if (!res.ok) throw new Error(await res.text());
        return res.json();
    };

    return tryPost();
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

        const pm = await fetchPmListings({
            checkIn,
            checkOut,
            minOccupancy,
            city,
            tags,
            ids,
            limit,
        });
        const results = normalizePmListings(pm);
        res.json({ results });
    } catch (e) {
        res.status(500).json({ message: "Listings failed", error: e.message });
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
        } = req.body || {};

        if (!listingId || !checkIn || !checkOut) {
            return res.status(400).json({ message: "Missing checkout parameters" });
        }
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ message: "Missing or invalid amount" });
        }

        const origin = req.headers.origin || appOrigin || "http://localhost:8888";
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
            },
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
            const payload = { isAvailable: false, availability: [], raw: null, errors };
            if (rateLimited) {
                return res.status(429).json({ message: "Rate limited by Guesty", ...payload });
            }
            return res.json(payload);
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
        res.json(payload);
    } catch (e) {
        res.status(502).json({ message: "Availability failed", error: e.message, errors });
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

    try {
        const quote = await createQuote({
            unitTypeId: listingId,
            checkInDateLocalized,
            checkOutDateLocalized,
            numberOfGuests: { numberOfAdults: guests, numberOfChildren: 0 },
            guestsCount: guests,
            source: "website",
        });

        const payload = { results: [quote] };
        setQuoteCache(cacheKey, payload);
        res.json(payload);
    } catch (e) {
        if (e?.rateLimited || e?.status === 429) {
            return res
                .status(429)
                .json({ message: "Rate limited by Guesty", error: e.message });
        }
        res.status(502).json({ message: "Quote failed", error: e.message });
    }
});

/* =======================
   NETLIFY EXPORT
======================= */

// Respect Netlify function mount path so Express routes remain at /api/*
export const handler = serverless(app, { basePath: "/.netlify/functions/index" });
