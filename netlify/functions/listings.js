import { getGuestyOpenApiCredentials } from "./_shared/guestyEnv.js";
import { isSupabaseEnforced, supabaseRestRequest } from "./_shared/supabaseClient.js";
import {
    fetchListingsFromSupabase,
    isSupabaseListingsEnabled,
} from "./_shared/supabaseListingsService.js";
import { resolveSecurityDeposit } from "./_shared/securityDepositService.js";
import { HIDDEN_UNIT_IDS, isHiddenUnit } from "../../src/config/hiddenUnits.js";

const OPEN_API_HOST = process.env.GUESTY_OPEN_API_HOST || "https://open-api.guesty.com";
const GUESTY_LISTINGS_URL = `${OPEN_API_HOST}/v1/listings`;
const TOKEN_STORE_NAME = process.env.GUESTY_TOKEN_BLOB_STORE || "guesty-oauth";
const TOKEN_KEY = process.env.GUESTY_TOKEN_BLOB_KEY || "access-token";
const TOKEN_REFRESH_BUFFER_MS = Number(process.env.GUESTY_TOKEN_REFRESH_BUFFER_MS || 60_000);
const GUESTY_TOKEN_TIMEOUT_MS = Number(process.env.GUESTY_TOKEN_TIMEOUT_MS || 12_000);
const GUESTY_LISTINGS_TIMEOUT_MS = Number(process.env.GUESTY_LISTINGS_TIMEOUT_MS || 12_000);
const GUESTY_LISTING_BY_ID_TIMEOUT_MS = Number(process.env.GUESTY_LISTING_BY_ID_TIMEOUT_MS || 8_000);
const SUPABASE_LISTINGS_TIMEOUT_MS = Number(process.env.SUPABASE_LISTINGS_TIMEOUT_MS || 8_000);

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

const fetchWithTimeout = async (url, options = {}, timeout = 20_000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
};

const requestGuestyToken = async () => {
    const { clientId, clientSecret } = getGuestyOpenApiCredentials();

    if (!clientId || !clientSecret) {
        throw new Error("Missing Guesty API credentials");
    }

    const body = new URLSearchParams({
        grant_type: "client_credentials",
        scope: "open-api",
        client_id: clientId,
        client_secret: clientSecret,
    });

    const response = await fetchWithTimeout(`${OPEN_API_HOST}/oauth2/token`, {
        method: "POST",
        headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
    }, GUESTY_TOKEN_TIMEOUT_MS);

    const text = await response.text();
    if (!response.ok) {
        throw new Error(`Token request failed (${response.status}): ${text}`);
    }

    return text ? JSON.parse(text) : {};
};

let tokenRefreshPromise = null;

const getGuestyToken = async () => {
    const now = Date.now();
    if (globalThis.GUESTY_TOKEN && globalThis.GUESTY_TOKEN_EXPIRES > now + TOKEN_REFRESH_BUFFER_MS) {
        return { token: globalThis.GUESTY_TOKEN, source: "memory" };
    }

    const store = await getBlobStore();
    if (store) {
        let cached = await store.get(TOKEN_KEY, { type: "json" });
        if (!cached) {
            const raw = await store.get(TOKEN_KEY, { type: "text" });
            cached = raw ? JSON.parse(raw) : null;
        }
        const cachedToken = cached?.token || cached?.access_token || cached?.accessToken;
        const cachedExpiry = Number(cached?.expiresAt ?? cached?.expires_at ?? 0);
        if (cachedToken && cachedExpiry > now + TOKEN_REFRESH_BUFFER_MS) {
            globalThis.GUESTY_TOKEN = cachedToken;
            globalThis.GUESTY_TOKEN_EXPIRES = cachedExpiry;
            return { token: cachedToken, source: "blob" };
        }
    }

    if (!tokenRefreshPromise) {
        tokenRefreshPromise = (async () => {
            const tokenPayload = await requestGuestyToken();
            const refreshedAt = Date.now();
            const tokenData = {
                token: tokenPayload.access_token,
                expiresAt: refreshedAt + Number(tokenPayload.expires_in || 0) * 1000,
            };

            if (!tokenData.token) {
                throw new Error("Token response missing access_token");
            }

            if (store) {
                await store.setJSON(TOKEN_KEY, tokenData);
            }

            globalThis.GUESTY_TOKEN = tokenData.token;
            globalThis.GUESTY_TOKEN_EXPIRES = tokenData.expiresAt;
            return tokenData;
        })().finally(() => {
            tokenRefreshPromise = null;
        });
    }

    const tokenData = await tokenRefreshPromise;
    return { token: tokenData.token, source: "fresh" };
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
    "_id id title nickname type unitTypeId address address.full address.city address.country terms prices prices.currency prices.securityDepositFee prices.securityDeposit prices.deposit picture pictures accommodates bedrooms bathrooms beds bedType propertyType timezone tags amenities publicDescription accountId active pmsActive listed";

const toNumericValue = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
};

