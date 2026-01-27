import fetch from "node-fetch";

const GUESTY_TOKEN_URL = "https://open-api.guesty.com/oauth2/token";

export async function handler() {
    try {
        const clientId = process.env.GUESTY_OPEN_API_CLIENT_ID;
        const clientSecret = process.env.GUESTY_OPEN_API_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            return {
                statusCode: 500,
                body: JSON.stringify({
                    error: "Missing Guesty API credentials",
                }),
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
                statusCode: response.status,
                body: JSON.stringify(data),
            };
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: "Guesty token fetched successfully",
                expiresIn: data.expires_in,
                tokenPreview: data.access_token.slice(0, 10) + "…",
            }),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: err.message,
            }),
        };
    }
}
