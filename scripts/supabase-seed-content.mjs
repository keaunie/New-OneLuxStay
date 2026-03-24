import dotenv from "dotenv";
import conciergeKnowledge from "../src/data/conciergeKnowledge.js";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const supabaseUrl = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const supabaseKey = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "",
).trim();
const siteContentTable = String(process.env.SUPABASE_SITE_CONTENT_TABLE || "site_content").trim();

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const readJson = async (relativePath) => {
  const raw = await fs.readFile(path.join(root, relativePath), "utf8");
  return JSON.parse(raw);
};

const upsertRows = async (rows) => {
  const endpoint = `${supabaseUrl}/rest/v1/${siteContentTable}?on_conflict=key`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
      Accept: "application/json",
    },
    body: JSON.stringify(rows),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase upsert failed (${response.status}): ${text}`);
  }

  return text ? JSON.parse(text) : [];
};

const now = new Date().toISOString();
const reviews = {
  reviews_hwh: await readJson("src/data/reviews-hwh.json"),
  reviews_hollywood: await readJson("src/data/reviews-hollywood.json"),
  reviews_dodger: await readJson("src/data/reviews-dodger.json"),
  reviews_miami: await readJson("src/data/reviews-miami.json"),
  reviews_redondo: await readJson("src/data/reviews-redondo.json"),
};

const rows = [
  {
    key: "concierge_knowledge",
    value: conciergeKnowledge,
    metadata: { public: true, type: "knowledge", source: "local_seed" },
    updated_at: now,
  },
  ...Object.entries(reviews).map(([key, value]) => ({
    key,
    value,
    metadata: { public: true, type: "reviews", source: "local_seed" },
    updated_at: now,
  })),
  {
    key: "reviews_bundle",
    value: reviews,
    metadata: { public: true, type: "reviews_bundle", source: "local_seed" },
    updated_at: now,
  },
];

const result = await upsertRows(rows);
console.log(`Upserted ${result.length || rows.length} site content rows into ${siteContentTable}.`);