const withTimeout = async (promise, timeoutMs, label) => {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeoutId);
    }
};

const normalizeListing = (listing) => {
    if (!listing) return null;
    const bedDetails = extractBedDetails(listing);
    const bedType = listing.bedType || bedDetails[0] || null;
    const securityDeposit = [
        listing?.securityDeposit,
        listing?.security_deposit,
        listing?.prices?.securityDepositFee,
        listing?.prices?.securityDeposit,
        listing?.prices?.deposit,
        listing?.terms?.securityDeposit,
        listing?.terms?.deposit,
    ]
        .map((value) => toNumericValue(value))
        .find((value) => value !== null);

    const securityDepositCurrency =
        listing?.prices?.currency ||
        listing?.currency ||
        null;

    return {
        ...listing,
        bedType,
        bedDetails,
        ...(securityDeposit !== undefined ? { securityDeposit } : {}),
        ...(securityDepositCurrency ? { securityDepositCurrency } : {}),
    };
};

const getListingId = (listing) =>
    listing?._id || listing?.id || listing?.unitTypeId || null;

const enrichListingWithSecurityDeposit = async (listing) => {
    if (!listing || typeof listing !== "object") return listing;

    const resolved = await resolveSecurityDeposit({
        listingId: getListingId(listing),
        country: listing?.address?.country || listing?.country,
        bedrooms: listing?.bedrooms,
        currency: listing?.securityDepositCurrency || listing?.prices?.currency || listing?.currency,
        allowListingLookup: false,
    });

    if (!resolved || !(Number(resolved.amount) > 0)) {
        return listing;
    }

    return {
        ...listing,
        securityDeposit: Number(resolved.amount),
        securityDepositCurrency: resolved.currency || listing?.securityDepositCurrency || listing?.currency || "USD",
        securityDepositSource: resolved.source || "supabase_security_deposits",
    };
};

const enrichListingsWithSecurityDeposits = async (listings = []) => {
    const rows = await applyR2ImageFallbacks(Array.isArray(listings) ? listings : []);
    if (!rows.length) return rows;
    return Promise.all(
        rows.map((listing) => enrichListingWithSecurityDeposit(listing))
    );
};

