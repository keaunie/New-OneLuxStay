import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import serverless from "serverless-http";
import fs from "fs/promises";
import os from "os";
import path from "path";

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


const CLIENT_ID = process.env.GUESTY_CLIENT_ID;
const CLIENT_SECRET = process.env.GUESTY_CLIENT_SECRET;


if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("Missing GUESTY_CLIENT_ID or GUESTY_CLIENT_SECRET");
}

/* =======================
   UTILS
======================= */

const isObject = (v) => v && typeof v === "object" && !Array.isArray(v);

const collectPhotoUrls = (listing) => {
    const urls = [];
    const seen = new Set();
    const isLikelyUrl = (v) => typeof v === "string" && /^(https?:)?\/\//.test(v.trim());
    const push = (v) => {
        const url = typeof v === "string" ? v.trim() : "";
        if (!url || !isLikelyUrl(url) || seen.has(url)) return;
        seen.add(url);
        urls.push(url);
    };
    const walk = (v) => {
        if (!v) return;
        if (typeof v === "string") {
            push(v);
            return;
        }
        if (Array.isArray(v)) {
            v.forEach(walk);
            return;
        }
        if (isObject(v)) {
            ["original", "large", "regular", "url", "src", "href"].forEach((k) => walk(v[k]));
            ["pictures", "images", "photos", "gallery", "media"].forEach((k) => walk(v[k]));
        }
    };
    walk(listing.picture);
    walk(listing.pictures);
    walk(listing.images);
    walk(listing.photos);
    walk(listing.gallery);
    walk(listing.media);
    return urls;
};

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

async function fetchOpenApiListingsAll() {
    const token = await getOpenApiToken();
    const results = [];
    const limit = 50;
    let skip = 0;
    let total = Infinity;

    while (skip < total) {
        const qs = new URLSearchParams({
            limit: String(limit),
            skip: String(skip),
            fields: "title address pictures images photos accommodates bedrooms bathrooms prices city location",
            sort: "-createdAt",
        });
        const res = await fetchWithTimeout(`${OPEN_API_BASE}/listings?${qs}`, {
            headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (Array.isArray(json?.results)) results.push(...json.results);
        total = Number.isFinite(json?.count) ? json.count : results.length;
        if (!Array.isArray(json?.results) || json.results.length < limit) break;
        skip += limit;
    }

    return results;
}

function normalizeOpenApiListings(listings) {
    return listings.map((l) => ({
        id: l._id || l.id,
        title: l.title,
        picture:
            l.picture?.original ||
            l.picture?.large ||
            l.picture?.regular ||
            l.pictures?.[0]?.regular ||
            l.pictures?.[0]?.thumbnail ||
            "",
        photos: collectPhotoUrls(l),
        address: l.address || null,
        city: l.address?.city || l.city || l.location?.city || "",
        state: l.address?.state || l.state || "",
        country: l.address?.country || l.country || "",
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

app.get("/api/listings", async (req, res) => {
  try {
    const raw = await fetchOpenApiListingsAll();
    const merged = normalizeOpenApiListings(raw);
    const city = String(req.query.city || "").trim().toLowerCase();
    const filtered = city
      ? merged.filter((l) => String(l.city || "").toLowerCase() === city)
      : merged;
    res.json({ results: filtered });
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

  try {
    const token = await getOpenApiToken();
    const available = JSON.stringify({
      checkIn: startDate,
      checkOut: endDate,
      minOccupancy: Number(minOccupancy) || 1,
    });

    const tryQuery = async (query) => {
      const url = `${OPEN_API_BASE}/listings?${query}&fields=_id availability availabilityStatus prices terms title address&available=${encodeURIComponent(
        available
      )}`;
      const response = await fetchWithTimeout(url, {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
      });
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
            : true
          : false;
    res.json({ isAvailable, availability: days, raw: json, errors });
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

/* =======================
   NETLIFY EXPORT
======================= */

// Respect Netlify function mount path so Express routes remain at /api/*
export const handler = serverless(app, { basePath: "/.netlify/functions/index" });
