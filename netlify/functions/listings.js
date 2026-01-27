const GUESTY_LISTINGS_URL = "https://open-api.guesty.com/v1/listings";

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

export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, {});
    }

    try {
        if (
            !globalThis.GUESTY_TOKEN ||
            !globalThis.GUESTY_TOKEN_EXPIRES ||
            globalThis.GUESTY_TOKEN_EXPIRES < Date.now()
        ) {
            throw new Error(
                "Guesty token missing or expired. Wait for scheduled refresh."
            );
        }

        const params = new URLSearchParams({
            limit: "10",
            fields: "id,title,status",
            ...(event.queryStringParameters || {}),
        });

        const response = await fetch(
            `${GUESTY_LISTINGS_URL}?${params.toString()}`,
            {
                headers: {
                    Authorization: `Bearer ${globalThis.GUESTY_TOKEN}`,
                    Accept: "application/json",
                },
            }
        );

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const data = await response.json();

        return jsonResponse(200, {
            ...data,
            tokenSource: "memory",
        });
    } catch (err) {
        return jsonResponse(500, {
            message: "Failed to fetch Guesty listings",
            error: err.message,
        });
    }
}
