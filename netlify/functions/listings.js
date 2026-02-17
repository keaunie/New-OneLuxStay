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

const MAIDS_ROOM_REGEX = /\bmaid'?s room\b/i;

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
    const normalized = String(text || "")
        .replace(/[–—-]/g, " ")
        .replace(/\bbeds\b/gi, "bed")
        .replace(/\s+/g, " ")
        .trim();
    if (!normalized) return null;
    for (const { label, match } of BED_PATTERNS) {
        if (match.test(normalized)) return label;
    }
    return null;
};

const findBedCountInText = (text) => {
    if (!text) return 1;
    const normalized = String(text || "")
        .replace(/[–—-]/g, " ")
        .replace(/\bbeds\b/gi, "bed")
        .replace(/\s+/g, " ")
        .trim();
    const countMatch = normalized.match(/(\d+)\s*(?:x\s*)?(?:king|queen|double|full|twin|single|sofa|futon|bunk|daybed|murphy|air mattress|crib)\b/i);
    if (countMatch) {
        const count = Number(countMatch[1]);
        if (Number.isFinite(count) && count > 0) return count;
    }
    const leadingMatch = normalized.match(/^\s*-\s*(\d+)\b/);
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
            if (MAIDS_ROOM_REGEX.test(line)) {
                const bedType = findBedTypeInText(line);
                if (!bedType) return;
                const count = findBedCountInText(line);
                const label = `Maids room: ${bedType}${count > 1 ? ` x${count}` : ""}`;
                if (seen.has(label)) return;
                seen.add(label);
                details.push(label);
                return;
            }
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

const LISTING_FIELDS =
    "_id id title nickname type unitTypeId address address.full address.city address.country terms prices picture pictures accommodates bedrooms bathrooms beds bedType propertyType timezone tags amenities publicDescription accountId active pmsActive listed";

const normalizeListing = (listing) => {
    if (!listing) return null;
    const bedDetails = extractBedDetails(listing);
    const bedType = listing.bedType || bedDetails[0] || null;
    return { ...listing, bedType, bedDetails };
};

const getListingId = (listing) =>
    listing?._id || listing?.id || listing?.unitTypeId || null;

const parseBooleanFlag = (value) => {
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (!normalized) return null;
        if ([
            "true",
            "1",
            "yes",
            "active",
            "enabled",
            "listed",
            "published",
            "open",
        ].includes(normalized)) {
            return true;
        }
        if ([
            "false",
            "0",
            "no",
            "inactive",
            "disabled",
            "unlisted",
            "unpublished",
            "closed",
            "archived",
        ].includes(normalized)) {
            return false;
        }
    }
    return null;
};

const isActiveAndPmsActive = (listing) => {
    if (!listing || typeof listing !== "object") return false;
    const hasActiveProp = Object.prototype.hasOwnProperty.call(listing, "active");
    const hasPmsActiveProp = Object.prototype.hasOwnProperty.call(listing, "pmsActive");
    const hasListedProp = Object.prototype.hasOwnProperty.call(listing, "listed");

    // If the API omits these fields for a response shape, trust the upstream query filter.
    if (!hasActiveProp && !hasPmsActiveProp && !hasListedProp) return true;

    const active = hasActiveProp ? parseBooleanFlag(listing.active) : true;
    const pmsActive = hasPmsActiveProp ? parseBooleanFlag(listing.pmsActive) : true;
    const listed = hasListedProp ? parseBooleanFlag(listing.listed) : true;
    if (active === false || pmsActive === false || listed === false) return false;
    // Unknown values are treated as pass-through to avoid false negatives.
    return true;
};

