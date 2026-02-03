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

const BED_PATTERNS = [
    { label: "Master bed", match: /\bmaster bed\b/i },
    { label: "King bed", match: /\bking(?:-?size)? bed\b/i },
    { label: "Queen bed", match: /\bqueen(?:-?size)? bed\b/i },
    { label: "Double bed", match: /\bdouble bed\b|\bfull(?:-?size)? bed\b/i },
    { label: "Twin bed", match: /\btwin bed\b/i },
    { label: "Single bed", match: /\bsingle bed\b/i },
    { label: "Sofa bed", match: /\bsofa bed\b|\bsleeper sofa\b|\bcouch bed\b|\bpull-?out sofa\b/i },
    { label: "Futon", match: /\bfuton\b/i },
    { label: "Bunk bed", match: /\bbunk bed\b/i },
    { label: "Daybed", match: /\bdaybed\b/i },
    { label: "Murphy bed", match: /\bmurphy bed\b/i },
    { label: "Air mattress", match: /\bair mattress\b/i },
    { label: "Crib", match: /\bcrib\b/i },
];

const BEDROOM_WORDS = new Map([
    ["one", 1],
    ["two", 2],
    ["three", 3],
    ["four", 4],
    ["five", 5],
    ["six", 6],
    ["seven", 7],
    ["eight", 8],
    ["nine", 9],
    ["ten", 10],
]);

const parseBedroomNumber = (text) => {
    if (!text) return null;
    const numberMatch = text.match(/\bbedroom\s*(\d+)\b/i);
    if (numberMatch) return Number(numberMatch[1]);
    const wordMatch = text.match(/\bbedroom\s*(one|two|three|four|five|six|seven|eight|nine|ten)\b/i);
    if (wordMatch) return BEDROOM_WORDS.get(wordMatch[1].toLowerCase()) || null;
    return null;
};

const findBedTypeInText = (text) => {
    if (!text) return null;
    for (const { label, match } of BED_PATTERNS) {
        if (match.test(text)) return label;
    }
    return null;
};

const findBedCountInText = (text) => {
    if (!text) return 1;
    const countMatch = text.match(/(\d+)\s*(?:x\s*)?(?:king|queen|double|full|twin|single|sofa|futon|bunk|daybed|murphy|air mattress|crib)\b/i);
    if (countMatch) {
        const count = Number(countMatch[1]);
        if (Number.isFinite(count) && count > 0) return count;
    }
    const leadingMatch = text.match(/^\s*-\s*(\d+)\b/);
    if (leadingMatch) {
        const count = Number(leadingMatch[1]);
        if (Number.isFinite(count) && count > 0) return count;
    }
    return 1;
};

const extractBedroomBedDetails = (sources) => {
    if (!sources.length) return [];
    const details = [];
    const seen = new Set();
    sources
        .flatMap((text) => String(text || "").split(/\r?\n/))
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
            const bedroom = parseBedroomNumber(line);
            if (!bedroom) return;
            const bedType = findBedTypeInText(line);
            if (!bedType) return;
            const count = findBedCountInText(line);
            const label = `Bedroom ${bedroom}: ${bedType}${count > 1 ? ` x${count}` : ""}`;
            if (seen.has(label)) return;
            seen.add(label);
            details.push(label);
        });
    return details;
};

const extractBedDetails = (listing) => {
    if (!listing) return [];
    const sources = [];
    const push = (value) => {
        if (typeof value === "string" && value.trim()) sources.push(value);
    };
    const description = listing.publicDescription;
    if (description && typeof description === "object") {
        push(description.summary);
        push(description.description);
        push(description.text);
        push(description.space);
        push(description.access);
        push(description.notes);
        push(description.neighborhood);
        push(description.transit);
        push(description.interactionWithGuests);
    }
    push(listing.description);
    push(listing.notes);
    if (Array.isArray(listing.amenities)) listing.amenities.forEach(push);
    if (Array.isArray(listing.tags)) listing.tags.forEach(push);
    const bedroomDetails = extractBedroomBedDetails(sources);
    if (bedroomDetails.length) {
        const combined = sources.join(" ");
        const extraDetails = [];
        BED_PATTERNS.forEach(({ label, match }) => {
            const countPattern = new RegExp(`(\\d+)\\s*(?:x\\s*)?${match.source}`, "i");
            const countMatch = combined.match(countPattern);
            if (countMatch) {
                extraDetails.push(`${label} x${Number(countMatch[1]) || 1}`);
                return;
            }
            if (match.test(combined)) {
                extraDetails.push(label);
            }
        });
        const extras = extraDetails.filter(
            (item) => !bedroomDetails.some((entry) => entry.includes(item.split(" x")[0]))
        );
        return [...bedroomDetails, ...extras];
    }
    const combined = sources.join(" ");
    if (!combined) return [];
    const details = [];
    BED_PATTERNS.forEach(({ label, match }) => {
        const countPattern = new RegExp(`(\\d+)\\s*(?:x\\s*)?${match.source}`, "i");
        const countMatch = combined.match(countPattern);
        if (countMatch) {
            details.push(`${label} x${Number(countMatch[1]) || 1}`);
            return;
        }
        if (match.test(combined)) {
            details.push(label);
        }
    });
    return details;
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
                "_id id title nickname type unitTypeId address address.full address.city address.country terms prices picture pictures accommodates bedrooms bathrooms beds bedType propertyType timezone tags amenities publicDescription accountId",
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
        const enrichedResults = Array.isArray(data.results)
            ? data.results.map((listing) => {
                const bedDetails = extractBedDetails(listing);
                const bedType = listing.bedType || bedDetails[0] || null;
                return { ...listing, bedType, bedDetails };
            })
            : data.results;

        return jsonResponse(
            200,
            { ...data, results: enrichedResults, tokenSource: tokenSource || "unknown" },
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
