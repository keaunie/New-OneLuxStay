import fetch from "node-fetch";
import { getStore } from "@netlify/blobs";

const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";
const TOKEN_STORE_NAME = "guesty-oauth";
const TOKEN_KEY = "access-token";

export async function handler() {
    try {
        const {
            GUESTY_OPEN_API_CLIENT_ID,
            GUESTY_OPEN_API_CLIENT_SECRET,
            NETLIFY_SITE_ID,
            NETLIFY_BLOBS_TOKEN,
        } = process.env;

        if (
            !GUESTY_OPEN_API_CLIENT_ID ||
            !GUESTY_OPEN_API_CLIENT_SECRET ||
            !NETLIFY_SITE_ID ||
            !NETLIFY_BLOBS_TOKEN
        ) {
            throw new Error("Missing required environment variables");
        }

        const body = new URLSearchParams({
            grant_type: "client_credentials",
            scope: "open-api",
            client_id: GUESTY_OPEN_API_CLIENT_ID,
            client_secret: GUESTY_OPEN_API_CLIENT_SECRET,
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
            expiresAt: Date.now() + data.expires_in * 1000, // ~24h
        };

        const store = getStore({
            name: TOKEN_STORE_NAME,
            siteID: NETLIFY_SITE_ID,
            token: NETLIFY_BLOBS_TOKEN,
        });

        await store.setJSON(TOKEN_KEY, tokenData);

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Guesty token refreshed",
                expiresAt: new Date(tokenData.expiresAt).toISOString(),
            }),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: "Failed to refresh Guesty token",
                error: err.message,
            }),
        };
    }
}
