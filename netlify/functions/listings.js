const GUESTY_LISTINGS_URL = "https://open-api.guesty.com/v1/listings";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

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

const getBlobStore = async () => {
    try {
        const { getStore } = await import("@netlify/blobs");
        const siteID = process.env.NETLIFY_SITE_ID;
        const apiToken = process.env.NETLIFY_API_TOKEN;
        return siteID && apiToken
            ? getStore(TOKEN_STORE_NAME, { siteID, token: apiToken })
            : getStore(TOKEN_STORE_NAME);
    } catch {
        return null;
    }
};

const getGuestyToken = async () => {
    const now = Date.now();
    if (globalThis.GUESTY_TOKEN && globalThis.GUESTY_TOKEN_EXPIRES > now + 60_000) {
        return { token: globalThis.GUESTY_TOKEN, source: "memory" };
    }

    const store = await getBlobStore();
    if (store) {
        let cached = await store.get(TOKEN_KEY, { type: "json" });
        if (!cached) {
            const raw = await store.get(TOKEN_KEY, { type: "text" });
            cached = raw ? JSON.parse(raw) : null;
        }
        if (cached && cached.token && cached.expiresAt > now + 60_000) {
            globalThis.GUESTY_TOKEN = cached.token;
            globalThis.GUESTY_TOKEN_EXPIRES = cached.expiresAt;
            return { token: cached.token, source: "blob" };
        }
    }

    throw new Error("Guesty token missing or expired. Refresh token first.");
};

export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, {});
    }

    try {
        const { token, source: tokenSource } = await getGuestyToken();

        const params = new URLSearchParams({
            limit: "170",
            fields:
                "_id id title nickname type unitTypeId address address.full address.city address.country terms prices picture pictures accommodates bedrooms bathrooms propertyType timezone tags accountId",
            active: "true",
            listed: "true",
            pmsActive: "true",
            ...(event.queryStringParameters || {}),
        });

        const response = await fetch(
            `${GUESTY_LISTINGS_URL}?${params.toString()}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            }
        );

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();

        return jsonResponse(
            200,
            { ...data, tokenSource: tokenSource || "unknown" },
            { "X-Guesty-Token-Cache": tokenSource || "unknown" }
        );
    } catch (err) {
        return jsonResponse(
            500,
            {
                message: "Failed to fetch Guesty listings",
                error: err.message,
                tokenSource: null,
            },
            { "X-Guesty-Token-Cache": "unknown" }
        );
    }
}
