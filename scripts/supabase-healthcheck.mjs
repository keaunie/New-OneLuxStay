import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "",
).trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const tables = [
  process.env.SUPABASE_LISTINGS_TABLE || "listings",
  process.env.SUPABASE_AVAILABILITY_TABLE || "listing_nightly_prices",
  process.env.SUPABASE_SITE_CONTENT_TABLE || "site_content",
  process.env.SUPABASE_BOOKINGS_TABLE || "bookings",
];

const checkTable = async (table) => {
  const endpoint = `${supabaseUrl}/rest/v1/${table}?select=*&limit=1`;
  const response = await fetch(endpoint, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: "application/json",
    },
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${table}: ${response.status} ${text}`);
  }

  const payload = text ? JSON.parse(text) : [];
  const sampleCount = Array.isArray(payload) ? payload.length : 0;
  return { table, ok: true, sampleCount };
};

for (const table of tables) {
  const result = await checkTable(table);
  console.log(`${result.table}: ok (sample rows returned: ${result.sampleCount})`);
}

console.log("Supabase health check passed.");
