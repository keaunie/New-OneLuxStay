import {
  parseEnvBoolean,
  shouldUseSupabaseProvider,
  supabaseRestRequest,
  toSupabaseInFilter,
} from "./supabaseClient.js";

const SUPABASE_LISTINGS_TABLE = process.env.SUPABASE_LISTINGS_TABLE || "listings";
const MAX_LISTINGS_LIMIT = Math.max(50, Number(process.env.SUPABASE_LISTINGS_MAX_LIMIT || 1000) || 1000);
const PROPERTIES_TABLE_NAME = "properties";

const PROPERTIES_SELECT = [
  "id",
  "guesty_id",
  "name",
  "property_code",
  "address",
  "city",
  "country",
  "latitude",
  "longitude",
  "room_type",
  "bedrooms",
  "bathrooms",
  "accommodates",
  "size_sqm",
  "has_balcony",
  "has_parking",
  "has_wifi",
  "status",
  "created_at",
  "updated_at",
  "property_images(url,is_primary,sort_order)",
  "property_amenities(amenity)",
  "property_pricing(base_price,currency,cleaning_fee,security_deposit,extra_guest_fee,created_at)",
  "property_features(key,value)",
  "property_descriptions(language,title,description)",
].join(",");

const normalizeString = (value) => String(value || "").trim();

const slugify = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const parseIdList = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const parseInteger = (value, fallback = 0) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.trunc(number));
};

const parsePositiveInteger = (value, fallback = 200) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return fallback;
  return Math.max(1, Math.trunc(number));
};

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const firstNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const readListingIds = (listing) => {
  if (!listing || typeof listing !== "object") return [];
  return [
    listing.id,
    listing._id,
    listing.unitTypeId,
    listing.listing_id,
    listing.source_property_id,
    listing.guesty_id,
  ]
    .map((value) => normalizeString(value))
    .filter(Boolean);
};

const getBooleanValue = (listing, ...keys) => {
  for (const key of keys) {
    if (!(key in (listing || {}))) continue;
    const value = listing[key];
    if (typeof value === "boolean") return value;
    const normalized = String(value || "").trim().toLowerCase();
    if (["true", "1", "yes", "on", "active", "published", "listed"].includes(normalized)) return true;
    if (["false", "0", "no", "off", "inactive", "disabled", "draft", "archived", "unlisted"].includes(normalized)) return false;
  }
  return null;
};

const getTextBlob = (listing) =>
  [
    listing?.title,
    listing?.name,
    listing?.nickname,
    listing?.city,
    listing?.city_slug,
    listing?.area,
    listing?.area_slug,
    listing?.publicDescription?.summary,
    listing?.publicDescription?.description,
    listing?.description,
    listing?.address?.full,
    listing?.address?.city,
  ]
    .map((value) => normalizeString(value).toLowerCase())
    .filter(Boolean)
    .join(" ");

const filterByBoolean = (rows, value, resolver) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return rows;
  const want = ["true", "1", "yes", "on"].includes(normalized);
  return rows.filter((row) => {
    const actual = resolver(row);
    if (actual == null) return true;
    return actual === want;
  });
};

const isPropertiesTableMode = () =>
  normalizeString(SUPABASE_LISTINGS_TABLE).toLowerCase() === PROPERTIES_TABLE_NAME;

const normalizeStatusFlag = (statusValue) => {
  const value = normalizeString(statusValue).toLowerCase();
  if (!value) return true;
  if (["active", "published", "listed", "available", "open", "live"].includes(value)) return true;
  if (["inactive", "disabled", "draft", "archived", "closed", "deleted", "unlisted"].includes(value)) return false;
  return true;
};

const sortImages = (images = []) =>
  [...images].sort((a, b) => {
    const aPrimary = a?.is_primary ? 1 : 0;
    const bPrimary = b?.is_primary ? 1 : 0;
    if (aPrimary !== bPrimary) return bPrimary - aPrimary;
    const aOrder = Number.isFinite(Number(a?.sort_order)) ? Number(a.sort_order) : 9_999;
    const bOrder = Number.isFinite(Number(b?.sort_order)) ? Number(b.sort_order) : 9_999;
    return aOrder - bOrder;
  });

const pickPrimaryDescription = (descriptions = []) => {
  if (!Array.isArray(descriptions) || !descriptions.length) return null;

  const normalized = descriptions.filter((entry) => entry && typeof entry === "object");
  if (!normalized.length) return null;

  const byLanguagePriority = ["en", "en-us", "en-gb", "english"];
  for (const language of byLanguagePriority) {
    const match = normalized.find((entry) => normalizeString(entry.language).toLowerCase() === language);
    if (match) return match;
  }

  return normalized[0] || null;
};

