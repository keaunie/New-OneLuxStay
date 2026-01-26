import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import serverless from "serverless-http";
import Stripe from "stripe";
import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

dotenv.config();

/* =========================
   Logging helper
========================= */
const logGuestyToken = (message, extra = {}) => {
    console.log(
        `[Guesty Token] ${message}`,
        Object.keys(extra).length ? extra : ""
    );
};

/* =========================
   App init
========================= */
const app = express();
let guestyOauthBlockedUntil = 0;

/* =========================
   CORS
========================= */
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
        allowedHeaders: ["Content-Type", "Authorization", "Stripe-Signature"],
    })
);

app.use(
    express.json({
        verify: (req, _res, buf) => {
            req.rawBody = buf;
        },
    })
);

/* =========================
   Fetch with timeout
========================= */
const fetchImpl = globalThis.fetch || fetch;

const fetchWithTimeout = async (url, options = {}, timeout = 15000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
};

/* =========================
   Rate limiter (per IP)
========================= */
const rateLimitStore = new Map();

const rateLimit = ({ windowMs = 60_000, max = 30 } = {}) => {
    return (req, res, next) => {
        const ip =
            req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
            req.socket?.remoteAddress ||
            "unknown";

        const now = Date.now();
        const entry = rateLimitStore.get(ip);

        if (!entry || now - entry.start > windowMs) {
            rateLimitStore.set(ip, { count: 1, start: now });
            return next();
        }

        if (entry.count >= max) {
            return res.status(429).json({
                message: "Too many requests",
                retryAfterSeconds: Math.ceil(
                    (windowMs - (now - entry.start)) / 1000
                ),
            });
        }

        entry.count += 1;
        rateLimitStore.set(ip, entry);
        next();
    };
};

/* =========================
   Guesty OAuth
========================= */
const getGuestyAccessToken = async () => {
    const clientId = process.env.GUESTY_OPEN_API_CLIENT_ID;
    const clientSecret = process.env.GUESTY_OPEN_API_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Missing Guesty Open API credentials");
    }

    const body = new URLSearchParams({
        grant_type: "client_credentials",
        scope: "open-api",
        client_id: clientId,
        client_secret: clientSecret,
    });

    const response = await fetchWithTimeout(
        "https://open-api.guesty.com/oauth2/token",
        {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
        }
    );

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
};

/* =========================
   Netlify Blobs token store
========================= */
const guestyStore = getStore("guesty-auth");

// in-memory fast cache (per instance)
let inMemoryToken = null;
let inMemoryExpiresAt = 0;

// refresh lock (per instance)
let refreshing = false;
let waiters = [];

const TOKEN_REFRESH_BUFFER = 5 * 60 * 1000; // 5 minutes

const getGuestyTokenFromCache = async () => {
    const now = Date.now();

    /* ========= 1. In-memory ========= */
    if (inMemoryToken && inMemoryExpiresAt > now + TOKEN_REFRESH_BUFFER) {
        logGuestyToken("Using in-memory token");
        return inMemoryToken;
    }

    /* ========= 2. Netlify Blobs ========= */
    const stored = await guestyStore.get("access-token", { type: "json" });

    if (
        stored?.token &&
        stored?.expiresAt > now + TOKEN_REFRESH_BUFFER
    ) {
        logGuestyToken("Using Netlify Blobs token", {
            minutesRemaining: Math.floor(
                (stored.expiresAt - now) / 1000 / 60
            ),
        });

        inMemoryToken = stored.token;
        inMemoryExpiresAt = stored.expiresAt;
        return stored.token;
    }

    /* ========= 3. OAuth backoff ========= */
    if (now < guestyOauthBlockedUntil) {
        throw new Error("Guesty OAuth temporarily blocked. Retry later.");
    }

    /* ========= 4. Single-flight refresh ========= */
    if (refreshing) {
        logGuestyToken("Waiting for token refresh");
        return new Promise((resolve, reject) => {
            waiters.push({ resolve, reject });
        });
    }

    refreshing = true;
    logGuestyToken("Refreshing Guesty access token");

    try {
        const data = await getGuestyAccessToken();
        const expiresAt = Date.now() + data.expires_in * 1000;

        const payload = {
            token: data.access_token,
            expiresAt,
        };

        // store globally
        await guestyStore.setJSON("access-token", payload);

        // store locally
        inMemoryToken = payload.token;
        inMemoryExpiresAt = payload.expiresAt;

        logGuestyToken("New token stored", {
            expiresInHours: Math.round(data.expires_in / 3600),
        });

        waiters.forEach(w => w.resolve(payload.token));
        waiters = [];

        return payload.token;
    } catch (err) {
        if (err.message.includes("TOO_MANY_REQUESTS")) {
            guestyOauthBlockedUntil = Date.now() + 6 * 60 * 60 * 1000;
            console.warn("[Guesty Token] OAuth blocked — backing off 6 hours");
        }

        waiters.forEach(w => w.reject(err));
        waiters = [];
        throw err;
    } finally {
        refreshing = false;
    }
};

/* =========================
   Stripe (unchanged)
========================= */
const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe = stripeSecret
    ? new Stripe(stripeSecret, { apiVersion: "2023-10-16" })
    : null;

/* =========================
   Listings (Guesty)
========================= */
app.get(
    "/api/listings",
    rateLimit({ windowMs: 60_000, max: 30 }),
    async (req, res) => {
        try {
            const token = await getGuestyTokenFromCache();
            const url = new URL("https://open-api.guesty.com/v1/listings");

            Object.entries(req.query || {}).forEach(([k, v]) => {
                if (v != null) url.searchParams.append(k, v);
            });

            const response = await fetchWithTimeout(url.toString(), {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            res.json(await response.json());
        } catch (err) {
            res.status(500).json({
                message: "Failed to fetch Guesty listings",
                error: err.message,
            });
        }
    }
);

/* =========================
   Error handler
========================= */
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err);
    if (!res.headersSent) {
        res.status(500).json({ message: "Server error", error: err.message });
    }
});

/* =========================
   Netlify export
========================= */
export const handler = serverless(app, {
    basePath: "/.netlify/functions/index",
});
