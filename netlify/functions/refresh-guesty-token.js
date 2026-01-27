const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";

globalThis.GUESTY_TOKEN = globalThis.GUESTY_TOKEN || null;
globalThis.GUESTY_TOKEN_EXPIRES = globalThis.GUESTY_TOKEN_EXPIRES || 0;

export async function handler() {
    const clientId = process.env.GUESTY_OPEN_API_CLIENT_ID;
    const clientSecret = process.env.GUESTY_OPEN_API_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        return {
            statusCode: 500,
            body: "Missing Guesty credentials",
        };
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
        return {
            statusCode: 500,
            body: JSON.stringify(data),
        };
    }

    globalThis.GUESTY_TOKEN = data.access_token;
    globalThis.GUESTY_TOKEN_EXPIRES =
        Date.now() + data.expires_in * 1000;

    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "Guesty token refreshed",
            expiresAt: new Date(globalThis.GUESTY_TOKEN_EXPIRES).toISOString(),
        }),
    };
}