const pickPricingRow = (pricingRows = []) => {
  if (!Array.isArray(pricingRows) || !pricingRows.length) return null;

  return [...pricingRows].sort((a, b) => {
    const aTime = Date.parse(a?.created_at || "") || 0;
    const bTime = Date.parse(b?.created_at || "") || 0;
    return bTime - aTime;
  })[0];
};

const mapPropertyRowToListing = (property = {}) => {
  const propertyId = normalizeString(property.id);
  const guestyId = normalizeString(property.guesty_id);
  const externalId = guestyId || propertyId;
  if (!externalId) return null;

  const descriptions = Array.isArray(property.property_descriptions) ? property.property_descriptions : [];
  const selectedDescription = pickPrimaryDescription(descriptions);
  const descriptionTitle = normalizeString(selectedDescription?.title);
  const descriptionBody = normalizeString(selectedDescription?.description);

  const title =
    descriptionTitle ||
    normalizeString(property.name) ||
    normalizeString(property.property_code) ||
    `Property ${externalId}`;

  const city = normalizeString(property.city);
  const country = normalizeString(property.country);
  const streetAddress = normalizeString(property.address);
  const addressFull = [streetAddress, city, country].filter(Boolean).join(", ") || streetAddress || city || country;

  const latitude = toNumber(property.latitude);
  const longitude = toNumber(property.longitude);

  const images = sortImages(Array.isArray(property.property_images) ? property.property_images : []);
  const imageUrls = images
    .map((image) => normalizeString(image?.url))
    .filter(Boolean);
  const pictures = imageUrls.map((url) => ({ original: url }));

  const amenities = (Array.isArray(property.property_amenities) ? property.property_amenities : [])
    .map((item) => normalizeString(item?.amenity))
    .filter(Boolean);

  const features = Array.isArray(property.property_features) ? property.property_features : [];
  const featureMap = Object.fromEntries(
    features
      .map((item) => [normalizeString(item?.key), normalizeString(item?.value)])
      .filter(([key]) => Boolean(key)),
  );

  const pricingRow = pickPricingRow(property.property_pricing);
  const basePricePerNight = firstNumber(
    pricingRow?.base_price,
    property?.base_price,
    featureMap.base_price,
  );
  const cleaningFee = firstNumber(
    pricingRow?.cleaning_fee,
    featureMap.cleaning_fee,
  );
  const currency =
    normalizeString(pricingRow?.currency || property?.currency || featureMap.currency || "USD").toUpperCase() ||
    "USD";

  const activeByStatus = normalizeStatusFlag(property.status);
  const active = getBooleanValue(property, "active", "is_active") ?? activeByStatus;
  const listed = getBooleanValue(property, "listed", "is_listed") ?? activeByStatus;
  const pmsActive = getBooleanValue(property, "pmsActive", "pms_active") ?? activeByStatus;

  const featureTags = [];
  if (property.has_balcony === true) featureTags.push("balcony");
  if (property.has_parking === true) featureTags.push("parking");
  if (property.has_wifi === true) featureTags.push("wifi");

  return {
    _id: externalId,
    id: externalId,
    unitTypeId: externalId,
    listing_id: externalId,
    guesty_id: guestyId || null,
    source_property_id: propertyId || null,
    title,
    nickname: normalizeString(property.property_code) || normalizeString(property.name) || title,
    type: normalizeString(property.room_type) || "apartment",
    roomType: normalizeString(property.room_type) || null,
    propertyType: normalizeString(featureMap.property_type) || "Apartment",
    accommodates: firstNumber(property.accommodates, featureMap.accommodates),
    bedrooms: firstNumber(property.bedrooms, featureMap.bedrooms),
    bathrooms: firstNumber(property.bathrooms, featureMap.bathrooms),
    beds: firstNumber(property.bedrooms, featureMap.beds),
    address: {
      full: addressFull,
      city: city || undefined,
      country: country || undefined,
      ...(latitude !== null ? { lat: latitude } : {}),
      ...(longitude !== null ? { lng: longitude } : {}),
    },
    location: {
      ...(latitude !== null ? { lat: latitude } : {}),
      ...(longitude !== null ? { lng: longitude } : {}),
    },
    city,
    city_slug: slugify(city),
    country,
    picture: pictures[0] || null,
    pictures,
    amenities,
    tags: [...new Set([...featureTags, ...Object.keys(featureMap).filter((key) => key.startsWith("tag:"))])],
    publicDescription: {
      summary: descriptionBody,
      description: descriptionBody,
      text: descriptionBody,
    },
    description: descriptionBody,
    prices: {
      currency,
      ...(basePricePerNight !== null ? { nightly: { amount: basePricePerNight } } : {}),
      ...(basePricePerNight !== null ? { basePricePerNight } : {}),
      ...(basePricePerNight !== null ? { basePrice: { amount: basePricePerNight } } : {}),
      ...(cleaningFee !== null ? { cleaningFee } : {}),
    },
    ...(basePricePerNight !== null ? { basePricePerNight } : {}),
    ...(cleaningFee !== null ? { cleaningFee } : {}),
    currency,
    active,
    listed,
    pmsActive,
    created_at: property.created_at,
    updated_at: property.updated_at,
    metadata: {
      property_code: normalizeString(property.property_code) || null,
      size_sqm: firstNumber(property.size_sqm),
      has_balcony: property.has_balcony === true,
      has_parking: property.has_parking === true,
      has_wifi: property.has_wifi === true,
      ...(featureMap.security_deposit ? { security_deposit: featureMap.security_deposit } : {}),
      ...(featureMap.extra_guest_fee ? { extra_guest_fee: featureMap.extra_guest_fee } : {}),
    },
  };
};

