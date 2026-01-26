import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import serverless from "serverless-http";
import Stripe from "stripe";
import fetch from "node-fetch";

dotenv.config();
const logGuestyToken = (message, extra = {}) => {
    console.log(
        `[Guesty Token] ${message}`,
        Object.keys(extra).length ? extra : ""
    );
};

let guestyOauthBlockedUntil = 0;



const app = express();

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
   Guesty OAuth (SAFE)
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

// 🔐 Token cache with refresh lock
let guestyTokenCache = {
    token: null,
    expiresAt: 0,
    refreshing: false,
    waiters: [],
};

const getGuestyTokenFromCache = async () => {
    const now = Date.now();

    // ✅ Reuse valid cached token
    if (
        guestyTokenCache.token &&
        guestyTokenCache.expiresAt > now + 5 * 60_000
    ) {
        const minutesLeft = Math.floor(
            (guestyTokenCache.expiresAt - now) / 1000 / 60
        );

        logGuestyToken("Using cached token", {
            minutesRemaining: minutesLeft,
        });

        return guestyTokenCache.token;
    }

    if (Date.now() < guestyOauthBlockedUntil) {
        throw new Error(
            "Guesty OAuth temporarily blocked. Retry later."
        );
    }

    // 🟡 Another request is already refreshing the token
    if (guestyTokenCache.refreshing) {
        logGuestyToken("Waiting for token refresh to complete");
        return new Promise((resolve, reject) => {
            guestyTokenCache.waiters.push({ resolve, reject });
        });
    }

    guestyTokenCache.refreshing = true;
    logGuestyToken("Refreshing access token");

    try {
        const data = await getGuestyAccessToken();

        guestyTokenCache.token = data.access_token;
        guestyTokenCache.expiresAt =
            Date.now() + data.expires_in * 1000;

        logGuestyToken("New token acquired", {
            expiresInHours: Math.round(data.expires_in / 3600),
            expiresAt: new Date(guestyTokenCache.expiresAt).toISOString(),
        });

        // Wake up queued requests
        guestyTokenCache.waiters.forEach(w =>
            w.resolve(data.access_token)
        );
        guestyTokenCache.waiters = [];

        return data.access_token;
    } catch (err) {
        if (err.message.includes("TOO_MANY_REQUESTS")) {
            guestyOauthBlockedUntil = Date.now() + 6 * 60 * 60 * 1000;
            console.warn("[Guesty Token] OAuth blocked — backing off 6 hours");
        }

        guestyTokenCache.waiters.forEach(w => w.reject(err));
        guestyTokenCache.waiters = [];
        throw err;
    }

    finally {
        guestyTokenCache.refreshing = false;
    }
};

/* =========================
   Stripe
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