const getUsableImageUrls = (listing = {}) => {
    const values = [
        listing?.picture?.original,
        listing?.picture?.large,
        listing?.picture?.thumbnail,
        typeof listing?.picture === "string" ? listing.picture : "",
        ...(Array.isArray(listing?.pictures)
            ? listing.pictures.flatMap((item) => typeof item === "string"
                ? [item]
                : [item?.original, item?.large, item?.regular, item?.thumbnail])
            : []),
    ];
    return values.map((value) => String(value || "").trim()).filter((value) => /^https?:\/\//i.test(value));
};

const sortFallbackImages = (images = []) => [...images].sort((a, b) => {
    if (Boolean(a?.is_primary) !== Boolean(b?.is_primary)) return a?.is_primary ? -1 : 1;
    return (Number(a?.sort_order) || 0) - (Number(b?.sort_order) || 0);
});

const loadR2FallbackImageMap = async () => {
    const selectCandidates = [
        "id,guesty_id,guesty_listing_id,property_images(url,is_primary,sort_order)",
        "id,guesty_id,property_images(url,is_primary,sort_order)",
        "id,guesty_listing_id,property_images(url,is_primary,sort_order)",
    ];
    let lastError = null;
    for (const select of selectCandidates) {
        try {
            const properties = await supabaseRestRequest("properties", {
                query: { select, limit: "1000" },
            });
            const map = new Map();
            (Array.isArray(properties) ? properties : []).forEach((property) => {
                const images = sortFallbackImages(property?.property_images)
                    .map((image) => String(image?.url || "").trim())
                    .filter((url) => /^https?:\/\//i.test(url));
                if (!images.length) return;
                [property?.guesty_id, property?.guesty_listing_id]
                    .map((id) => String(id || "").trim())
                    .filter(Boolean)
                    .forEach((id) => map.set(id, images));
            });
            return map;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error("Unable to load R2 property image fallbacks.");
};

async function applyR2ImageFallbacks(listings = []) {
    const rows = Array.isArray(listings) ? listings : [];
    const needsFallback = rows.some((listing) => !getUsableImageUrls(listing).length);
    if (!needsFallback) return rows;
    try {
        const imageMap = await loadR2FallbackImageMap();
        return rows.map((listing) => {
            if (getUsableImageUrls(listing).length) return listing;
            const listingId = String(getListingId(listing) || "").trim();
            const urls = imageMap.get(listingId) || [];
            if (!urls.length) return listing;
            const pictures = urls.map((url) => ({ original: url }));
            return { ...listing, picture: pictures[0], pictures, imageSource: "r2_fallback" };
        });
    } catch (error) {
        console.warn("R2 image fallback lookup failed; keeping Guesty listing data", {
            error: error?.message || String(error),
        });
        return rows;
    }
}

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

const INTERNAL_QUERY_PARAM_KEYS = new Set([
    "includeIds",
    "forceIds",
    "onlyIds",
    "idsOnly",
]);

const sanitizeGuestyQuery = (queryParams = {}) => {
    const sanitized = {};
    Object.entries(queryParams || {}).forEach(([key, value]) => {
        if (INTERNAL_QUERY_PARAM_KEYS.has(key)) return;
        if (value === undefined || value === null || value === "") return;
        sanitized[key] = value;
    });
    return sanitized;
};

const getHiddenConfig = () => {
    const hiddenIds = new Set([
        ...parseIdList(process.env.GUESTY_HIDDEN_LISTING_IDS),
        ...parseIdList(process.env.HIDDEN_LISTING_IDS),
        ...parseIdList(process.env.VITE_HIDDEN_LISTING_IDS),
        ...HIDDEN_UNIT_IDS,
    ]);
    const hiddenTitleTerms = parseTextList(
        process.env.GUESTY_HIDDEN_LISTING_TITLES ||
        process.env.HIDDEN_LISTING_TITLES ||
        process.env.VITE_HIDDEN_LISTING_TITLES
    );
    return { hiddenIds, hiddenTitleTerms };
};

const isHiddenListing = (listing, hiddenIds, hiddenTitleTerms) => {
    if (isHiddenUnit(listing)) return true;
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
        const res = await fetchWithTimeout(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
        }, GUESTY_LISTINGS_TIMEOUT_MS);
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
        const single = await fetchWithTimeout(byIdUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: "application/json",
            },
        }, GUESTY_LISTING_BY_ID_TIMEOUT_MS)
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
                if (!data) return null;
                if (Array.isArray(data?.results)) return data.results;
                if (Array.isArray(data?.data)) return data.data;
                if (data?.data) return [data.data];
                if (data?.result) return [data.result];
                return Array.isArray(data) ? data : [data];
            })
            .catch(() => null);
        if (Array.isArray(single) && single.length) {
            fallbackResults.push(...single);
        }
    }
    return fallbackResults;
};

