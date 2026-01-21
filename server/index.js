import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import openApiDocs from "@api/open-api-docs";
import Stripe from "stripe";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

/* =======================
   CONSTANTS & ENV
======================= */

const guestyHost = "https://booking.guesty.com";
const openApiHost = "https://open-api.guesty.com";
const openApiServer = "https://open-api.guesty.com/v1";

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

const pmListingsUrl =
    "https://app.guesty.com/api/pm-websites-backend/listings";

const pmAidCs = process.env.GUESTY_PM_G_AID_CS;
const pmRequestContext = process.env.GUESTY_PM_X_REQUEST_CONTEXT;
const pmOrigin =
    process.env.GUESTY_PM_ORIGIN || "https://reservations.oneluxstay.com";
const pmReferer =
    process.env.GUESTY_PM_REFERER || "https://reservations.oneluxstay.com/";
const pmContentUrl =
    "https://app.guesty.com/api/pm-websites-backend/engines/content";
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
const stripe =
    stripeSecret
        ? new Stripe(stripeSecret, { apiVersion: "2023-10-16" })
        : null;

if (!BOOKING_CLIENT_ID || !BOOKING_CLIENT_SECRET) {
    throw new Error("Missing GUESTY_BE_CLIENT_ID or GUESTY_BE_CLIENT_SECRET");
}

/* =======================
   APP MIDDLEWARE
======================= */

app.use(cors());
app.use(
    express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    })
);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tokenCacheFile = path.join(__dirname, "../.guesty-token.json");
const openApiTokenCacheFile = path.join(__dirname, "../.guesty-openapi-token.json");

/* =======================
   UTILS
======================= */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
};

const AVAILABILITY_CACHE_TTL_MS = 10 * 60_000;
const AVAILABILITY_CACHE_MAX = 500;
const availabilityCache = new Map();
const CALENDAR_CACHE_TTL_MS =
    Number(process.env.GUESTY_CALENDAR_CACHE_TTL_MS || 6 * 60 * 60_000); // default 6 hours
const calendarCache = new Map();
const LISTINGS_CACHE_TTL_MS = Number(process.env.GUESTY_LISTINGS_CACHE_TTL_MS || 5 * 60_000); // 5 min
let listingsCache = { key: "", expiresAt: 0, data: null };
const landmarksCache = new Map();
const LANDMARKS_CACHE_TTL_MS = 24 * 60 * 60_000;
const inflightCalendars = new Map();

const MAX_CONCURRENT = Number(process.env.GUESTY_MAX_CONCURRENT || 1);
const MIN_INTERVAL_MS = Number(process.env.GUESTY_MIN_INTERVAL_MS || 2000);
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

const getCalendarCache = (key) => {
    const entry = calendarCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        calendarCache.delete(key);
        return null;
    }
    return entry.value;
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

/* =======================
   BOOKING API TOKEN
======================= */

let bookingToken = null;
let bookingTokenExp = 0;

async function getBookingToken() {
    if (bookingToken && Date.now() < bookingTokenExp - 60_000) {
        return bookingToken;
    }

    try {
        const raw = await fs.readFile(tokenCacheFile, "utf-8");
        const cached = JSON.parse(raw);
        if (Date.now() < cached.expiresAt - 60_000) {
            bookingToken = cached.token;
            bookingTokenExp = cached.expiresAt;
            return bookingToken;
        }
    } catch { }

    const res = await fetchWithTimeout(`${guestyHost}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "booking_engine:api",
            client_id: BOOKING_CLIENT_ID,
            client_secret: BOOKING_CLIENT_SECRET,
        }),
    });

    if (!res.ok) {
        throw new Error(`Booking token failed: ${await res.text()}`);
    }

    const json = await res.json();
    bookingToken = json.access_token;
    bookingTokenExp = Date.now() + json.expires_in * 1000;

    await fs.writeFile(
        tokenCacheFile,
        JSON.stringify({ token: bookingToken, expiresAt: bookingTokenExp }, null, 2)
    );

    return bookingToken;
}

/* =======================
   OPEN API TOKEN
======================= */

let openApiToken = null;
let openApiExp = 0;

async function getOpenApiToken() {
    if (!OPEN_API_CLIENT_ID || !OPEN_API_CLIENT_SECRET) {
        throw new Error("Missing GUESTY_OPEN_API_CLIENT_ID or GUESTY_OPEN_API_CLIENT_SECRET");
    }

    if (openApiToken && Date.now() < openApiExp - 60_000) {
        return openApiToken;
    }

    try {
        const raw = await fs.readFile(openApiTokenCacheFile, "utf-8");
        const cached = JSON.parse(raw);
        if (Date.now() < cached.expiresAt - 60_000) {
            openApiToken = cached.token;
            openApiExp = cached.expiresAt;
            return openApiToken;
        }
    } catch { }

    const res = await fetchWithTimeout(`${openApiHost}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            scope: "open-api",
            client_id: OPEN_API_CLIENT_ID,
            client_secret: OPEN_API_CLIENT_SECRET,
        }),
    });

    if (!res.ok) {
        throw new Error(`Open API token failed: ${await res.text()}`);
    }

    const json = await res.json();
    openApiToken = json.access_token;
    openApiExp = Date.now() + (json.expires_in - 300) * 1000;

    await fs.writeFile(
        openApiTokenCacheFile,
        JSON.stringify({ token: openApiToken, expiresAt: openApiExp }, null, 2)
    );

    return openApiToken;
}

