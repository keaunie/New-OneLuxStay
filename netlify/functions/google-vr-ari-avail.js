import { ensureLocalEnv } from "./_shared/loadEnv.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

ensureLocalEnv();

const SUPABASE_AVAILABILITY_TABLE =
  String(process.env.SUPABASE_AVAILABILITY_TABLE || "listing_nightly_prices").trim() ||
  "listing_nightly_prices";

const FALLBACK_AVAILABILITY_TABLES = [
  "property_nightly_prices",
  "listing_nightly_prices",
].filter((name) => name !== SUPABASE_AVAILABILITY_TABLE);

const DEFAULT_DAYS = Math.max(1, Math.min(180, Number(process.env.GOOGLE_ARI_DEFAULT_DAYS || 30) || 30));
const MAX_DAYS = Math.max(DEFAULT_DAYS, Math.min(730, Number(process.env.GOOGLE_ARI_MAX_DAYS || 180) || 180));

const PARTNER_KEY = String(
  process.env.GOOGLE_ARI_PARTNER_KEY ||
    process.env.GOOGLE_HOTEL_PARTNER_KEY ||
    "",
).trim();

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

const toIsoDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const addDaysIso = (isoDate, daysToAdd) => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.trunc(daysToAdd)));
  return d.toISOString().slice(0, 10);
};

const parseBoolean = (value, fallback = false) => {
  if (typeof value === "boolean") return value;
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return fallback;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
};

const parsePositiveInt = (value, fallback) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.max(1, Math.trunc(num));
};

const sortByDate = (rows = []) =>
  [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));

const isDateConsecutive = (prevIso, nextIso) => {
  if (!prevIso || !nextIso) return false;
  const prev = new Date(`${prevIso}T00:00:00.000Z`);
  const next = new Date(`${nextIso}T00:00:00.000Z`);
  if (Number.isNaN(prev.getTime()) || Number.isNaN(next.getTime())) return false;
  const diffDays = Math.round((next.getTime() - prev.getTime()) / 86_400_000);
  return diffDays === 1;
};

const chunkAvailability = (rows = []) => {
  const chunks = [];
  let current = null;

  for (const row of rows) {
    const date = toIsoDate(row?.date);
    if (!date) continue;

    const available = parseBoolean(row?.is_available, true);
    const minNights = parsePositiveInt(row?.min_nights, 1);

    if (
      current &&
      current.available === available &&
      current.minNights === minNights &&
      isDateConsecutive(current.end, date)
    ) {
      current.end = date;
      continue;
    }

    current = { start: date, end: date, available, minNights };
    chunks.push(current);
  }

  return chunks;
};

const isMissingTableError = (message = "") =>
  message.includes("Could not find the table") ||
  message.includes("schema cache") ||
  message.includes("does not exist");

const isMissingColumnError = (message = "") =>
  message.includes("column") && message.includes("does not exist");

const fetchAvailRows = async ({ table, hotelId, start, end }) => {
  const baseQuery = {
    select: "date,is_available,min_nights",
    date: `gte.${start}`,
    order: "date.asc",
    limit: Math.max(14, MAX_DAYS + 7),
  };

  try {
    const rows = await supabaseRestRequest(table, {
      query: {
        ...baseQuery,
        property_id: `eq.${hotelId}`,
      },
    });
    return Array.isArray(rows) ? rows : [];
  } catch (error) {
    const msg = String(error?.message || "");
    if (isMissingColumnError(msg) && msg.includes("property_id")) {
      // fall through
    } else {
      throw error;
    }
  }

  const rows = await supabaseRestRequest(table, {
    query: {
      ...baseQuery,
      listing_id: `eq.${hotelId}`,
    },
  });
  return Array.isArray(rows) ? rows : [];
};