const parseIdList = (value) =>
    String(value || "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

const parseTextList = (value) =>
    String(value || "")
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

const getHiddenConfig = () => {
    const hiddenIds = new Set([
        ...parseIdList(process.env.GUESTY_HIDDEN_LISTING_IDS),
        ...parseIdList(process.env.HIDDEN_LISTING_IDS),
        ...parseIdList(process.env.VITE_HIDDEN_LISTING_IDS),
    ]);
    const hiddenTitleTerms = parseTextList(
        process.env.GUESTY_HIDDEN_LISTING_TITLES ||
        process.env.HIDDEN_LISTING_TITLES ||
        process.env.VITE_HIDDEN_LISTING_TITLES
    );
    return { hiddenIds, hiddenTitleTerms };
};

const isHiddenListing = (listing, hiddenIds, hiddenTitleTerms) => {
    const id = String(getListingId(listing) || "");
    if (id && hiddenIds.has(id)) return true;
    const title = String(listing?.title || "").toLowerCase();
    const nickname = String(listing?.nickname || "").toLowerCase();
    if (!hiddenTitleTerms.length) return false;
    return hiddenTitleTerms.some((term) => title.includes(term) || nickname.includes(term));
};

const fetchListingsByIds = async (ids, token) => {
    if (!ids.length) return [];
    const uniqueIds = [...new Set(ids)];
    const queryParams = new URLSearchParams({
        ids: uniqueIds.join(","),
        fields: LISTING_FIELDS,
        listed: "true",
        pmsActive: "true",
        active: "true",
    });

    const tryFetch = async (url) => {
        const res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
        });
        if (!res.ok) return null;
        const data = await res.json();
        if (Array.isArray(data?.results)) return data.results;
        if (Array.isArray(data?.data)) return data.data;
        if (data?.data) return [data.data];
        if (data?.result) return [data.result];
        return Array.isArray(data) ? data : [data];
    };

    const byIdsUrl = `${GUESTY_LISTINGS_URL}?${queryParams.toString()}`;
    const byIdsResults = await tryFetch(byIdsUrl);
    if (Array.isArray(byIdsResults) && byIdsResults.length) {
        return byIdsResults;
    }

    const fallbackResults = [];
    for (const id of uniqueIds) {
        const byIdUrl = `${GUESTY_LISTINGS_URL}/${encodeURIComponent(id)}?fields=${encodeURIComponent(LISTING_FIELDS)}`;
        const single = await tryFetch(byIdUrl);
        if (Array.isArray(single) && single.length) {
            fallbackResults.push(...single);
        }
    }
    return fallbackResults;
};

export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, {});
    }

    try {
        const { token, source: tokenSource } = await getGuestyToken();

        const forceIdsEnv = parseIdList(
            process.env.GUESTY_EXTRA_LISTING_IDS || process.env.FORCE_LISTING_IDS
        );
        const forceIdsQuery = parseIdList(event.queryStringParameters?.includeIds || event.queryStringParameters?.forceIds);
        const forcedIds = [...new Set([...forceIdsEnv, ...forceIdsQuery])];
        const { hiddenIds, hiddenTitleTerms } = getHiddenConfig();

        const params = new URLSearchParams({
            limit: "200",
            fields: LISTING_FIELDS,
            ...(event.queryStringParameters || {}),
        });
        // Always enforce active + pmsActive on this endpoint.
        params.set("listed", "true");
        params.set("pmsActive", "true");
        params.set("active", "true");

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
        let baseResults = Array.isArray(data.results) ? data.results : [];

        // Guard against upstream odd responses where count is present but results is empty.
        if (!baseResults.length && Number(data?.count) > 0) {
            const relaxedParams = new URLSearchParams({
                limit: "200",
                fields: LISTING_FIELDS,
                ...(event.queryStringParameters || {}),
            });
            // Keep listed filter but relax active/pmsActive at query level and filter in-process instead.
            relaxedParams.set("listed", "true");
            relaxedParams.delete("active");
            relaxedParams.delete("pmsActive");

            const relaxedResponse = await fetch(
                `${GUESTY_LISTINGS_URL}?${relaxedParams.toString()}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                    },
                }
            );
            if (relaxedResponse.ok) {
                const relaxedData = await relaxedResponse.json();
                const relaxedResults = Array.isArray(relaxedData?.results) ? relaxedData.results : [];
                if (relaxedResults.length) {
                    baseResults = relaxedResults;
                }
            }
        }

        const enrichedResults = baseResults
            .map((listing) => normalizeListing(listing))
            .filter((listing) => isActiveAndPmsActive(listing))
            .filter((listing) => !isHiddenListing(listing, hiddenIds, hiddenTitleTerms))
            .filter(Boolean);

        if (forcedIds.length) {
            const existingIds = new Set(enrichedResults.map(getListingId).filter(Boolean));
            const missingIds = forcedIds.filter((id) => !existingIds.has(id));
            if (missingIds.length) {
                const forcedListings = await fetchListingsByIds(missingIds, token);
                forcedListings
                    .map((listing) => normalizeListing(listing))
                    .filter((listing) => isActiveAndPmsActive(listing))
                    .filter((listing) => !isHiddenListing(listing, hiddenIds, hiddenTitleTerms))
                    .filter(Boolean)
                    .forEach((listing) => {
                        const listingId = getListingId(listing);
                        if (!listingId || existingIds.has(listingId)) return;
                        existingIds.add(listingId);
                        enrichedResults.push(listing);
                    });
            }
        }

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