/* =======================
   PM CONTENT (LISTINGS)
======================= */

async function fetchPmListings(options = {}) {
    try {
        const contentListings = await fetchPmContentListings(options);
        if (Array.isArray(contentListings) && contentListings.length > 0) {
            return normalizePmListings(contentListings);
        }
    } catch (err) {
        console.error("PM content listings fetch failed", err?.message || err);
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
    const map = new Map();

    list.forEach((l) => {
        const id = l._id || l.id;
        if (id && l.title) map.set(id, l);
    });

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

    return [...map.values()].map((l) => ({
        id: l._id || l.id,
        _id: l._id || l.id,
        unitTypeId: l.unitTypeId || l.listingId || l.mtl?.unitTypeId || l.mtl?.listingId || l.mtl?.id,
        title: l.title,
        nickname: l.nickname,
        accommodates: l.accommodates,
        accountId: l.accountId,
        address: l.address,
        city: cityOverride.get(l._id || l.id) || inferCity(l),
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
            "",
        pictures: Array.isArray(l.pictures) ? l.pictures : [],
        prices: l.prices,
        basePrice: l.prices?.basePrice,
        currency: l.prices?.currency || "USD",
        cleaningFee: l.prices?.cleaningFee,
        publicDescription: l.publicDescription,
        reviews: l.reviews,
        roomType: l.roomType,
    }));
}

const extractFromPmContent = (pmData) => {
    const stack = [pmData];
    const out = [];
    while (stack.length) {
        const cur = stack.pop();
        if (Array.isArray(cur)) {
            stack.push(...cur);
        } else if (cur && typeof cur === "object") {
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

    const token = await getBookingToken();
    const url = new URL(pmContentUrl);
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

    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || res.status);
    }

    const json = await res.json();
    const flat = extractFromPmContent(json);
    setListingsCache(cacheKey, flat);
    return flat;
};

async function fetchOpenApiListings({
    checkIn,
    checkOut,
    minOccupancy = 1,
    city = "",
    tags = "",
    ids = "",
    limit = 50,
} = {}) {
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
                    }),
                );
            }
            if (city) qs.set("city", city);
            if (tags) qs.set("tags", tags);
            if (ids) qs.set("ids", ids);
            if (cursor) qs.set("cursor", cursor);

            const fetchPage = async (attempt = 0) => {
                const res = await withLimit(() =>
                    fetchWithTimeout(`${openApiServer}/listings?${qs.toString()}`, { headers })
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
        if (err?.status === 429 || err?.rateLimited) {
            err.rateLimited = true;
            err.status = err.status || 429;
        }
        throw err;
    }
}

/* =======================
   QUOTES (OPEN API)
======================= */

async function createQuoteOpenApi(payload) {
    openApiDocs.server(openApiServer);
    const token = await getOpenApiToken();
    openApiDocs.auth(`Bearer ${token}`);

    const response = await withLimit(() =>
        openApiDocs.quotesOpenApiController_create(payload)
    );

    return response?.data || response;
}

