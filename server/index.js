import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

/* =======================
   NETLIFY SAFE PATHS
======================= */

// Netlify allows writing to /tmp; in local dev use the OS tmp dir (Windows safe)
const TMP_DIR = os.tmpdir();
const OPEN_API_TOKEN_FILE = path.join(TMP_DIR, "guesty-openapi-token.json");
const BOOKING_TOKEN_FILE = path.join(TMP_DIR, "guesty-booking-token.json");

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

const PM_CONTENT_URL ="https://app.guesty.com/api/pm-websites-backend/engines/content";

const CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;

const pmAidCs = process.env.GUESTY_PM_G_AID_CS;
const pmRequestContext = process.env.GUESTY_PM_X_REQUEST_CONTEXT;
const pmOrigin = process.env.GUESTY_PM_ORIGIN || "https://reservations.oneluxstay.com";
const pmReferer = process.env.GUESTY_PM_REFERER || "https://reservations.oneluxstay.com/";

if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET");
}

/* =======================
   UTILS
======================= */

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
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

    const cached = await readCache(OPEN_API_TOKEN_FILE);
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

    await writeCache(OPEN_API_TOKEN_FILE, {
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

async function fetchPmContent(lang = "en") {
    const res = await fetchWithTimeout(
        `${PM_CONTENT_URL}?lang=${encodeURIComponent(lang)}`,
        {
            headers: {
                accept: "application/json",
                "g-aid-cs": pmAidCs,
                "x-request-context": pmRequestContext,
                origin: pmOrigin,
                referer: pmReferer,
            },
        }
    );

    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

function normalizePmListings(pmData) {
    const stack = [pmData];
    const map = new Map();

    while (stack.length) {
        const cur = stack.pop();
        if (Array.isArray(cur)) stack.push(...cur);
        else if (isObject(cur)) {
            const id = cur._id || cur.id;
            if (cur.title && cur.bedrooms !== undefined && id) {
                map.set(id, cur);
            }
            stack.push(...Object.values(cur));
        }
    }

    return [...map.values()].map((l) => ({
        id: l._id || l.id,
        unitTypeId: l.unitTypeId || l._id || l.id,
        title: l.title,
        picture:
            l.picture?.original ||
            l.picture?.large ||
            l.picture?.regular ||
            "",
        city: l.address?.city || l.location?.city || l.timezone || "",
        photos: Array.isArray(l.pictures)
            ? l.pictures
                  .map((p) => p?.original || p?.large || p?.regular || p?.url || p)
                  .filter(Boolean)
            : Array.isArray(l.gallery)
              ? l.gallery
                    .map((p) => p?.original || p?.large || p?.regular || p?.url || p)
                    .filter(Boolean)
              : [],
        address:
            l.address?.full ||
            l.address?.formattedAddress ||
            l.address?.address ||
            [l.address?.street, l.address?.city, l.address?.state, l.address?.country]
                .filter(Boolean)
                .join(", "),
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        accommodates: l.accommodates,
        basePrice: l.prices?.basePrice,
        currency: l.prices?.currency || "USD",
        cleaningFee: l.prices?.cleaningFee,
    }));
}

/* =======================
   AVAILABILITY (OPEN API)
======================= */

async function fetchAvailability({ listingId, unitTypeId, startDate, endDate, guests = 1, city = "" }) {
    let data;
    let fallbackResponse;
    const errors = [];

    // Try booking-engine availability with unitTypeId if possible
    const beId = unitTypeId || listingId;
    try {
        const beToken = await getBookingEngineToken();
        const beUrl = `${BOOKING_API_BASE}/v2/unit-types/${encodeURIComponent(
            beId
        )}/availability/timeframe?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
        const beRes = await fetch(beUrl, {
            headers: { Authorization: `Bearer ${beToken}`, accept: "application/json" },
        });
        if (beRes.ok) {
            data = await beRes.json();
        } else {
            errors.push({ source: "booking", status: beRes.status, body: await beRes.text().catch(() => ""), id: beId });
        }
    } catch (err) {
        errors.push({ source: "booking-token", error: err.message || String(err) });
    }

    // Open API timeframe
    if (!data) {
        const token = await getOpenApiToken();
        const timeframeUrl = `${OPEN_API_BASE}/listings/${encodeURIComponent(
            listingId
        )}/availability/timeframe?startDate=${encodeURIComponent(
            startDate
        )}&endDate=${encodeURIComponent(endDate)}`;

        let res = await fetch(timeframeUrl, {
            headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        });

        if (res.ok) {
            data = await res.json();
        } else {
            errors.push({ source: "openapi-timeframe", status: res.status, body: await res.text().catch(() => "") });
        // Fallback: search listings with "available" filter and explicit fields (no city filter to avoid mismatches)
            const available = {
                checkIn: startDate,
                checkOut: endDate,
                minOccupancy: guests || 1,
            };
        const searchUrl = `${OPEN_API_BASE}/listings?ids=${encodeURIComponent(
            listingId
        )}&fields=_id availability availabilityStatus prices terms title address unitTypeId&available=${encodeURIComponent(
            JSON.stringify(available)
        )}`;
            res = await fetch(searchUrl, {
                headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
            });
            if (res.ok) {
                const searchJson = await res.json();
                fallbackResponse = searchJson;
                data = Array.isArray(searchJson?.results) ? searchJson.results[0] || null : searchJson;
            } else {
                errors.push({ source: "openapi-search-id", status: res.status, body: await res.text().catch(() => "") });
            }

            // If still nothing and city provided, try city-only query for availability and pick match
        if (!data && city) {
            const cityUrl = `${OPEN_API_BASE}/listings?city=${encodeURIComponent(
                city
            )}&fields=_id availability availabilityStatus prices terms title address unitTypeId&available=${encodeURIComponent(
                JSON.stringify(available)
            )}`;
                const cityRes = await fetch(cityUrl, {
                    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
                });
                if (cityRes.ok) {
                    const cityJson = await cityRes.json();
                    fallbackResponse = fallbackResponse || cityJson;
                    const found =
                        Array.isArray(cityJson?.results) && cityJson.results.find((r) => r._id === listingId);
                    data = found || (Array.isArray(cityJson?.results) ? cityJson.results[0] : null);
                } else {
                    errors.push({ source: "openapi-search-city", status: cityRes.status, body: await cityRes.text().catch(() => "") });
                }
            }

            // If still nothing, try search by unitTypeId as ids
            if (!data && unitTypeId && unitTypeId !== listingId) {
                const idUrl = `${OPEN_API_BASE}/listings?ids=${encodeURIComponent(
                    unitTypeId
                )}&fields=_id availability availabilityStatus prices terms title address&available=${encodeURIComponent(
                    JSON.stringify(available)
                )}${city ? `&city=${encodeURIComponent(city)}` : ""}`;
                const idRes = await fetch(idUrl, {
                    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
                });
                if (idRes.ok) {
                    const idJson = await idRes.json();
                    fallbackResponse = fallbackResponse || idJson;
                    data = Array.isArray(idJson?.results) ? idJson.results[0] || null : data;
                } else {
                    errors.push({ source: "openapi-search-unitTypeId", status: idRes.status, body: await idRes.text().catch(() => "") });
                }
            }
        }
    }

    const days =
        data?.availability ||
        data?.data?.availability ||
        data?.data ||
        (Array.isArray(data) ? data : []);

    const isAvailable =
        Array.isArray(days) && days.length
            ? days.every((d) => {
                  const flag =
                      d?.isAvailable ??
                      d?.available ??
                      (typeof d?.status === "string"
                          ? d.status.toUpperCase() !== "BLOCKED" &&
                            d.status.toUpperCase() !== "UNAVAILABLE"
                          : undefined);
                  return flag !== false;
              })
            : typeof data?.availabilityStatus === "string"
              ? data.availabilityStatus.toUpperCase() === "AVAILABLE"
              : Array.isArray(data?.results)
                ? data.results.length > 0
                : typeof fallbackResponse?.count === "number"
                  ? fallbackResponse.count > 0
                  : undefined;

    return { isAvailable, availability: days, raw: data || fallbackResponse, errors };
}

/* =======================
   QUOTES (BOOKING ENGINE)
======================= */

async function createQuote(payload) {
    // Booking API 404s in some tenants; open-api quotes is stable for pricing.
    const token = await getOpenApiToken();

    const res = await fetch(`${OPEN_API_BASE}/quotes`, {
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
    });

    if (!res.ok) throw new Error(await res.text());
    return res.json();
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

    try {
        const quote = await createQuote({
            unitTypeId: listingId,
            checkInDateLocalized,
            checkOutDateLocalized,
            numberOfGuests: { numberOfAdults: guests, numberOfChildren: 0 },
            guestsCount: guests,
            source: "website",
        });

        res.json({ results: [quote] });
    } catch (e) {
        res.status(502).json({ message: "Quote failed", error: e.message });
    }
});

app.get("/api/listings/:id/availability", async (req, res) => {
    const listingId = req.params.id;
    const { startDate, endDate, guests = 1, city = "", unitTypeId = "" } = req.query || {};

    if (!listingId || !startDate || !endDate) {
        return res.status(400).json({ message: "Missing availability parameters" });
    }

    try {
        const availability = await fetchAvailability({
            listingId,
            unitTypeId: unitTypeId || listingId,
            startDate,
            endDate,
            guests: Number(guests) || 1,
            city,
        });
        res.json(availability);
    } catch (e) {
        res.status(502).json({ message: "Availability failed", error: e.message });
    }
});

/* =======================
   STATIC FRONTEND (DIST)
======================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "../dist");
app.use(express.static(distDir));
app.get("*", (_req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
});

/* =======================
   START SERVER
======================= */

const port = process.env.PORT || 4000;
app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