const buildSupabaseListingResponse = async (rawQueryParams = {}) => {
    const forceIdsEnv = parseIdList(
        process.env.GUESTY_EXTRA_LISTING_IDS || process.env.FORCE_LISTING_IDS
    );
    const forceIdsQuery = parseIdList(rawQueryParams.includeIds || rawQueryParams.forceIds);
    const forcedIds = [...new Set([...forceIdsEnv, ...forceIdsQuery])];
    const onlyIdsEnv = parseIdList(
        process.env.GUESTY_ONLY_LISTING_IDS || process.env.ONLY_LISTING_IDS
    );
    const onlyIdsQuery = parseIdList(rawQueryParams.onlyIds || rawQueryParams.idsOnly);
    const onlyIds = [...new Set([...onlyIdsEnv, ...onlyIdsQuery])];
    const { hiddenIds, hiddenTitleTerms } = getHiddenConfig();

    const basePayload = await fetchListingsFromSupabase({ queryParams: rawQueryParams });
    let enrichedResults = (Array.isArray(basePayload?.results) ? basePayload.results : [])
        .map((listing) => normalizeListing(listing))
        .filter((listing) => isActiveAndPmsActive(listing))
        .filter((listing) => !isHiddenListing(listing, hiddenIds, hiddenTitleTerms))
        .filter(Boolean);

    if (onlyIds.length) {
        const onlyIdsSet = new Set(onlyIds.map((id) => String(id)));
        const onlyIdMap = new Map();
        enrichedResults.forEach((listing) => {
            const id = String(getListingId(listing) || "");
            if (!id || !onlyIdsSet.has(id) || onlyIdMap.has(id)) return;
            onlyIdMap.set(id, listing);
        });

        const missingOnlyIds = onlyIds.filter((id) => !onlyIdMap.has(String(id)));
        if (missingOnlyIds.length) {
            const scopedPayload = await fetchListingsFromSupabase({
                queryParams: {
                    ...rawQueryParams,
                    onlyIds: missingOnlyIds.join(","),
                    includeIds: "",
                },
            });
            (Array.isArray(scopedPayload?.results) ? scopedPayload.results : [])
                .map((listing) => normalizeListing(listing))
                .filter((listing) => isActiveAndPmsActive(listing))
                .filter((listing) => !isHiddenListing(listing, hiddenIds, hiddenTitleTerms))
                .filter(Boolean)
                .forEach((listing) => {
                    const id = String(getListingId(listing) || "");
                    if (!id || !onlyIdsSet.has(id) || onlyIdMap.has(id)) return;
                    onlyIdMap.set(id, listing);
                });
        }

        const missingAfterSupabase = onlyIds.filter((id) => !onlyIdMap.has(String(id)));
        if (missingAfterSupabase.length) {
            try {
                const { token } = await getGuestyToken();
                const guestyResults = await fetchListingsByIds(missingAfterSupabase, token);
                guestyResults
                    .map((listing) => normalizeListing(listing))
                    .filter((listing) => isActiveAndPmsActive(listing))
                    .filter((listing) => !isHiddenListing(listing, hiddenIds, hiddenTitleTerms))
                    .filter(Boolean)
                    .forEach((listing) => {
                        const id = String(getListingId(listing) || "");
                        if (!id || !onlyIdsSet.has(id) || onlyIdMap.has(id)) return;
                        onlyIdMap.set(id, listing);
                    });
            } catch (error) {
                console.warn("Supabase onlyIds fallback to Guesty failed", {
                    error: error?.message || String(error),
                    missingOnlyIds: missingAfterSupabase,
                });
            }
        }

        let orderedResults = onlyIds.map((id) => onlyIdMap.get(String(id))).filter(Boolean);
        orderedResults = await enrichListingsWithSecurityDeposits(orderedResults);
        return {
            results: orderedResults,
            count: orderedResults.length,
            tokenSource: "supabase",
            dataSource: "supabase",
        };
    }

    if (forcedIds.length) {
        const existingIds = new Set(enrichedResults.map(getListingId).filter(Boolean).map(String));
        const missingIds = forcedIds.filter((id) => !existingIds.has(String(id)));
        if (missingIds.length) {
            const forcedPayload = await fetchListingsFromSupabase({
                queryParams: {
                    ...rawQueryParams,
                    includeIds: missingIds.join(","),
                },
            });
            (Array.isArray(forcedPayload?.results) ? forcedPayload.results : [])
                .map((listing) => normalizeListing(listing))
                .filter((listing) => isActiveAndPmsActive(listing))
                .filter((listing) => !isHiddenListing(listing, hiddenIds, hiddenTitleTerms))
                .filter(Boolean)
                .forEach((listing) => {
                    const listingId = String(getListingId(listing) || "");
                    if (!listingId || existingIds.has(listingId)) return;
                    existingIds.add(listingId);
                    enrichedResults.push(listing);
                });
        }
    }

    enrichedResults = await enrichListingsWithSecurityDeposits(enrichedResults);

    return {
        ...basePayload,
        results: enrichedResults,
        count: enrichedResults.length,
        tokenSource: "supabase",
        dataSource: "supabase",
    };
};

