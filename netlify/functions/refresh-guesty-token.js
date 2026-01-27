import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

/* =========================
   Blob helper (REQUIRED)
========================= */
const getBlobStore = () => {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN;

    if (!siteID || !token) {
        throw new Error("Missing NETLIFY_SITE_ID or NETLIFY_API_TOKEN");
    }

    return getStore(TOKEN_STORE_NAME, { siteID, token });
};

export async function handler() {
    try {
        const clientId = process.env.GUESTY_OPEN_API_CLIENT_ID;
        const clientSecret = process.env.GUESTY_OPEN_API_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            throw new Error("Missing Guesty credentials");
        }

        const body = new URLSearchParams({
            grant_type: "client_credentials",
            scope: "open-api",
            client_id: clientId,
            client_secret: clientSecret,
        });

        const response = await fetch(GUESTY_TOKEN_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Accept: "application/json",
            },
            body: body.toString(),
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(JSON.stringify(data));
        }

        const tokenData = {
            token: data.access_token,
            expiresAt: Date.now() + data.expires_in * 1000, // ~24 hours
        };

        const store = getBlobStore();
        await store.setJSON(TOKEN_KEY, tokenData);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Guesty token refreshed",
                expiresAt: new Date(tokenData.expiresAt).toISOString(),
            }),
        };
    } catch (err) {
        console.error("[refresh-guesty-token] ERROR:", err);

        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Failed to refresh Guesty token",
                error: err.message,
            }),
        };
    }
}
