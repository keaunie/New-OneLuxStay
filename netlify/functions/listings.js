import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

/* =========================
   Config
========================= */
const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";
const GUESTY_LISTINGS_URL = "https://open-api.guesty.com/v1/listings";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

let inMemoryRefreshLock = false;
let waiters = [];
let inMemoryToken = null;
let inMemoryTokenExpiresAt = 0;

/* =========================
   Helpers
========================= */
const jsonResponse = (statusCode, body) => ({
    statusCode,
    headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
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
        return inMemoryToken;
    }

    // 🔹 Check shared token
    let store = null;
    let cached = null;
    try {
        const siteID = process.env.NETLIFY_SITE_ID;
        const token = process.env.NETLIFY_API_TOKEN;
        store = siteID && token
            ? getStore(TOKEN_STORE_NAME, { siteID, token })
            : getStore(TOKEN_STORE_NAME);
        cached = await store.get(TOKEN_KEY, { type: "json" });
    } catch {
        store = null;
    }

    if (cached && cached.expiresAt > now + 5 * 60_000) {
        inMemoryToken = cached.token;
        inMemoryTokenExpiresAt = cached.expiresAt;
        return cached.token;
    }

    // 🔹 Prevent token stampede
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

        return tokenData.token;
    } catch (err) {
        waiters.forEach(w => w.reject(err));
        waiters = [];
        throw err;
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

    try {
        const token = await getGuestyToken();

        const params = new URLSearchParams(event.queryStringParameters || {});
        const url = `${GUESTY_LISTINGS_URL}?${params.toString()}`;

        const response = await fetchWithTimeout(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();
        return jsonResponse(200, data);
    } catch (err) {
        return jsonResponse(500, {
            message: "Failed to fetch Guesty listings",
            error: err.message,
        });
    }
}
