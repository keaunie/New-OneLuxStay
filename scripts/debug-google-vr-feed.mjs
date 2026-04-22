import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const useLive = args.includes("--live");
const outArg = args.find((value) => value.startsWith("--out="));
const outPath = outArg ? outArg.slice("--out=".length) : null;

const ensureEnv = (key, value) => {
  if (String(process.env[key] || "").trim()) return;
  process.env[key] = value;
};

// Allow mock runs even if a developer hasn't configured Supabase yet.
// NOTE: In `--live` mode we intentionally do NOT set fallbacks, so dotenv-loaded
// values from `.env` can populate these vars.
if (!useLive) {
  ensureEnv("SUPABASE_URL", "https://example.supabase.co");
  ensureEnv("SUPABASE_SERVICE_ROLE_KEY", "mock_service_role_key");
}

const mockPropertyRows = [
  {
    id: "mock-1",
    guesty_id: "mock-guesty-1",
    name: "Mock Listing One",
    property_code: "MOCK1",
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
    property_descriptions: [
      {
        language: "en",
        title: "Mock listing",
        description: "A nice place & cozy (mock data).",
      },
    ],
    property_features: [{ key: "website", value: "https://example.com/listing/mock-guesty-1" }],
    property_amenities: [{ amenity: "kitchen" }, { amenity: "wifi" }],
  },
];

if (!useLive) {
  // Mock Supabase REST fetch calls made by supabaseRestRequest().
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const offset = Number(parsed.searchParams.get("offset") || 0) || 0;
    const payload = offset === 0 ? mockPropertyRows : [];

    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(payload);
      },
    };
  };
}

const functionPath = path.join(process.cwd(), "netlify", "functions", "google-vr-hotel-list.js");
const { handler } = await import(pathToFileURL(functionPath).href);

const response = await handler({
  httpMethod: "GET",
  headers: {
    host: "localhost:8888",
    "x-forwarded-proto": "http",
  },
});

const xml = String(response?.body || "");
const listingCount = (xml.match(/<listing>/g) || []).length;

console.log(`statusCode: ${response?.statusCode}`);
console.log(`contentType: ${response?.headers?.["Content-Type"] || response?.headers?.["content-type"] || "unknown"}`);
console.log(`listings: ${listingCount}`);
console.log("");

if (outPath) {
  fs.writeFileSync(outPath, xml, "utf8");
  console.log(`wrote: ${outPath}`);
} else {
  // Print a small preview by default so the output is readable in a terminal.
  console.log(xml.split("\n").slice(0, 80).join("\n"));
  console.log("");
  console.log('Tip: add "--out=google-vr-hotel-list.xml" to write the full XML to a file.');
  console.log('Tip: add "--live" to query Supabase instead of mock data.');
}
