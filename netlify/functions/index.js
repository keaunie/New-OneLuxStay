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
app.options("*", cors());

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

export const handler = serverless(app, { basePath: "/.netlify/functions/index" });
