import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import serverless from "serverless-http";
import fs from "fs/promises";

dotenv.config();

/* =======================
   NETLIFY SAFE PATHS
======================= */

// Netlify only allows writing to /tmp
const OPEN_API_TOKEN_FILE = "/tmp/guesty-openapi-token.json";
const BOOKING_TOKEN_FILE = "/tmp/guesty-booking-token.json";

/* =======================
   APP SETUP
======================= */

const app = express();
app.use(cors());
app.use(express.json());

/* =======================
   ENV & CONSTANTS
======================= */

const OPEN_API_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";
const BOOKING_TOKEN_URL = "https://booking.guesty.com/oauth2/token";
const BOOKING_API_BASE = "https://booking.guesty.com/api";

const PM_CONTENT_URL =
    "https://app.guesty.com/api/pm-websites-backend/engines/content";

const CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;

const pmAidCs = process.env.GUESTY_PM_G_AID_CS;
const pmRequestContext = process.env.GUESTY_PM_X_REQUEST_CONTEXT;
const pmOrigin =
    process.env.GUESTY_PM_ORIGIN || "https://reservations.oneluxstay.com";
const pmReferer =
    process.env.GUESTY_PM_REFERER || "https://reservations.oneluxstay.com/";

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
        title: l.title,
        picture:
            l.picture?.original ||
            l.picture?.large ||
            l.picture?.regular ||
            "",
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        accommodates: l.accommodates,
        basePrice: l.prices?.basePrice,
        currency: l.prices?.currency || "USD",
        cleaningFee: l.prices?.cleaningFee,
    }));
}

/* =======================
   QUOTES (BOOKING ENGINE)
======================= */

async function createQuote(payload) {
    const token = await getBookingEngineToken();

    const res = await fetch(`${BOOKING_API_BASE}/reservationQuotes`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            accept: "application/json",
        },
        body: JSON.stringify(payload),
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

    if (!listingId || !checkInDateLocalized || !checkOutDateLocalized) {
        return res.status(400).json({ message: "Missing quote parameters" });
    }

    try {
        const quote = await createQuote({
            unitTypeId: listingId,
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
   NETLIFY EXPORT
======================= */

export const handler = serverless(app);
