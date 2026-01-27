import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

/* =========================
   Config
========================= */
const GUESTY_LISTINGS_URL = "https://open-api.guesty.com/v1/listings";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

/* =========================
   Global Rate Limit (Safe)
========================= */
const RATE_STORE = "guesty-rate";
const RATE_KEY = "last-call";
const MIN_INTERVAL_MS = 120; // ~8 req/sec

/* =========================
   Helpers
========================= */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const jsonResponse = (statusCode, body, headers = {}) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        ...headers,
    },
    body: JSON.stringify(body),
});

const fetchWithTimeout = async (url, options = {}, timeout = 15000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
};

/* =========================
   Read-only Token (Blob)
========================= */
const getGuestyToken = async () => {
    const { NETLIFY_SITE_ID, NETLIFY_BLOBS_TOKEN } = process.env;

    const store = getStore({
        name: TOKEN_STORE_NAME,
        siteID: NETLIFY_SITE_ID,
        token: NETLIFY_BLOBS_TOKEN,
    });

    const cached = await store.get(TOKEN_KEY, { type: "json" });

    if (!cached?.token) {
        throw new Error(
            "Guesty token not found. Run refresh-guesty-token first."
        );
    }

    if (cached.expiresAt < Date.now()) {
        throw new Error(
            "Guesty token expired. Wait for scheduled refresh."
        );
    }

    return cached.token;
};

/* =========================
   Global Rate Limiter
========================= */
const runWithGuestyLimit = async (fn) => {
    const { NETLIFY_SITE_ID, NETLIFY_BLOBS_TOKEN } = process.env;

    const store = getStore({
        name: RATE_STORE,
        siteID: NETLIFY_SITE_ID,
        token: NETLIFY_BLOBS_TOKEN,
    });

    while (true) {
        const now = Date.now();
        const last = await store.get(RATE_KEY, { type: "json" });

        if (!last || now - last >= MIN_INTERVAL_MS) {
            await store.setJSON(RATE_KEY, now);
            break;
        }

        await sleep(50);
    }

    return fn();
};

/* =========================
   Netlify Function Handler
========================= */
export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, {});
    }

    try {
        const token = await getGuestyToken();

        const params = new URLSearchParams({
            limit: "10",
            fields: "id,title,status",
            ...(event.queryStringParameters || {}),
        });

        const url = `${GUESTY_LISTINGS_URL}?${params.toString()}`;

        const response = await runWithGuestyLimit(() =>
            fetchWithTimeout(url, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            })
        );

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();

        return jsonResponse(
            200,
            data,
            { "X-Guesty-Token-Cache": "blob" }
        );
    } catch (err) {
        return jsonResponse(500, {
            message: "Failed to fetch Guesty listings",
            error: err.message,
        });
    }
}
