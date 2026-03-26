import fs from "node:fs";
import path from "node:path";

const FUNCTIONS_DIR = path.join(process.cwd(), "netlify", "functions");

const EXTRA_DYNAMIC_KEYS = [
  // Read via helper indirection in _shared/guestyEnv.js
  "GUESTY_OPEN_API_CLIENT_ID",
  "GUESTY_OPEN_API_CLIENT_SECRET",
  "GUESTY_CLIENT_ID",
  "GUESTY_CLIENT_SECRET",
  // Chat function reads through getEnv()
  "OPENAI_API_KEY",
  "OPENAI_CHAT_MODEL",
  "OPENAI_AI_QUERY_MODEL",
  "OPENAI_EMBEDDING_MODEL",
  "AI_QUERY_FUNCTIONS_BASE",
  "SUPABASE_AI_MATCH_RPC",
];

const walkJsFiles = (dir, out = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) out.push(fullPath);
  }
  return out;
};

const extractEnvKeys = (source) => {
  const keys = new Set();
  const directRegex = /process\.env\.([A-Z0-9_]+)/g;
  let match;
  while ((match = directRegex.exec(source))) keys.add(match[1]);
  return keys;
};

const normalizeNames = (names) =>
  names
    .map((raw) => String(raw || "").trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s*/, ""))
    .map((line) => line.split("=")[0].trim())
    .filter((line) => /^[A-Z0-9_]+$/.test(line));

const fileArg = process.argv[2];
const files = walkJsFiles(FUNCTIONS_DIR);
const usedSet = new Set(EXTRA_DYNAMIC_KEYS);

for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  for (const key of extractEnvKeys(source)) usedSet.add(key);
}

const used = [...usedSet].sort();

console.log("Function runtime env keys used by code:");
for (const key of used) console.log(`- ${key}`);

if (fileArg) {
  const candidateRaw = fs.readFileSync(path.resolve(process.cwd(), fileArg), "utf8");
  const candidates = normalizeNames(candidateRaw.split(/\r?\n/));
  const candidateSet = new Set(candidates);
  const required = candidates.filter((key) => usedSet.has(key)).sort();
  const unused = candidates.filter((key) => !usedSet.has(key)).sort();

  console.log("");
  console.log(`Compared with: ${fileArg}`);
  console.log("");
  console.log("Keep for Functions scope (present in code):");
  for (const key of required) console.log(`- ${key}`);
  console.log("");
  console.log("Safe to remove from Functions scope (not referenced in functions code):");
  for (const key of unused) console.log(`- ${key}`);
  console.log("");
  console.log(
    "Tip: if these are only needed by the frontend build, keep them in Build scope only."
  );

  const approxBytes = required.reduce((sum, key) => sum + key.length + 1, 0);
  console.log(
    `Approx minimum key-only footprint for required vars: ${approxBytes} bytes (values not included).`
  );
}
