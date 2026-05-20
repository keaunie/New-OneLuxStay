import { ensureLocalEnv } from "./_shared/loadEnv.js";
import { fetchListingsFromSupabase } from "./_shared/supabaseListingsService.js";
import { isHiddenUnit } from "../../src/config/hiddenUnits.js";

ensureLocalEnv();

const PARTNER_KEY = String(
  process.env.GOOGLE_ARI_PARTNER_KEY ||
    process.env.GOOGLE_HOTEL_PARTNER_KEY ||
    "",
).trim();

const DEFAULT_LANGUAGE = String(process.env.GOOGLE_VR_FEED_LANGUAGE || "en")
  .trim()
  .toLowerCase()
  .split(/[_-]/)[0] || "en";

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

const normalizeString = (value) => String(value ?? "").trim();

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const clampText = (value, maxLen) => {
  const raw = normalizeString(value);
  if (!raw) return "";
  const compact = raw.replace(/\s+/g, " ");
  return compact.length > maxLen ? `${compact.slice(0, maxLen - 1)}…` : compact;
};

const toInteger = (value, fallback = 1) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.round(parsed));
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
    const query = event.queryStringParameters || {};
    const hotelId = normalizeString(query.hotel_id || query.hotelId || query.property_id || query.propertyId);
    if (!hotelId) {
      return xmlResponse(
        400,
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          "<error>",
          "  <message>Missing hotel_id (Hotel List Feed &lt;id&gt;)</message>",
          "</error>",
          "",
        ].join("\n"),
      );
    }

    if (isHiddenUnit(hotelId)) {
      return xmlResponse(
        404,
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          "<error>",
          "  <message>Not found</message>",
          "</error>",
          "",
        ].join("\n"),
      );
    }

    if (!PARTNER_KEY) {
      return xmlResponse(
        400,
        [
          '<?xml version="1.0" encoding="UTF-8"?>',
          "<error>",
          "  <message>Missing GOOGLE_ARI_PARTNER_KEY (or GOOGLE_HOTEL_PARTNER_KEY)</message>",
          "</error>",
          "",
        ].join("\n"),
      );
    }

    const roomId = normalizeString(query.room_id || query.roomId) || "room";
    const packageId = normalizeString(query.package_id || query.packageId) || "standard";
    const language = normalizeString(query.language || DEFAULT_LANGUAGE).toLowerCase() || "en";
    const action = normalizeString(query.action || "delta").toLowerCase();
    const safeAction = ["overlay", "delta"].includes(action) ? action : "delta";

    const { results } = await fetchListingsFromSupabase({
      queryParams: { includeIds: hotelId, limit: 1 },
    });
    const listing = Array.isArray(results) ? results[0] : null;

    const title = clampText(listing?.title || listing?.nickname || `Property ${hotelId}`, 200) || `Property ${hotelId}`;
    const description = clampText(listing?.description || listing?.publicDescription?.summary || "", 1000);
    const capacity = toInteger(listing?.accommodates || listing?.capacity, 1);

    const nowIso = new Date().toISOString();
    const messageId = `property-${hotelId}-${nowIso.replace(/[^0-9]/g, "").slice(0, 14)}`;

    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<Transaction timestamp="${escapeXml(nowIso)}" id="${escapeXml(messageId)}" partner="${escapeXml(
        PARTNER_KEY,
      )}">`,
    );
    lines.push(`  <PropertyDataSet action="${escapeXml(safeAction)}">`);
    lines.push(`    <Property>${escapeXml(hotelId)}</Property>`);
    lines.push("    <RoomData>");
    lines.push(`      <RoomID>${escapeXml(roomId)}</RoomID>`);
    lines.push("      <Name>");
    lines.push(`        <Text text="${escapeXml(title)}" language="${escapeXml(language)}"/>`);
    lines.push("      </Name>");
    lines.push("      <Description>");
    lines.push(
      `        <Text text="${escapeXml(description || title)}" language="${escapeXml(language)}"/>`,
    );
    lines.push("      </Description>");
    lines.push("      <AllowablePackageIDs>");
    lines.push(`        <AllowablePackageID>${escapeXml(packageId)}</AllowablePackageID>`);
    lines.push("      </AllowablePackageIDs>");
    lines.push(`      <Capacity>${capacity}</Capacity>`);
    lines.push("    </RoomData>");
    lines.push("    <PackageData>");
    lines.push(`      <PackageID>${escapeXml(packageId)}</PackageID>`);
    lines.push("      <Name>");
    lines.push(
      `        <Text text="${escapeXml("Standard rate")}" language="${escapeXml(language)}"/>`,
    );
    lines.push("      </Name>");
    lines.push("      <Description>");
    lines.push(
      `        <Text text="${escapeXml(
        "Nightly rate (per date) as provided by the partner.",
      )}" language="${escapeXml(language)}"/>`,
    );
    lines.push("      </Description>");
    lines.push("      <AllowableRoomIDs>");
    lines.push(`        <AllowableRoomID>${escapeXml(roomId)}</AllowableRoomID>`);
    lines.push("      </AllowableRoomIDs>");
    lines.push("    </PackageData>");
    lines.push("  </PropertyDataSet>");
    lines.push("</Transaction>");
    lines.push("");

    return xmlResponse(200, lines.join("\n"));
  } catch (error) {
    const message = escapeXml(error?.message || String(error));
    return xmlResponse(
      500,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<error>",
        `  <message>${message}</message>`,
        "</error>",
        "",
      ].join("\n"),
    );
  }
}
