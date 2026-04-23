import { getBaseUrl } from "./_shared/http.js";
import { ensureLocalEnv } from "./_shared/loadEnv.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

ensureLocalEnv();

const FEED_TABLE = String(process.env.GOOGLE_VR_FEED_TABLE || process.env.SUPABASE_LISTINGS_TABLE || "properties").trim();
const FEED_LANGUAGE = String(process.env.GOOGLE_VR_FEED_LANGUAGE || "en").trim() || "en";
const FEED_PAGE_SIZE = Math.max(1, Math.min(1000, Number(process.env.GOOGLE_VR_FEED_PAGE_SIZE || 500) || 500));
const FEED_MAX_ROWS = Math.max(FEED_PAGE_SIZE, Number(process.env.GOOGLE_VR_FEED_MAX_ROWS || 5000) || 5000);
const DEFAULT_COUNTRY = String(process.env.GOOGLE_VR_DEFAULT_COUNTRY || "US").trim().toUpperCase();
const DEFAULT_PHONE = String(process.env.GOOGLE_VR_DEFAULT_PHONE || "").trim();
const DEFAULT_CATEGORY = String(process.env.GOOGLE_VR_DEFAULT_CATEGORY || "vacation_rental").trim();

const SELECT_WITH_RELATIONS = [
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
  "status",
  "has_wifi",
  "has_parking",
  "has_balcony",
  "created_at",
  "updated_at",
  "property_descriptions(language,title,description)",
  "property_features(key,value)",
  "property_amenities(amenity)",
].join(",");

const ISO2_BY_COUNTRY = new Map([
  ["UNITED STATES", "US"],
  ["USA", "US"],
  ["U.S.A.", "US"],
  ["US", "US"],
  ["UNITED ARAB EMIRATES", "AE"],
  ["UAE", "AE"],
  ["AE", "AE"],
  ["BELGIUM", "BE"],
  ["BE", "BE"],
  ["CANADA", "CA"],
  ["CA", "CA"],
  ["MEXICO", "MX"],
  ["MX", "MX"],
]);

const xmlResponse = (statusCode, xml) => ({
  statusCode,
  headers: {
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "public, max-age=300",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  },
  body: xml,
});

const normalizeString = (value) => String(value || "").trim();