async function createReservationOpenApi(payload) {
    const token = await getOpenApiToken();
    const res = await fetchWithTimeout(`${openApiServer}/reservations`, {
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

        const pm = await fetchPmListings({
            checkIn,
            checkOut,
            minOccupancy,
            city,
            tags,
            ids: idsCombined,
            limit,
        });

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

        res.json({ results: merged });
    } catch (e) {
        const status = e?.status === 429 || e?.rateLimited ? 429 : 500;
        res.status(status).json({
            message: status === 429 ? "Rate limited by Guesty" : "Listings failed",
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

        const tryQuery = async (query) => {
            const url = `${openApiHost}/listings?${query}&fields=_id availability availabilityStatus prices terms title address&available=${encodeURIComponent(
                available
            )}`;
            const response = await fetchWithTimeout(url, {
                headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
            });
            if (response.status === 429) {
                const retryAfter = Number(response.headers.get("retry-after") || 0);
                await wait(retryAfter > 0 ? retryAfter * 1000 : 800);
                return tryQuery(query);
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

        // 1) Try by ids
        let json =
            (await tryQuery(`ids=${encodeURIComponent(id)}${city ? `&city=${encodeURIComponent(city)}` : ""}`)) ||
            // 2) Try by city only
            (city ? await tryQuery(`city=${encodeURIComponent(city)}`) : null) ||
            // 3) Try by unitTypeId if provided
            (unitTypeId
                ? await tryQuery(`ids=${encodeURIComponent(unitTypeId)}${city ? `&city=${encodeURIComponent(city)}` : ""}`)
                : null);

        if (!json) {
            const noResults = errors.some((e) => e.body === "No results");
            if (noResults) {
                return res.json({ isAvailable: false, availability: [], raw: null, errors });
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
                return res.json(payload);
            } catch (quoteErr) {
                errors.push({
                    status: quoteErr?.status || 500,
                    body: quoteErr?.message || "Quote fallback failed",
                });
            }
            return res.json({ isAvailable: false, availability: [], raw: null, errors });
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
                        : true // record exists, no availability entries: treat as available
                    : false; // no record: not available
        const payload = { isAvailable, availability: days, raw: json, errors };
        setAvailabilityCache(cacheKey, payload);
        res.json(payload);
    } catch (e) {
        res.status(502).json({ message: "Availability failed", error: e.message, errors });
    }
});

app.get("/api/listings/availability-bulk", async (req, res) => {
    const { ids = "", startDate, endDate, minOccupancy = 1, city = "" } = req.query || {};
    const idList = String(ids)
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

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

    try {
        const token = await getOpenApiToken();
        const available = JSON.stringify({
            checkIn: startDate,
            checkOut: endDate,
            minOccupancy: Number(minOccupancy) || 1,
        });

        const fetchChunk = async (chunk, attempt = 0) => {
            const url = `${openApiHost}/listings?ids=${encodeURIComponent(
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
            const chunk = idList.slice(i, i + chunkSize);
            const json = await fetchChunk(chunk);
            if (Array.isArray(json?.results)) results.push(...json.results);
        }

        const map = new Map();
        results.forEach((record) => {
            const id = record?._id || record?.id;
            if (!id) return;
            const days = record?.availability || [];
            const status = record?.availabilityStatus;
            const availableResult =
                Array.isArray(days) && days.length
                    ? days.every((d) => (d?.isAvailable ?? d?.available ?? true) !== false)
                    : typeof status === "string"
                        ? status.toUpperCase() === "AVAILABLE"
                        : false;
            map.set(id, availableResult);
        });

        const output = idList.map((id) => ({
            id,
            available: map.get(id) ?? false,
        }));

        const payload = { results: output, errors };
        setAvailabilityCache(cacheKey, payload);
        res.json(payload);
    } catch (e) {
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
    if (cached) return res.json({ ...cached, cached: true });

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
                    const quote = await createQuoteOpenApi({
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
                    if (err?.status === 429 || err?.rateLimited) {
                        rateLimited = true;
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
            };
            setCalendarCache(cacheKey, payload);
            return { status: rateLimited ? 429 : 200, payload };
        });

        res.status(result.status).json(result.payload);
    } catch (e) {
        res.status(502).json({ message: "Calendar pricing failed", error: e.message, errors });
    }
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

    if (!listingId || !checkInDateLocalized || !checkOutDateLocalized) {
        return res.status(400).json({ message: "Missing quote parameters" });
    }

    try {
        const quote = await createQuoteOpenApi({
            listingId,
            checkInDateLocalized,
            checkOutDateLocalized,
            numberOfGuests: {
                numberOfAdults: Number(guestsCount) || 1,
            },
            source: "website",
        });

        res.json({ results: [quote] });
    } catch (e) {
        res.status(502).json({ message: "Quote failed", error: e.message });
    }
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
   START
======================= */

app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
});
