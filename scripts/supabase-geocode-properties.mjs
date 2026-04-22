import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
const getArg = (prefix) => args.find((value) => value.startsWith(`${prefix}=`))?.slice(prefix.length + 1) || null;
const hasFlag = (flag) => args.includes(flag);

const APPLY = hasFlag("--apply");
const DRY_RUN = !APPLY;
const PAGE_SIZE = Math.max(1, Math.min(1000, Number(getArg("--page-size") || 200) || 200));
const MAX_ROWS = Math.max(1, Number(getArg("--max") || 5000) || 5000);
const MIN_DELAY_MS = Math.max(250, Number(getArg("--delay-ms") || 1100) || 1100);
const COUNTRY_BIAS = String(getArg("--country") || "").trim();

const USER_AGENT =
  process.env.NOMINATIM_USER_AGENT ||
  "OneLuxStay-Geocoder/1.0 (operations@oneluxstay.com)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url, options = {}, timeoutMs = 20_000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text || null;
    }
    return { response, payload, text };
  } finally {
    clearTimeout(timeoutId);
  }
};

const supabaseRestUrl = (path, query = {}) => {
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  const target = new URL(`${supabaseUrl}/rest/v1/${normalizedPath}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    target.searchParams.set(key, String(value));
  });
  return target.toString();
};

const supabaseRequest = async (path, { method = "GET", query, body, prefer } = {}) => {
  const response = await fetch(supabaseRestUrl(path, query), {
    method,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text || null;
  }

  if (!response.ok) {
    const message =
      typeof payload === "string"
        ? payload
        : payload?.message || payload?.error_description || `Supabase request failed (${response.status})`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
};

const normalizeString = (value) => String(value ?? "").trim();
const toNumber = (value) => {
  if (value == null) return null;
  const trimmed = typeof value === "string" ? value.trim() : value;
  if (trimmed === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildSearchQuery = (property) => {
  const address = normalizeString(property?.address);
  const city = normalizeString(property?.city);
  const country = normalizeString(property?.country);

  const addressLower = address.toLowerCase();
  const cityLower = city.toLowerCase();
  const countryLower = country.toLowerCase();

  const parts = [];
  if (address) parts.push(address);

  if (city && (!addressLower || !addressLower.includes(cityLower))) {
    parts.push(city);
  }

  if (country) {
    const countryTokens = [countryLower].filter(Boolean);
    if (["united states", "usa", "u.s.a.", "us", "u.s."].includes(countryLower)) {
      countryTokens.push("united states", "usa", "u.s.a.", "us", "u.s.");
    }
    const hasCountryInAddress = countryTokens.some((token) => token && addressLower.includes(token));
    if (!hasCountryInAddress) parts.push(country);
  }

  if (COUNTRY_BIAS) {
    const biasLower = COUNTRY_BIAS.toLowerCase();
    const alreadyIncluded = parts.some((part) => part.toLowerCase().includes(biasLower));
    if (!alreadyIncluded) parts.push(COUNTRY_BIAS);
  }

  const seen = new Set();
  const deduped = [];
  for (const part of parts) {
    const key = part.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(part);
  }

  return deduped.join(", ");
};

const geocodeNominatim = async (query) => {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.search = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: "1",
  }).toString();

  let attempt = 0;
  while (attempt < 4) {
    attempt += 1;
    const { response, payload, text } = await fetchJson(
      url.toString(),
      {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
      },
      20_000,
    );

    if (response.ok) {
      const list = Array.isArray(payload) ? payload : [];
      const first = list[0] || null;
      const latitude = toNumber(first?.lat);
      const longitude = toNumber(first?.lon);
      return { latitude, longitude, raw: first };
    }

    const retryAfter = response.headers.get("retry-after");
    const retryAfterSeconds = Number.parseInt(retryAfter || "", 10);
    const backoffMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 1500 * attempt;

    // Retry only on transient/provider throttling errors.
    if (![429, 502, 503].includes(response.status)) {
      throw new Error(`Nominatim error (${response.status}): ${String(text || "").slice(0, 300)}`);
    }

    await sleep(backoffMs);
  }

  return { latitude: null, longitude: null, raw: null };
};

const updatePropertyCoords = async (id, latitude, longitude) => {
  if (DRY_RUN) return;
  await supabaseRequest("properties", {
    method: "PATCH",
    query: { id: `eq.${id}` },
    body: { latitude, longitude },
    prefer: "return=minimal",
  });
};

const main = async () => {
  console.log(
    `Geocoding properties with missing coordinates (${DRY_RUN ? "dry-run" : "apply"}).`,
  );
  console.log(`pageSize=${PAGE_SIZE} max=${MAX_ROWS} delayMs=${MIN_DELAY_MS}`);
  console.log("");

  try {
    await supabaseRequest("properties", {
      query: { select: "latitude,longitude", limit: 1 },
    });
  } catch (error) {
    const message = String(error?.message || error);
    if (message.includes("does not exist") && message.includes("latitude")) {
      console.error("Supabase table `properties` is missing `latitude`/`longitude` columns.");
      console.error("Apply the migration first: `supabase/migrations/20260421144000_add_properties_lat_lng.sql`.");
      process.exitCode = 2;
      return;
    }
    throw error;
  }

  let offset = 0;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  while (processed < MAX_ROWS) {
    const limit = Math.min(PAGE_SIZE, MAX_ROWS - processed);
    const rows = await supabaseRequest("properties", {
      query: {
        // Keep this select aligned with the current `properties` table schema.
        select: "id,name,address,city,country,latitude,longitude,active",
        or: "(latitude.is.null,longitude.is.null)",
        limit,
        offset,
      },
    });

    const batch = Array.isArray(rows) ? rows : [];
    if (!batch.length) break;

    for (const property of batch) {
      processed += 1;

      const id = normalizeString(property?.id);
      const name = normalizeString(property?.name) || "(unnamed)";
      const latExisting = toNumber(property?.latitude);
      const lngExisting = toNumber(property?.longitude);

      if (!id) {
        skipped += 1;
        continue;
      }

      if (latExisting != null && lngExisting != null) {
        skipped += 1;
        continue;
      }

      const query = buildSearchQuery(property);
      if (!query) {
        console.log(`[skip] ${id} ${name}: missing address/city/country`);
        skipped += 1;
        continue;
      }

      try {
        const { latitude, longitude } = await geocodeNominatim(query);
        if (latitude == null || longitude == null) {
          console.log(`[fail] ${id} ${name}: no geocode match for "${query}"`);
          failed += 1;
        } else {
          await updatePropertyCoords(id, latitude, longitude);
          console.log(`[${DRY_RUN ? "dry" : "ok "}] ${id} ${name}: ${latitude}, ${longitude}`);
          updated += 1;
        }
      } catch (error) {
        console.log(`[fail] ${id} ${name}: ${error?.message || error}`);
        failed += 1;
      }

      await sleep(MIN_DELAY_MS);
    }

    offset += batch.length;
  }

  console.log("");
  console.log(`processed: ${processed}`);
  console.log(`updated:   ${updated}`);
  console.log(`skipped:   ${skipped}`);
  console.log(`failed:    ${failed}`);
  console.log("");
  console.log(
    "Next: re-run `node scripts/debug-google-vr-feed.mjs --live --out=google-vr-hotel-list.xml` to see listings emitted.",
  );
  console.log("Tip: run with `--apply` to actually write latitude/longitude back to Supabase.");
};

try {
  await main();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}
