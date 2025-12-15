import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;
const guestyHost = "https://booking.guesty.com";
const clientId = process.env.GUESTY_CLIENT_ID;
const clientSecret = process.env.GUESTY_CLIENT_SECRET;

app.use(cors());
app.use(express.json());

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;
  if (tokenPromise) return tokenPromise;

  if (!clientId || !clientSecret) {
    throw new Error("Missing Guesty credentials in environment variables");
  }

  tokenPromise = fetch(`${guestyHost}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
    .then(async (res) => {
      if (res.status === 429) {
        throw new Error("RATE_LIMITED");
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token request failed: ${res.status} ${text}`);
      }
      return res.json();
    })
    .then((json) => {
      cachedToken = json.access_token;
      tokenExpiresAt = Date.now() + (json.expires_in || 86_400) * 1000;
      return cachedToken;
    })
    .catch(async (err) => {
      if (err.message === "RATE_LIMITED") {
        // simple backoff and retry once after 1.5s
        await wait(1500);
        return getToken();
      }
      throw err;
    })
    .finally(() => {
      tokenPromise = null;
    });

  return tokenPromise;
}

async function guestyFetch(path, init = {}) {
  const token = await getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(init.headers || {}),
  };
  if (init.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${guestyHost}${path}`, { ...init, headers });

  if (res.status === 429) {
    throw new Error("RATE_LIMITED");
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guesty API error ${res.status}: ${text}`);
  }

  return res.json();
}

app.get("/api/listings", async (_req, res) => {
  try {
    const data = await guestyFetch("/api/listings");
    const lightResults = (data?.results || []).map((item) => ({
      id: item._id,
      title: item.title,
      location: item.address?.city ? `${item.address.city}, ${item.address.state || ""}`.trim() : "",
      picture: item.picture?.regular || item.picture?.thumbnail || "",
      accommodates: item.accommodates,
      bedrooms: item.bedrooms,
      bathrooms: item.bathrooms,
      beds: item.beds,
      basePrice: item.prices?.basePrice,
      currency: item.prices?.currency || "USD",
      cleaningFee: item.prices?.cleaningFee,
      minNights: item.terms?.minNights || 1,
      tags: item.tags || [],
      timezone: item.timezone,
    }));
    res.json({ results: lightResults });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to load listings", error: err.message });
  }
});

app.get("/api/listings/:id/availability", async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate, adults = 1 } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate and endDate are required (YYYY-MM-DD)" });
  }

  try {
    const query = `listingId=${id}&startDate=${startDate}&endDate=${endDate}&adults=${adults}`;
    const primary = await guestyFetch(`/api/availability-pricing/availability?${query}`);
    res.json(primary);
  } catch (primaryErr) {
    console.warn("Primary availability endpoint failed, attempting fallback:", primaryErr.message);
    try {
      const fallback = await guestyFetch(`/api/availability/${id}?startDate=${startDate}&endDate=${endDate}&adults=${adults}`);
      res.json(fallback);
    } catch (fallbackErr) {
      console.error(fallbackErr);
      res.status(502).json({
        message: "Unable to fetch availability from Guesty",
        error: fallbackErr.message,
      });
    }
  }
});

app.get("/api/listings/:id/price-estimate", async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate, adults = 1, children = 0 } = req.query;

  if (!startDate || !endDate) {
    return res.status(400).json({ message: "startDate and endDate are required (YYYY-MM-DD)" });
  }

  try {
    const query = `listingId=${id}&startDate=${startDate}&endDate=${endDate}&adults=${adults}&children=${children}`;
    const estimate = await guestyFetch(`/api/availability-pricing/price-estimate?${query}`);
    res.json(estimate);
  } catch (err) {
    console.error(err);
    res.status(502).json({ message: "Unable to fetch price estimate", error: err.message });
  }
});

app.post("/api/book", async (req, res) => {
  const { listingId, checkIn, checkOut, adults = 1, children = 0, guest } = req.body || {};
  if (!listingId || !checkIn || !checkOut || !guest?.firstName || !guest?.lastName || !guest?.email) {
    return res.status(400).json({ message: "Missing required booking fields" });
  }

  try {
    const payload = {
      listingId,
      checkIn,
      checkOut,
      numberOfAdults: Number(adults),
      numberOfChildren: Number(children),
      guest,
    };

    const result = await guestyFetch("/api/reservations", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    res.json({ message: "Booking created", data: result });
  } catch (err) {
    console.error(err);
    res.status(502).json({ message: "Booking failed", error: err.message });
  }
});

app.listen(port, () => {
  console.log(`API server running on http://localhost:${port}`);
});
