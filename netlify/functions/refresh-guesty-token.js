import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

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

export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, {});
    }

    try {
        const clientId = process.env.GUESTY_OPEN_API_CLIENT_ID;
        const clientSecret = process.env.GUESTY_OPEN_API_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return jsonResponse(500, { error: "Missing Guesty API credentials" });
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

        const data = await response.json();

        if (!response.ok) {
            return jsonResponse(response.status, data);
        }

        const expiresAt = Date.now() + data.expires_in * 1000;
        const tokenData = { token: data.access_token, expiresAt };

        let stored = false;
        try {
            const siteID = process.env.NETLIFY_SITE_ID;
            const apiToken = process.env.NETLIFY_API_TOKEN;
            const store = siteID && apiToken
                ? getStore(TOKEN_STORE_NAME, { siteID, token: apiToken })
                : getStore(TOKEN_STORE_NAME);
            await store.setJSON(TOKEN_KEY, tokenData);
            stored = true;
        } catch {
            stored = false;
        }

        globalThis.GUESTY_TOKEN = tokenData.token;
        globalThis.GUESTY_TOKEN_EXPIRES = tokenData.expiresAt;

        return jsonResponse(200, {
            message: "Guesty token fetched successfully",
            expiresIn: data.expires_in,
            stored,
            tokenPreview: `${data.access_token.slice(0, 10)}...`,
        });
    } catch (err) {
        return jsonResponse(500, { error: err.message });
    }
}
