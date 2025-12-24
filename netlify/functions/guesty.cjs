﻿const fetchFn = (...args) => {
  if (!globalThis.fetch) throw new Error("Fetch not available");
  return globalThis.fetch(...args);
};

const openApiHost = "https://open-api.guesty.com";
const openApiServer = "https://open-api.guesty.com/v1";
const pmContentUrl =
  "https://app.guesty.com/api/pm-websites-backend/engines/content";

const clientId = process.env.GUESTY_CLIENT_ID;
const clientSecret = process.env.GUESTY_CLIENT_SECRET;
const pmAidCs = process.env.GUESTY_PM_G_AID_CS;
const pmRequestContext = process.env.GUESTY_PM_X_REQUEST_CONTEXT;

let openApiToken = null;
let openApiExp = 0;

/* =========================
   UTILS
========================= */

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchWithTimeout = async (url, options = {}, timeoutMs = 9000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
};

/* =========================
   OPEN API TOKEN
========================= */

async function getOpenApiToken() {
  if (openApiToken && Date.now() < openApiExp - 60_000) return openApiToken;

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

  if (!res.ok) throw new Error(await res.text());

  const json = await res.json();
  openApiToken = json.access_token;
  openApiExp = Date.now() + (json.expires_in - 300) * 1000;
  return openApiToken;
}

/* =========================
   PM CONTENT
========================= */

async function fetchPmContent(lang = "en") {
  const res = await fetchWithTimeout(
    `${pmContentUrl}?lang=${encodeURIComponent(lang)}`,
    {
      headers: {
        accept: "application/json",
        "g-aid-cs": pmAidCs,
        "x-request-context": pmRequestContext,
      },
    },
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
    else if (cur?.title && cur?._id) map.set(cur._id, cur);
    else if (cur && typeof cur === "object") stack.push(...Object.values(cur));
  }

  return [...map.values()].map((l) => ({
    id: l._id,
    title: l.title,
    picture: l.picture?.original || "",
    basePrice: l.prices?.basePrice,
    currency: l.prices?.currency || "USD",
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    accommodates: l.accommodates,
  }));
}

/* =========================
   NETLIFY HANDLER
========================= */

const json = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

module.exports.handler = async (event) => {
  try {
    const path = event.path.replace("/.netlify/functions/guesty", "");
    const method = event.httpMethod;

    /* LISTINGS */
    if (method === "GET" && path === "/listings") {
      const pm = await fetchPmContent("en");
      return json(200, { results: normalizePmListings(pm) });
    }

    /* QUOTES (OPEN API) */
    if (method === "POST" && path === "/reservations/quotes") {
      const body = JSON.parse(event.body || "{}");
      const token = await getOpenApiToken();

      const res = await fetchWithTimeout(`${openApiServer}/quotes`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          listingId: body.listingId,
          checkInDateLocalized: body.checkInDateLocalized,
          checkOutDateLocalized: body.checkOutDateLocalized,
          numberOfGuests: {
            numberOfAdults: Number(body.guestsCount) || 1,
          },
          source: "website",
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const quote = await res.json();
      return json(200, { results: [quote] });
    }

    return json(404, { message: "Not Found" });
  } catch (err) {
    return json(500, { message: "Error", error: err.message });
  }
};