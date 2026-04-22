import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const cmd = (args[0] || "").trim().toLowerCase();

const useLive = args.includes("--live");
const outArg = args.find((value) => value.startsWith("--out="));
const outPath = outArg ? outArg.slice("--out=".length) : null;

const getArg = (prefix) => args.find((value) => value.startsWith(`${prefix}=`))?.slice(prefix.length + 1) || null;
const hotelId = getArg("--hotel-id") || getArg("--hotel_id") || "demo-hotel-1";
const roomId = getArg("--room-id") || "room";
const packageId = getArg("--package-id") || "standard";
const start = getArg("--start") || new Date().toISOString().slice(0, 10);
const days = Number(getArg("--days") || 14) || 14;

const ensureEnv = (key, value) => {
  if (String(process.env[key] || "").trim()) return;
  process.env[key] = value;
};

if (!useLive) {
  ensureEnv("SUPABASE_URL", "https://example.supabase.co");
  ensureEnv("SUPABASE_SERVICE_ROLE_KEY", "mock_service_role_key");
  ensureEnv("SUPABASE_LISTINGS_TABLE", "properties");
  ensureEnv("GOOGLE_ARI_PARTNER_KEY", "mock_partner_key");
}

const addDaysIso = (isoDate, addDays) => {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString().slice(0, 10);
};

const mockPropertyRow = {
  id: hotelId,
  guesty_id: hotelId,
  name: "Demo Property",
  property_code: "DEMO",
  address: "123 Main St",
  city: "Los Angeles",
  country: "US",
  latitude: 34.05,
  longitude: -118.25,
  room_type: "vacation_rental",
  bedrooms: 2,
  bathrooms: 1,
  accommodates: 4,
  status: "active",
  has_wifi: true,
  has_parking: false,
  has_balcony: false,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-02-01T00:00:00.000Z",
  property_descriptions: [{ language: "en", title: "Demo Property", description: "Simple demo description." }],
  property_features: [{ key: "website", value: "https://example.com/listing/demo" }],
  property_amenities: [{ amenity: "kitchen" }, { amenity: "wifi" }],
  property_images: [{ url: "https://example.com/image.jpg", is_primary: true, sort_order: 1 }],
  property_pricing: [{ base_price: 199, currency: "USD", cleaning_fee: 50, created_at: "2026-02-01T00:00:00.000Z" }],
};

const mockNightlyRows = Array.from({ length: Math.max(1, Math.min(60, days)) }, (_, idx) => {
  const date = addDaysIso(start, idx);
  const nightly_rate = idx % 7 === 5 || idx % 7 === 6 ? 249 : 199;
  const is_available = idx % 10 !== 7; // one blocked day
  const min_nights = idx % 14 === 0 ? 2 : 1;
  return {
    listing_id: hotelId,
    date,
    is_available,
    nightly_rate,
    cleaning_fee: 50,
    taxes: 0,
    currency: "USD",
    min_guests: 1,
    max_guests: 4,
    min_nights,
    updated_at: new Date().toISOString(),
  };
});

if (!useLive) {
  globalThis.fetch = async (url, options = {}) => {
    const raw = String(url);
    const parsed = new URL(raw);
    const pathname = parsed.pathname || "";

    const isSupabaseRest = pathname.includes("/rest/v1/");
    if (!isSupabaseRest) {
      return {
        ok: false,
        status: 500,
        async text() {
          return "mock: unexpected fetch";
        },
      };
    }

    const table = pathname.split("/rest/v1/")[1]?.split("/")[0] || "";
    const select = parsed.searchParams.get("select") || "*";

    if (table === "properties" || table === "listings") {
      const limit = Number(parsed.searchParams.get("limit") || 1) || 1;
      const payload = limit > 0 ? [mockPropertyRow] : [];
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
      };
    }

    if (table === "listing_nightly_prices") {
      // Filter by date range if provided
      const gte = String(parsed.searchParams.get("date") || "").match(/gte\.([0-9-]+)/)?.[1] || null;
      const lte = String(parsed.searchParams.getAll("date")?.join(",") || "")
        .match(/lte\.([0-9-]+)/)?.[1] || null;

      const payload = mockNightlyRows.filter((row) => {
        if (gte && row.date < gte) return false;
        if (lte && row.date > lte) return false;
        return true;
      });

      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
      };
    }

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(select ? [] : []);
      },
    };
  };
}

const call = async (fileName, queryString) => {
  const functionPath = path.join(process.cwd(), "netlify", "functions", fileName);
  const mod = await import(pathToFileURL(functionPath).href);
  const { handler } = mod;
  const response = await handler({
    httpMethod: "GET",
    queryStringParameters: queryString,
    headers: { host: "localhost:8888", "x-forwarded-proto": "http" },
  });
  return response;
};

const run = async () => {
  const baseQuery = {
    hotel_id: hotelId,
    room_id: roomId,
    package_id: packageId,
    start,
    days: String(days),
  };

  let fileName = "";
  if (cmd === "rate" || cmd === "rates") fileName = "google-vr-ari-rate.js";
  else if (cmd === "avail" || cmd === "availability") fileName = "google-vr-ari-avail.js";
  else if (cmd === "property" || cmd === "property-data") fileName = "google-vr-ari-property-data.js";
  else {
    console.log("Usage:");
    console.log("  node scripts/debug-google-vr-ari.mjs property --hotel-id=HOTEL");
    console.log("  node scripts/debug-google-vr-ari.mjs rate --hotel-id=HOTEL --start=YYYY-MM-DD --days=14");
    console.log("  node scripts/debug-google-vr-ari.mjs avail --hotel-id=HOTEL --start=YYYY-MM-DD --days=14");
    console.log("Options: --out=FILE, --live");
    process.exitCode = 1;
    return;
  }

  const response = await call(fileName, baseQuery);
  const xml = String(response?.body || "");
  console.log(`statusCode: ${response?.statusCode}`);
  console.log(`contentType: ${response?.headers?.["Content-Type"] || response?.headers?.["content-type"] || "unknown"}`);
  console.log("");

  if (outPath) {
    fs.writeFileSync(outPath, xml, "utf8");
    console.log(`wrote: ${outPath}`);
    return;
  }

  console.log(xml.split("\n").slice(0, 120).join("\n"));
  console.log("");
  console.log('Tip: add "--out=FILE.xml" to write the full XML.');
};

try {
  await run();
} catch (error) {
  console.error(error?.message || error);
  process.exitCode = 1;
}