export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return jsonResponse(200, {});
    }

    try {
        const rawQueryParams = event.queryStringParameters || {};

        if (isSupabaseListingsEnabled()) {
            try {
                const payload = await withTimeout(
                    buildSupabaseListingResponse(rawQueryParams),
                    SUPABASE_LISTINGS_TIMEOUT_MS,
                    "Supabase listings"
                );
                return jsonResponse(200, payload, {
                    "X-Guesty-Token-Cache": "supabase",
                    "X-Data-Provider": "supabase",
                });
            } catch (error) {
                if (isSupabaseEnforced()) throw error;
                console.warn("Supabase listings lookup failed, falling back to Guesty", {
                    error: error?.message || String(error),
                });
            }
        }

        const { token, source: tokenSource } = await getGuestyToken();

        const forceIdsEnv = parseIdList(
            process.env.GUESTY_EXTRA_LISTING_IDS || process.env.FORCE_LISTING_IDS
        );
        const forceIdsQuery = parseIdList(rawQueryParams.includeIds || rawQueryParams.forceIds);
        const forcedIds = [...new Set([...forceIdsEnv, ...forceIdsQuery])];
        const onlyIdsEnv = parseIdList(
            process.env.GUESTY_ONLY_LISTING_IDS || process.env.ONLY_LISTING_IDS
        );
        const onlyIdsQuery = parseIdList(rawQueryParams.onlyIds || rawQueryParams.idsOnly);
        const onlyIds = [...new Set([...onlyIdsEnv, ...onlyIdsQuery])];
        const { hiddenIds, hiddenTitleTerms } = getHiddenConfig();
        const tokenCacheHeader = { "X-Guesty-Token-Cache": tokenSource || "unknown" };

        if (onlyIds.length) {
            const onlyIdsSet = new Set(onlyIds.map((id) => String(id)));
            const onlyIdMap = new Map();
            const scopedResults = await fetchListingsByIds(onlyIds, token);
            scopedResults
                .map((listing) => normalizeListing(listing))
                .filter((listing) => isActiveAndPmsActive(listing))
                .filter((listing) => !isHiddenListing(listing, hiddenIds, hiddenTitleTerms))
                .filter(Boolean)
                .forEach((listing) => {
                    const id = String(getListingId(listing) || "");
                    if (!id || !onlyIdsSet.has(id) || onlyIdMap.has(id)) return;
                    onlyIdMap.set(id, listing);
                });

            let orderedResults = onlyIds.map((id) => onlyIdMap.get(String(id))).filter(Boolean);
            orderedResults = await enrichListingsWithSecurityDeposits(orderedResults);
            return jsonResponse(
                200,
                {
                    results: orderedResults,
                    count: orderedResults.length,
                    tokenSource: tokenSource || "unknown",
                },
                tokenCacheHeader
            );
        }

        const forwardedQueryParams = sanitizeGuestyQuery(rawQueryParams);

        const params = new URLSearchParams({
            limit: "200",
            fields: LISTING_FIELDS,
            ...forwardedQueryParams,
        });
        // Always enforce active + pmsActive on this endpoint.
        params.set("listed", "true");
        params.set("pmsActive", "true");
        params.set("active", "true");

        const response = await fetchWithTimeout(
            `${GUESTY_LISTINGS_URL}?${params.toString()}`,
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: "application/json",
                },
            },
            GUESTY_LISTINGS_TIMEOUT_MS
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
                ...forwardedQueryParams,
            });
            // Keep listed filter but relax active/pmsActive at query level and filter in-process instead.
            relaxedParams.set("listed", "true");
            relaxedParams.delete("active");
            relaxedParams.delete("pmsActive");

            const relaxedResponse = await fetchWithTimeout(
                `${GUESTY_LISTINGS_URL}?${relaxedParams.toString()}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: "application/json",
                    },
                },
                GUESTY_LISTINGS_TIMEOUT_MS
            );
            if (relaxedResponse.ok) {
                const relaxedData = await relaxedResponse.json();
                const relaxedResults = Array.isArray(relaxedData?.results) ? relaxedData.results : [];
                if (relaxedResults.length) {
                    baseResults = relaxedResults;
                }
            }
        }

        let enrichedResults = baseResults
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

        enrichedResults = await enrichListingsWithSecurityDeposits(enrichedResults);

        return jsonResponse(
            200,
            { ...data, results: enrichedResults, tokenSource: tokenSource || "unknown" },
            tokenCacheHeader
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
