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

/* =======================
   CONSTANTS & ENV
======================= */

const guestyHost = "https://booking.guesty.com";
const openApiHost = "https://open-api.guesty.com";
const openApiServer = "https://open-api.guesty.com/v1";

const clientId = process.env.GUESTY_CLIENT_ID;
const clientSecret = process.env.GUESTY_CLIENT_SECRET;

const pmContentUrl =
    "https://app.guesty.com/api/pm-websites-backend/engines/content";

const pmAidCs = process.env.GUESTY_PM_G_AID_CS;
const pmRequestContext = process.env.GUESTY_PM_X_REQUEST_CONTEXT;
const pmOrigin =
    process.env.GUESTY_PM_ORIGIN || "https://reservations.oneluxstay.com";
const pmReferer =
    process.env.GUESTY_PM_REFERER || "https://reservations.oneluxstay.com/";

if (!clientId || !clientSecret) {
    throw new Error("Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET");
}

/* =======================
   APP MIDDLEWARE
======================= */

app.use(cors());
app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tokenCacheFile = path.join(__dirname, "../.guesty-token.json");
const openApiTokenCacheFile = path.join(__dirname, "../.guesty-openapi-token.json");

/* =======================
   UTILS
======================= */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
            client_id: clientId,
            client_secret: clientSecret,
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
            client_id: clientId,
            client_secret: clientSecret,
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

async function fetchPmContent(lang = "en") {
    const headers = {
        accept: "application/json",
        "g-aid-cs": pmAidCs,
        "x-request-context": pmRequestContext,
        origin: pmOrigin,
        referer: pmReferer,
    };

    const res = await fetchWithTimeout(
        `${pmContentUrl}?lang=${encodeURIComponent(lang)}`,
        { headers }
    );

    if (!res.ok) {
        throw new Error(`PM content error: ${await res.text()}`);
    }

    return res.json();
}

function normalizePmListings(pmData) {
    const stack = [pmData];
    const map = new Map();

    while (stack.length) {
        const cur = stack.pop();
        if (Array.isArray(cur)) stack.push(...cur);
        else if (cur && typeof cur === "object") {
            const id = cur._id || cur.id;
            if (cur.title && cur.bedrooms !== undefined && id) {
                map.set(id, cur);
            }
            stack.push(...Object.values(cur));
        }
    }

    return [...map.values()].map((l) => ({
        id: l._id || l.id,
        title: l.title,
        picture:
            l.picture?.original ||
            l.picture?.large ||
            l.picture?.regular ||
            "",
        basePrice: l.prices?.basePrice,
        currency: l.prices?.currency || "USD",
        cleaningFee: l.prices?.cleaningFee,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        accommodates: l.accommodates,
    }));
}

/* =======================
   QUOTES (OPEN API)
======================= */

async function createQuoteOpenApi(payload) {
    openApiDocs.server(openApiServer);
    const token = await getOpenApiToken();
    openApiDocs.auth(`Bearer ${token}`);

    const response =
        await openApiDocs.quotesOpenApiController_create(payload);

    return response?.data || response;
}

/* =======================
   ROUTES
======================= */

app.get("/api/listings", async (_req, res) => {
    try {
        const pm = await fetchPmContent("en");
        res.json({ results: normalizePmListings(pm) });
    } catch (e) {
        res.status(500).json({ message: "Listings failed", error: e.message });
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

/* =======================
   START
======================= */

app.listen(port, () => {
    console.log(`API running on http://localhost:${port}`);
});