const slugify = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toNumber = (value) => {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toInteger = (value, fallback = null) => {
  if (value == null) return fallback;
  if (typeof value === "string" && !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toIso2Country = (value) => {
  const normalized = normalizeString(value).toUpperCase();
  if (!normalized) return DEFAULT_COUNTRY;
  if (normalized.length === 2) return normalized;
  return ISO2_BY_COUNTRY.get(normalized) || DEFAULT_COUNTRY;
};

const boolString = (value) => {
  const normalized = normalizeString(value).toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return "Yes";
  if (["0", "false", "no", "n", "off"].includes(normalized)) return "No";
  return "Unknown";
};

const isActiveListing = (statusValue) => {
  if (typeof statusValue === "boolean") return statusValue;
  const value = normalizeString(statusValue).toLowerCase();
  if (!value) return true;
  if (["inactive", "disabled", "draft", "archived", "unlisted", "deleted", "closed"].includes(value)) return false;
  return true;
};

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

const toFeatureMap = (features = []) =>
  Object.fromEntries(
    (Array.isArray(features) ? features : [])
      .map((item) => [normalizeString(item?.key).toLowerCase(), normalizeString(item?.value)])
      .filter(([key]) => Boolean(key)),
  );

const findAmenity = (amenities = [], patterns = []) => {
  const normalized = (Array.isArray(amenities) ? amenities : [])
    .map((entry) => normalizeString(entry?.amenity).toLowerCase())
    .filter(Boolean);
  return patterns.some((pattern) => normalized.some((entry) => entry.includes(pattern)));
};

const buildWebsiteUrl = (property, { baseUrl, listingId, featureMap }) => {
  const explicit = normalizeString(
    featureMap.website ||
      featureMap.listing_url ||
      featureMap.direct_url ||
      featureMap.url,
  );
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit;

  const citySlug = slugify(property.city) || "global";
  return `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(citySlug)}/listing/${encodeURIComponent(listingId)}`;
};

const fetchAllProperties = async ({ select }) => {
  const rows = [];
  let offset = 0;

  while (rows.length < FEED_MAX_ROWS) {
    const limit = Math.min(FEED_PAGE_SIZE, FEED_MAX_ROWS - rows.length);
    const batch = await supabaseRestRequest(FEED_TABLE, {
      query: {
        select,
        limit,
        offset,
      },
    });

    const current = Array.isArray(batch) ? batch : [];
    if (!current.length) break;

    rows.push(...current);
    if (current.length < limit) break;
    offset += current.length;
  }

  return rows;
};

const readPropertyRows = async () => {
  try {
    return await fetchAllProperties({ select: SELECT_WITH_RELATIONS });
  } catch (error) {
    const message = String(error?.message || "");
    const retryableIssue =
      message.includes("Could not find a relationship") ||
      message.includes("schema cache") ||
      message.includes("select") ||
      message.includes("does not exist") ||
      message.includes("column") ||
      message.includes("Unknown field");

    if (!retryableIssue) throw error;
    return fetchAllProperties({ select: "*" });
  }
};

const listingToXml = (property, { baseUrl }) => {
  const listingId = normalizeString(property.guesty_id) || normalizeString(property.id);
  const name =
    normalizeString(property.name) ||
    normalizeString(property.title) ||
    normalizeString(property.property_code) ||
    `Property ${listingId}`;

  const latitude = toNumber(property.latitude);
  const longitude = toNumber(property.longitude);
  const addressLine =
    typeof property.address === "string"
      ? normalizeString(property.address)
      : normalizeString(property.address?.full || property.address?.address || property.address?.line1);
  const city = normalizeString(property.city);
  const country = toIso2Country(property.country);

  if (!listingId || !name || !addressLine || latitude == null || longitude == null) return null;
  if (!isActiveListing(property.status)) return null;
  if (property.active === false) return null;

  const featureMap = toFeatureMap(property.property_features);
  const descriptionItem = pickPrimaryDescription(property.property_descriptions);
  const description =
    normalizeString(descriptionItem?.description) ||
    normalizeString(property.public_description_summary) ||
    normalizeString(property.public_description_space) ||
    normalizeString(property.public_description_neighborhood) ||
    normalizeString(property.public_description_notes) ||
    normalizeString(property.public_description_transit) ||
    normalizeString(featureMap.description) ||
    "";
  const website = buildWebsiteUrl(property, { baseUrl, listingId, featureMap });

  const accommodates = toInteger(
    property.accommodates ?? property.capacity ?? featureMap.capacity ?? featureMap.max_guests,
    null,
  );
  const bedrooms = toInteger(property.bedrooms ?? featureMap.number_of_bedrooms, null);
  const bathrooms = toNumber(property.bathrooms ?? featureMap.number_of_bathrooms);
  const beds = toInteger(property.beds ?? featureMap.number_of_beds, null);

  const capacity = accommodates != null ? accommodates : Math.max(1, bedrooms || 1);
  const postalCode = normalizeString(featureMap.postal_code || featureMap.zip || featureMap.zipcode);
  const province = normalizeString(featureMap.province || featureMap.state || featureMap.region);
  const phone = normalizeString(featureMap.phone || DEFAULT_PHONE);
  const category =
    normalizeString(featureMap.category) ||
    normalizeString(property.room_type || property.property_type) ||
    DEFAULT_CATEGORY;

  const created = new Date(property.updated_at || property.created_at || Date.now());
  const month = created.getUTCMonth() + 1;
  const day = created.getUTCDate();
  const year = created.getUTCFullYear();

  const amenities = Array.isArray(property.property_amenities) ? property.property_amenities : [];
  const hasKitchen = boolString(featureMap.kitchen || (findAmenity(amenities, ["kitchen"]) ? "yes" : ""));
  const hasPool = boolString(featureMap.pool || (findAmenity(amenities, ["pool"]) ? "yes" : ""));
  const hasWasher = boolString(featureMap.washer || (findAmenity(amenities, ["washer", "laundry"]) ? "yes" : ""));
  const hasDryer = boolString(featureMap.dryer || (findAmenity(amenities, ["dryer"]) ? "yes" : ""));
  const hasWifi = boolString(featureMap.wifi || (property.has_wifi === true ? "yes" : ""));
  const hasParking = boolString(featureMap.parking || (property.has_parking === true ? "yes" : ""));

  const lines = [];
  lines.push("  <listing>");
  lines.push(`    <id>${escapeXml(listingId)}</id>`);
  lines.push(`    <name>${escapeXml(name)}</name>`);
  lines.push('    <address format="simple">');
  lines.push(`      <component name="addr1">${escapeXml(addressLine)}</component>`);
  lines.push(`      <component name="city">${escapeXml(city)}</component>`);
  if (province) lines.push(`      <component name="province">${escapeXml(province)}</component>`);
  if (postalCode) lines.push(`      <component name="postal_code">${escapeXml(postalCode)}</component>`);
  lines.push("    </address>");
  lines.push(`    <country>${escapeXml(country)}</country>`);
  lines.push(`    <latitude>${latitude}</latitude>`);
  lines.push(`    <longitude>${longitude}</longitude>`);
  if (phone) lines.push(`    <phone type="main">${escapeXml(phone)}</phone>`);
  if (category) lines.push(`    <category>${escapeXml(category)}</category>`);
  lines.push("    <content>");
  if (description) {
    lines.push('      <text type="description">');
    lines.push(`        <link>${escapeXml(website)}</link>`);
    lines.push(`        <title>${escapeXml(name)}</title>`);
    lines.push(`        <body>${escapeXml(description)}</body>`);
    lines.push(`        <date month="${month}" day="${day}" year="${year}"/>`);
    lines.push("      </text>");
  }
  lines.push("      <attributes>");
  lines.push(`        <website>${escapeXml(website)}</website>`);
  lines.push(`        <client_attr name="capacity">${capacity}</client_attr>`);
  if (bedrooms != null) lines.push(`        <client_attr name="number_of_bedrooms">${bedrooms}</client_attr>`);
  if (bathrooms != null) lines.push(`        <client_attr name="number_of_bathrooms">${bathrooms}</client_attr>`);
  if (beds != null) lines.push(`        <client_attr name="number_of_beds">${beds}</client_attr>`);
  if (description) lines.push(`        <client_attr name="description">${escapeXml(description)}</client_attr>`);
  lines.push(`        <client_attr name="category">${escapeXml(category || DEFAULT_CATEGORY)}</client_attr>`);
  lines.push(`        <client_attr name="wifi">${hasWifi}</client_attr>`);
  lines.push(`        <client_attr name="parking">${hasParking}</client_attr>`);
  lines.push(`        <client_attr name="kitchen">${hasKitchen}</client_attr>`);
  lines.push(`        <client_attr name="pool">${hasPool}</client_attr>`);
  lines.push(`        <client_attr name="washer">${hasWasher}</client_attr>`);
  lines.push(`        <client_attr name="dryer">${hasDryer}</client_attr>`);
  lines.push("      </attributes>");
  lines.push("    </content>");
  lines.push("  </listing>");

  return lines.join("\n");
};

const buildFeedXml = ({ listingsXml, generatedAtIso, totalRows, emittedRows }) => {
  const skipped = Math.max(0, Number(totalRows || 0) - Number(emittedRows || 0));
  return [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<listings xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.gstatic.com/localfeed/local_feed.xsd">',
  `  <language>${escapeXml(FEED_LANGUAGE)}</language>`,
  `  <!-- generated_at: ${escapeXml(generatedAtIso)} -->`,
  `  <!-- total_rows: ${Number(totalRows || 0)} -->`,
  `  <!-- listings_emitted: ${Number(emittedRows || 0)} -->`,
  `  <!-- listings_skipped: ${skipped} -->`,
  "  <!-- note: listings require id/name/address/latitude/longitude and must be active -->",
  ...listingsXml,
  "</listings>",
  "",
  ].join("\n");
};

export async function handler(event = {}) {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  try {
    const configuredBase =
      normalizeString(process.env.GOOGLE_VR_WEBSITE_BASE_URL) ||
      normalizeString(process.env.PUBLIC_SITE_URL) ||
      normalizeString(process.env.URL) ||
      normalizeString(getBaseUrl(event));
    const baseUrl = configuredBase.replace(/\/+$/, "");

    const rows = await readPropertyRows();
    const listingsXml = rows
      .map((row) => listingToXml(row, { baseUrl }))
      .filter(Boolean);

    const xml = buildFeedXml({
      listingsXml,
      generatedAtIso: new Date().toISOString(),
      totalRows: rows.length,
      emittedRows: listingsXml.length,
    });

    return xmlResponse(200, xml);
  } catch (error) {
    const message = escapeXml(error?.message || String(error));
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      "<error>",
      `  <message>${message}</message>`,
      "</error>",
      "",
    ].join("\n");
    return xmlResponse(500, xml);
  }
}
