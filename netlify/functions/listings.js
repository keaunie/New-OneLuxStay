import { getStore } from "@netlify/blobs";

/* =========================
   CONFIG
========================= */
const GUESTY_ME_URL = "https://open-api.guesty.com/v1/me";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

const RATE_STORE = "guesty-rate";
const RATE_KEY = "last-call";
const MIN_INTERVAL_MS = 120;

/* =========================
   Blob helper (MANDATORY)
========================= */
const getBlobStore = (name) => {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;

    if (!siteID || !token) {
        throw new Error("Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN");
    }

    return getStore(name, { siteID, token });
};

/* =========================
   Helpers
========================= */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const runWithGuestyLimit = async (fn) => {
    const store = getBlobStore(RATE_STORE);

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
   READ-ONLY TOKEN (PART 3)
========================= */
const getGuestyToken = async () => {
    const store = getBlobStore(TOKEN_STORE_NAME);
    const cached = await store.get(TOKEN_KEY, { type: "json" });

    if (!cached?.token) {
        throw new Error("Guesty token not found in Blob");
    }

    if (cached.expiresAt < Date.now()) {
        throw new Error("Guesty token expired");
    }

    return { token: cached.token, source: "blob" };
};

/* =========================
   Handler
========================= */
export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: "",
        };
    }

    try {
        const { token } = await getGuestyToken();

        const response = await runWithGuestyLimit(() =>
            fetch(GUESTY_ME_URL, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            })
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(JSON.stringify(data));
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "X-Guesty-Token-Cache": "blob",
            },
            body: JSON.stringify(data),
        };
    } catch (err) {
        console.error("Guesty ME error:", err);

        return {
            statusCode: 500,
            headers: {
                "Content-Type": "application/json",
                "X-Guesty-Token-Cache": "error",
            },
            body: JSON.stringify({
                message: "Failed to call Guesty API",
                error: err.message,
            }),
        };
    }
}
