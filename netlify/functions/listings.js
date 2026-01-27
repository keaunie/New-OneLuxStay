import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

/* =========================
   Guesty Rate Queue
========================= */
const MAX_CONCURRENT = 6; // ⬅️ IMPORTANT: must be <= 15/sec
let activeRequests = 0;
const queue = [];

const runWithGuestyLimit = async (fn) => {
    if (activeRequests >= MAX_CONCURRENT) {
        await new Promise(resolve => queue.push(resolve));
    }

    activeRequests++;

    try {
        return await fn();
    } finally {
        activeRequests--;
        if (queue.length > 0) {
            queue.shift()();
        }
    }
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/* =========================
   Config
========================= */
const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";
const GUESTY_LISTINGS_URL = "https://open-api.guesty.com/v1/listings";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

/* =========================
   In-memory token cache
========================= */
let inMemoryRefreshLock = false;
let waiters = [];
let inMemoryToken = null;
let inMemoryTokenExpiresAt = 0;

/* =========================
   Helpers
========================= */
const jsonResponse = (statusCode, body, extraHeaders = {}) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        ...extraHeaders,
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
   Guesty OAuth
========================= */
const requestGuestyToken = async () => {
    const clientId = process.env.GUESTY_OPEN_API_CLIENT_ID;
    const clientSecret = process.env.GUESTY_OPEN_API_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error("Missing Guesty API credentials");
    }

    const body = new URLSearchParams({
        grant_type: "client_credentials",
        scope: "open-api",
        client_id: clientId,
        client_secret: clientSecret,
    });

    const response = await fetchWithTimeout(GUESTY_TOKEN_URL, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    });

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return response.json();
};

const getGuestyToken = async () => {
    const now = Date.now();

    if (inMemoryToken && inMemoryTokenExpiresAt > now + 5 * 60_000) {
        return { token: inMemoryToken, source: "memory" };
    }

    let store;
    let cached;

    try {
        store = getStore(TOKEN_STORE_NAME);
        cached = await store.get(TOKEN_KEY, { type: "json" });
    } catch { }

    if (cached && cached.expiresAt > now + 5 * 60_000) {
        inMemoryToken = cached.token;
        inMemoryTokenExpiresAt = cached.expiresAt;
        return { token: cached.token, source: "blob" };
    }

    if (inMemoryRefreshLock) {
        return new Promise((resolve, reject) => {
            waiters.push({ resolve, reject });
        });
    }

    inMemoryRefreshLock = true;

    try {
        const data = await requestGuestyToken();

        const tokenData = {
            token: data.access_token,
            expiresAt: now + data.expires_in * 1000,
        };

        if (store) {
            await store.setJSON(TOKEN_KEY, tokenData);
        }

        inMemoryToken = tokenData.token;
        inMemoryTokenExpiresAt = tokenData.expiresAt;

        waiters.forEach(w => w.resolve(tokenData.token));
        waiters = [];

        return { token: tokenData.token, source: "fresh" };
    } finally {
        inMemoryRefreshLock = false;
    }
};

/* =========================
   Netlify Function Handler
========================= */
export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, {});
    }

    let tokenSource = null;
    try {
        const { token, source } = await getGuestyToken();
        tokenSource = source;
        const params = new URLSearchParams(event.queryStringParameters || {});
        const url = `${GUESTY_LISTINGS_URL}?${params.toString()}`;

        let response;

        for (let attempt = 0; attempt < 3; attempt++) {
            response = await runWithGuestyLimit(() =>
                fetchWithTimeout(url, {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                    },
                })
            );

            if (response.status !== 429) break;

            const retryAfter =
                Number(response.headers.get("retry-after")) || 1;

            console.warn(
                `[Guesty] 429 received — retrying after ${retryAfter}s`
            );

            await sleep(retryAfter * 1000);
        }

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();

        return jsonResponse(
            200,
            { ...data, tokenSource: source },
            { "X-Guesty-Token-Cache": source }
        );

    } catch (err) {
        return jsonResponse(
            500,
            {
                message: "Failed to fetch Guesty listings",
                error: err.message,
                tokenSource,
            },
            { "X-Guesty-Token-Cache": tokenSource || "unknown" }
        );
    }
}