const readAvailWithFallback = async ({ hotelId, start, end }) => {
  const candidates = [SUPABASE_AVAILABILITY_TABLE, ...FALLBACK_AVAILABILITY_TABLES];
  let lastError = null;

  for (const table of candidates) {
    try {
      const rows = await fetchAvailRows({ table, hotelId, start, end });
      return { table, rows };
    } catch (error) {
      const msg = String(error?.message || "");
      lastError = error;
      if (isMissingTableError(msg)) continue;
      if (isMissingColumnError(msg)) continue;
      throw error;
    }
  }

  throw lastError || new Error("Unable to query availability table.");
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

    const roomId = normalizeString(query.room_id || query.roomId) || "room";
    const packageId = normalizeString(query.package_id || query.packageId) || "standard";

    const todayIso = new Date().toISOString().slice(0, 10);
    const start = toIsoDate(query.start || query.start_date || query.startDate || todayIso) || todayIso;
    const desiredDays = parsePositiveInt(query.days, DEFAULT_DAYS);
    const clampedDays = Math.min(MAX_DAYS, desiredDays);
    const end = toIsoDate(query.end || query.end_date || query.endDate || addDaysIso(start, clampedDays - 1));

    const { table: resolvedTable, rows } = await readAvailWithFallback({
      hotelId,
      start,
      end,
    });

    const normalizedRows = sortByDate(Array.isArray(rows) ? rows : []).map((row) => ({
      date: toIsoDate(row?.date),
      is_available: row?.is_available,
      min_nights: row?.min_nights,
    })).filter((row) => row.date && row.date >= start && row.date <= end);

    const chunks = chunkAvailability(normalizedRows);
    const nowIso = new Date().toISOString();
    const echoToken = `avail-${hotelId}-${nowIso.replace(/[^0-9]/g, "").slice(0, 14)}`;

    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push(
      `<OTA_HotelAvailNotifRQ xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="${escapeXml(
        echoToken,
      )}" TimeStamp="${escapeXml(nowIso)}" Version="3.0">`,
    );
    if (PARTNER_KEY) {
      lines.push("  <POS>");
      lines.push("    <Source>");
      lines.push(`      <RequestorID ID="${escapeXml(PARTNER_KEY)}"/>`);
      lines.push("    </Source>");
      lines.push("  </POS>");
    }
    lines.push(`  <AvailStatusMessages HotelCode="${escapeXml(hotelId)}">`);
    lines.push(
      `    <!-- generated_at: ${escapeXml(nowIso)} range: ${escapeXml(start)}..${escapeXml(
        end,
      )} -->`,
    );
    lines.push(`    <!-- source_table: ${escapeXml(resolvedTable)} -->`);
    lines.push(`    <!-- emitted_messages: ${chunks.length} -->`);

    for (const chunk of chunks) {
      const status = chunk.available ? "Open" : "Close";
      lines.push("    <AvailStatusMessage>");
      lines.push(
        `      <StatusApplicationControl Start="${escapeXml(chunk.start)}" End="${escapeXml(
          chunk.end,
        )}" InvTypeCode="${escapeXml(roomId)}" RatePlanCode="${escapeXml(packageId)}"/>`,
      );
      lines.push(
        `      <RestrictionStatus Status="${status}" Restriction="Master"/>`,
      );
      if (Number.isFinite(Number(chunk.minNights)) && chunk.minNights >= 1) {
        lines.push("      <LengthsOfStay>");
        lines.push(
          `        <LengthOfStay Time="${Math.max(1, Math.trunc(chunk.minNights))}" TimeUnit="Day" MinMaxMessageType="SetMinLOS"/>`,
        );
        lines.push("      </LengthsOfStay>");
      }
      lines.push("    </AvailStatusMessage>");
    }

    lines.push("  </AvailStatusMessages>");
    lines.push("</OTA_HotelAvailNotifRQ>");
    lines.push("");

    return xmlResponse(200, lines.join("\n"));
  } catch (error) {
    const rawMessage = String(error?.message || String(error));
    const message = escapeXml(rawMessage);
    const missingTable =
      rawMessage.includes("Could not find the table") ||
      rawMessage.includes("schema cache") ||
      rawMessage.includes("does not exist");
    const statusCode = missingTable ? 400 : 500;
    const hint = missingTable
      ? `Missing availability table. Set SUPABASE_AVAILABILITY_TABLE (recommended: property_nightly_prices) and/or apply supabase/migrations/20260421175000_create_property_nightly_prices.sql. Alternative: supabase/migrations/20260323_prepare_site_data_tables.sql (creates listing_nightly_prices). Current table: ${SUPABASE_AVAILABILITY_TABLE}`
      : "";
    return xmlResponse(
      statusCode,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<error>",
        `  <message>${message}</message>`,
        ...(hint ? [`  <hint>${escapeXml(hint)}</hint>`] : []),
        "</error>",
        "",
      ].join("\n"),
    );
  }
}
