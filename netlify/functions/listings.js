import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

/* =========================
   GLOBAL RATE LIMIT (SAFE)
========================= */
const RATE_STORE = "guesty-rate";
const RATE_KEY = "last-call";
const MIN_INTERVAL_MS = 120; // ~8 req/sec GLOBAL (very safe)

/* =========================
   Helpers
========================= */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const runWithGuestyLimit = async (fn) => {
    const store = getStore(RATE_STORE);

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
const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";
const GUESTY_LISTINGS_URL = "https://open-api.guesty.com/v1/listings";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

let inMemoryToken = null;
let inMemoryTokenExpiresAt = 0;
let inMemoryRefreshLock = false;
let waiters = [];

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
    } catch (e) {
        console.warn("[Guesty] Blob store unavailable, using memory only");
    }

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

        await store.setJSON(TOKEN_KEY, tokenData);

        inMemoryToken = tokenData.token;
        inMemoryTokenExpiresAt = tokenData.expiresAt;

        waiters.forEach(w => w.resolve({ token: tokenData.token, source: "fresh" }));
        waiters = [];

        return { token: tokenData.token, source: "fresh" };
    } catch (err) {
        waiters.forEach(w => w.reject(err));
        waiters = [];
        throw err;
    } finally {
        inMemoryRefreshLock = false;
    }
};



console.log("ENV CHECK", {
    hasClientId: !!process.env.GUESTY_OPEN_API_CLIENT_ID,
    hasClientSecret: !!process.env.GUESTY_OPEN_API_CLIENT_SECRET,
});

/* =========================
   Netlify Function Handler
========================= */
export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, {});
    }

    let tokenSource = "unknown";

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
                Number(response.headers.get("retry-after")) || 2;

            console.warn(`[Guesty] 429 — sleeping ${retryAfter}s`);
            await sleep((retryAfter + 1) * 1000);
        }

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();

        return jsonResponse(
            200,
            { ...data, tokenSource },
            { "X-Guesty-Token-Cache": tokenSource }
        );

    } catch (err) {
        return jsonResponse(
            500,
            {
                message: "Failed to fetch Guesty listings",
                error: err.message,
                tokenSource,
            },
            { "X-Guesty-Token-Cache": tokenSource }
        );
    }
}