const querySupabaseListings = async ({ query, propertiesMode }) => {
  if (!propertiesMode) {
    return supabaseRestRequest(SUPABASE_LISTINGS_TABLE, { query });
  }

  const enrichedQuery = {
    ...query,
    select: PROPERTIES_SELECT,
  };

  try {
    return await supabaseRestRequest(SUPABASE_LISTINGS_TABLE, { query: enrichedQuery });
  } catch (error) {
    const message = String(error?.message || "");
    const relationMissing =
      message.includes("Could not find a relationship") ||
      message.includes("schema cache") ||
      message.includes("column") ||
      message.includes("select");

    if (!relationMissing) throw error;

    // Fall back to flat property rows if relational selects are unavailable.
    return supabaseRestRequest(SUPABASE_LISTINGS_TABLE, {
      query: {
        ...query,
        select: "*",
      },
    });
  }
};

export const isSupabaseListingsEnabled = () =>
  shouldUseSupabaseProvider("listings") ||
  parseEnvBoolean(process.env.SUPABASE_USE_FOR_LISTINGS, false);

export const fetchListingsFromSupabase = async ({ queryParams = {} } = {}) => {
  const requestedLimit = parsePositiveInteger(queryParams.limit, 200);
  const requestedSkip = parseInteger(queryParams.skip || queryParams.offset, 0);
  const limit = Math.min(requestedLimit, MAX_LISTINGS_LIMIT);

  const onlyIds = parseIdList(queryParams.onlyIds || queryParams.idsOnly || "");
  const includeIds = parseIdList(queryParams.includeIds || queryParams.forceIds || queryParams.ids || "");
  const requestedIds = [...new Set([...onlyIds, ...includeIds])];

  const propertiesMode = isPropertiesTableMode();

  const query = {
    select: "*",
    limit,
    offset: requestedSkip,
  };

  if (requestedIds.length && !propertiesMode) {
    query.id = `in.${toSupabaseInFilter(requestedIds)}`;
  }

  const rows = await querySupabaseListings({ query, propertiesMode });
  let results = Array.isArray(rows) ? rows : [];

  if (propertiesMode) {
    results = results
      .map((property) => mapPropertyRowToListing(property))
      .filter(Boolean);
  }

  if (requestedIds.length) {
    const idSet = new Set(requestedIds.map((id) => String(id)));
    results = results.filter((row) => readListingIds(row).some((id) => idSet.has(id)));
  }

  const cityFilter = normalizeString(queryParams.city || queryParams.citySlug).toLowerCase();
  if (cityFilter) {
    results = results.filter((row) => {
      const city = normalizeString(row?.city || row?.address?.city || row?.city_slug).toLowerCase();
      const slug = normalizeString(row?.city_slug).toLowerCase();
      return city.includes(cityFilter) || slug === cityFilter;
    });
  }

  const search = normalizeString(queryParams.search || queryParams.q).toLowerCase();
  if (search) {
    results = results.filter((row) => getTextBlob(row).includes(search));
  }

  results = filterByBoolean(results, queryParams.active, (row) =>
    getBooleanValue(row, "active", "is_active", "isActive"),
  );
  results = filterByBoolean(results, queryParams.pmsActive, (row) =>
    getBooleanValue(row, "pmsActive", "pms_active", "is_pms_active", "isPmsActive"),
  );
  results = filterByBoolean(results, queryParams.listed, (row) =>
    getBooleanValue(row, "listed", "is_listed", "isListed"),
  );

  return {
    results,
    count: results.length,
    provider: propertiesMode ? "supabase:properties" : "supabase",
  };
};
