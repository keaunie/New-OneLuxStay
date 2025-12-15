// CommonJS Netlify function acting as the Guesty API proxy with timeouts and retries.

const https = require("https");
const fetch = require("node-fetch");
const { AbortController } = require("node-fetch");

const guestyHost = "https://booking.guesty.com";
const clientId = process.env.GUESTY_CLIENT_ID;
const clientSecret = process.env.GUESTY_CLIENT_SECRET;

let cachedToken = null;
let tokenExpiresAt = 0;
let tokenPromise = null;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      agent: new https.Agent({ keepAlive: true }),
    });
    return res;
  } finally {
    clearTimeout(id);
  }
};

async function getToken(retry = 0) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;
  if (tokenPromise) return tokenPromise;
  if (!clientId || !clientSecret) throw new Error("Missing Guesty credentials in environment variables");

  const maxRetries = 2;

  tokenPromise = fetchWithTimeout(`${guestyHost}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
    .then(async (res) => {
      if (res.status === 429) throw new Error("RATE_LIMITED");
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
      if (err.message === "RATE_LIMITED" && retry < maxRetries) {
        await wait(1500 * (retry + 1));
        return getToken(retry + 1);
      }
      throw err;
    })
    .finally(() => {
      tokenPromise = null;
    });

  return tokenPromise;
}

async function guestyFetch(path, init = {}, timeoutMs = 8000) {
  const token = await getToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(init.headers || {}),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

  const res = await fetchWithTimeout(`${guestyHost}${path}`, { ...init, headers }, timeoutMs);
  if (res.status === 429) throw new Error("RATE_LIMITED");
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guesty API error ${res.status}: ${text}`);
  }
  return res.json();
}

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const normalizeResource = (path) => {
  if (!path) return "";
  const marker = "/.netlify/functions/guesty";
  const idx = path.indexOf(marker);
  let resource = idx >= 0 ? path.slice(idx + marker.length) : path;
  resource = resource.replace(/^\/+/, "").replace(/^api\//, "");
  return resource;
};

exports.handler = async (event) => {
  try {
    const { path, httpMethod, queryStringParameters } = event;
    const resource = normalizeResource(path);

    if (httpMethod === "GET" && (resource === "listings" || resource === "")) {
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
      return json(200, { results: lightResults });
    }

    if (httpMethod === "GET" && /^listings\/[^/]+\/availability/.test(resource)) {
      const [, listingId] = resource.split("/");
      const { startDate, endDate, adults = 1, children = 0 } = queryStringParameters || {};
      if (!startDate || !endDate) return json(400, { message: "startDate and endDate are required (YYYY-MM-DD)" });

      try {
        const query = `listingId=${listingId}&startDate=${startDate}&endDate=${endDate}&adults=${adults}&children=${children}`;
        const primary = await guestyFetch(`/api/availability-pricing/availability?${query}`);
        return json(200, primary);
      } catch {
        try {
          const fallback = await guestyFetch(
            `/api/availability/${listingId}?startDate=${startDate}&endDate=${endDate}&adults=${adults}&children=${children}`,
          );
          return json(200, fallback);
        } catch (fallbackErr) {
          return json(502, { message: "Unable to fetch availability from Guesty", error: fallbackErr.message });
        }
      }
    }

    if (httpMethod === "GET" && /^listings\/[^/]+\/price-estimate/.test(resource)) {
      const [, listingId] = resource.split("/");
      const { startDate, endDate, adults = 1, children = 0 } = queryStringParameters || {};
      if (!startDate || !endDate) return json(400, { message: "startDate and endDate are required (YYYY-MM-DD)" });
      const query = `listingId=${listingId}&startDate=${startDate}&endDate=${endDate}&adults=${adults}&children=${children}`;
      const estimate = await guestyFetch(`/api/availability-pricing/price-estimate?${query}`);
      return json(200, estimate);
    }

    if (httpMethod === "POST" && resource === "book") {
      let body = {};
      try {
        body = event.body ? JSON.parse(event.body) : {};
      } catch {
        return json(400, { message: "Invalid JSON body" });
      }
      const { listingId, checkIn, checkOut, adults = 1, children = 0, guest } = body;
      if (!listingId || !checkIn || !checkOut || !guest?.firstName || !guest?.lastName || !guest?.email) {
        return json(400, { message: "Missing required booking fields" });
      }
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
      return json(200, { message: "Booking created", data: result });
    }

    return json(404, { message: "Not Found" });
  } catch (err) {
    if (err.message === "RATE_LIMITED") {
      return json(429, { message: "Guesty rate limit hit. Please retry shortly." });
    }
    return json(500, { message: "Internal error", error: err.message });
  }
};
