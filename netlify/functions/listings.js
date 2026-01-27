import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

/* =========================
   GLOBAL RATE LIMIT (SAFE)
========================= */
const RATE_STORE = "guesty-rate";
const RATE_KEY = "last-call";
const MIN_INTERVAL_MS = 120; // ~8 req/sec GLOBAL

/* =========================
   Config
========================= */
const GUESTY_ME_URL = "https://open-api.guesty.com/v1/me";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

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
   PART 3 — READ-ONLY TOKEN
   (NO OAUTH, NO REFRESH)
========================= */
const getGuestyToken = async () => {
    const store = getStore(TOKEN_STORE_NAME);
    const cached = await store.get(TOKEN_KEY, { type: "json" });

    if (!cached?.token) {
        throw new Error(
            "Guesty token not found in Blob. Run scheduled refresh function."
        );
    }

    if (cached.expiresAt && cached.expiresAt < Date.now()) {
        throw new Error(
            "Guesty token expired. Wait for scheduled refresh."
        );
    }

    return { token: cached.token, source: "blob" };
};

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

        const response = await runWithGuestyLimit(() =>
            fetchWithTimeout(GUESTY_ME_URL, {
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
            { ...data, tokenSource },
            { "X-Guesty-Token-Cache": tokenSource }
        );
    } catch (err) {
        return jsonResponse(
            500,
            {
                message: "Failed to call Guesty API",
                error: err.message,
                tokenSource,
            },
            { "X-Guesty-Token-Cache": tokenSource }
        );
    }
}
