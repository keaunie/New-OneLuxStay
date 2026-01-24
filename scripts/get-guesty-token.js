import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cacheFile = path.join(__dirname, "../.guesty-openapi-token.json");
const guestyHost = "https://open-api.guesty.com";

dotenv.config({ path: path.join(__dirname, "../.env") });

const clientId =
  process.env.GUESTY_OPEN_API_CLIENT_ID || process.env.GUESTY_CLIENT_ID;
const clientSecret =
  process.env.GUESTY_OPEN_API_CLIENT_SECRET || process.env.GUESTY_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Missing GUESTY_OPEN_API_CLIENT_ID or GUESTY_OPEN_API_CLIENT_SECRET in .env"
  );
  process.exit(1);
}

const readCache = async () => {
  try {
    const raw = await fs.readFile(cacheFile, "utf-8");
    const data = JSON.parse(raw);
    if (!data?.access_token || !data?.expires_at) return null;
    if (Date.now() >= data.expires_at - 60_000) return null; // refresh 60s early
    return data;
  } catch {
    return null;
  }
};

const writeCache = async (access_token, expires_at) => {
  const payload = JSON.stringify({ access_token, expires_at }, null, 2);
  try {
    await fs.writeFile(cacheFile, payload, "utf-8");
  } catch (err) {
    console.warn(`Failed to write token cache: ${err.message}`);
  }
};

const fetchToken = async () => {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "open-api",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(`${guestyHost}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token request failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const expires_at = Date.now() + (json.expires_in || 86_400) * 1000;
  await writeCache(json.access_token, expires_at);
  return { access_token: json.access_token, expires_at };
};

const main = async () => {
  const cached = await readCache();
  if (cached) {
    const remaining = Math.max(
      0,
      Math.round((cached.expires_at - Date.now()) / 1000)
    );
    console.log(`Cached token valid for ~${remaining} seconds:`);
    console.log(cached.access_token);
    return;
  }

  const fresh = await fetchToken();
  const remaining = Math.max(
    0,
    Math.round((fresh.expires_at - Date.now()) / 1000)
  );
  console.log(`Fetched new token (expires in ~${remaining} seconds):`);
  console.log(fresh.access_token);
};

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
