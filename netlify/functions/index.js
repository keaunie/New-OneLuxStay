import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import serverless from "serverless-http";
import Stripe from "stripe";
import fetch from "node-fetch";

dotenv.config();

const app = express();
const corsOrigins = [
    process.env.APP_ORIGIN,
    "https://papayawhip-stinkbug-261234.hostingersite.com",
    "https://oneluxstay.com",
    "https://www.oneluxstay.com",
    "http://localhost:8888",
    "http://localhost:8888/",
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

const fetchImpl = globalThis.fetch || fetch;
const fetchWithTimeout = async (url, options = {}, timeout = 10000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetchImpl(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
};

// ---- Simple in-memory rate limiter (serverless-safe best effort) ----
const rateLimitStore = new Map();

const rateLimit = ({
    windowMs = 60_000, // 1 minute
    max = 30,          // max requests per window per IP
} = {}) => {
    return (req, res, next) => {
        const ip =
            req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
            req.socket?.remoteAddress ||
            "unknown";

        const now = Date.now();
        const entry = rateLimitStore.get(ip);

        if (!entry) {
            rateLimitStore.set(ip, { count: 1, start: now });
            return next();
        }

        // Reset window
        if (now - entry.start > windowMs) {
            rateLimitStore.set(ip, { count: 1, start: now });
            return next();
        }

        // Exceeded
        if (entry.count >= max) {
            return res.status(429).json({
                message: "Too many requests",
                retryAfterSeconds: Math.ceil((windowMs - (now - entry.start)) / 1000),
            });
        }

        entry.count += 1;
        rateLimitStore.set(ip, entry);
        next();
    };
};



const getGuestyAccessToken = async () => {
    const clientId = process.env.GUESTY_OPEN_API_CLIENT_ID;
    const clientSecret = process.env.GUESTY_OPEN_API_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Missing Guesty Open API client credentials");
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
        },
        15000
    );

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Guesty token request failed: ${text}`);
    }

    const data = await response.json();

    return {
        accessToken: data.access_token,
        expiresIn: data.expires_in, // seconds
        tokenType: data.token_type,
        scope: data.scope,
    };
};

let guestyTokenCache = {
    token: null,
    expiresAt: 0,
};

const getGuestyTokenFromCache = async () => {
    const now = Date.now();

    // Return cached token if still valid (1 min safety buffer)
    if (
        guestyTokenCache.token &&
        guestyTokenCache.expiresAt > now + 60_000
    ) {
        return guestyTokenCache.token;
    }

    // Fetch new token
    const { accessToken, expiresIn } = await getGuestyAccessToken();

    guestyTokenCache = {
        token: accessToken,
        expiresAt: now + expiresIn * 1000,
    };

    return accessToken;
};

app.get("/api/guesty/token-test", async (_req, res) => {
    try {
        const token = await getGuestyTokenFromCache();
        res.json({ ok: true, tokenPreview: token.slice(0, 20) + "..." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

const stripeSecret = process.env.STRIPE_SECRET_KEY || "";
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: "2023-10-16" }) : null;

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

        if (!amount) {
            return res.status(400).json({ message: "Missing checkout amount" });
        }

        const origin = process.env.APP_ORIGIN || "";
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
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
                listingId: listingId || "",
                checkIn: checkIn || "",
                checkOut: checkOut || "",
                guests: String(guests || 1),
                guestName: guest?.name || "",
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
        console.log("Stripe checkout completed", {
            id: session.id,
            amount_total: session.amount_total,
            customer_email: session.customer_email,
            metadata: session.metadata,
        });
    }

    res.json({ received: true });
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

    try {
        const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
        geocodeUrl.searchParams.set("address", address);
        geocodeUrl.searchParams.set("key", apiKey);
        const geoRes = await fetchWithTimeout(geocodeUrl.toString(), {}, 10000);
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
            const r = await fetchWithTimeout(url.toString(), {}, 10000);
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
        res.json(payload);
    } catch (e) {
        res.status(502).json({ message: "Landmarks lookup failed", error: e.message });
    }
});

app.use((err, _req, res, _next) => {
    console.error("Unhandled error", err?.message || err);
    if (res.headersSent) return;
    res.status(500).json({
        message: "Unhandled server error",
        error: err?.message || String(err),
    });
});


app.get("/api/listings", rateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
    try {
        const token = await getGuestyTokenFromCache();

        if (!token) {
            return res.status(401).json({
                message: "Guesty access token not found in cache",
            });
        }

        // Build Guesty URL
        const url = new URL("https://open-api.guesty.com/v1/listings");

        // Forward ALL query params as-is
        Object.entries(req.query || {}).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                url.searchParams.append(key, value);
            }
        });

        const response = await fetchWithTimeout(
            url.toString(),
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            },
            15000
        );

        if (!response.ok) {
            const text = await response.text();
            return res.status(response.status).json({
                message: "Guesty API error",
                error: text,
            });
        }

        const data = await response.json();
        res.status(200).json(data);
    } catch (err) {
        console.error("Guesty /api/listings error:", err);
        res.status(500).json({
            message: "Failed to fetch Guesty listings",
            error: err.message,
        });
    }
});


app.get("/api/listings/all", async (req, res) => {
    try {
        const token = await getGuestyTokenFromCache();
        const limit = 100;
        let skip = 0;
        let allListings = [];
        let total = Infinity;

        while (skip < total) {
            const url = new URL("https://open-api.guesty.com/v1/listings");
            url.searchParams.set("limit", limit);
            url.searchParams.set("skip", skip);

            const response = await fetchWithTimeout(url.toString(), {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const data = await response.json();

            if (Array.isArray(data?.results)) {
                allListings.push(...data.results);
            }

            total = data.count;
            skip += limit;
        }

        res.json({
            total: allListings.length,
            listings: allListings,
        });
    } catch (err) {
        res.status(500).json({
            message: "Failed to fetch all listings",
            error: err.message,
        });
    }
});




export const handler = serverless(app, { basePath: "/.netlify/functions/index" });
