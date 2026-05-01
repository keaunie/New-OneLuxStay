import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCityGuideEmailTemplate } from "../netlify/functions/_shared/cityGuideEmailTemplate.js";

const argv = process.argv.slice(2);

const readFlag = (name, fallback = "") => {
  const idx = argv.findIndex((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (idx === -1) return fallback;
  const token = argv[idx];
  if (token.includes("=")) return token.split("=").slice(1).join("=");
  const next = argv[idx + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
};

const citySlug =
  readFlag("city", "") ||
  (argv.find((arg) => !arg.startsWith("--")) || "antwerp");
const fullName = readFlag("name", "Guest");
const checkIn = readFlag("checkIn", "");
const checkOut = readFlag("checkOut", "");
const baseUrl = readFlag("baseUrl", "https://oneluxstay.com");

const template = buildCityGuideEmailTemplate({
  baseUrl,
  citySlug,
  fullName,
  checkIn,
  checkOut,
  reservationId: readFlag("reservationId", ""),
});

if (template?.skipped) {
  console.error(`[preview] Skipped: ${template?.reason || "Unknown reason"}`);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outDir = path.join(repoRoot, "audit-reports");
const safeSlug = String(citySlug || "city").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
const outHtml = path.join(outDir, `city-guide-email-preview-${safeSlug}.html`);
const outTxt = path.join(outDir, `city-guide-email-preview-${safeSlug}.txt`);

await fs.mkdir(outDir, { recursive: true });
const htmlDoc = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${template.subject}</title>
  </head>
  <body style="margin:0; padding:0;">
${template.html}
  </body>
</html>
`;
await fs.writeFile(outHtml, htmlDoc, "utf8");
await fs.writeFile(outTxt, template.text, "utf8");

console.log(`[preview] Subject: ${template.subject}`);
console.log(`[preview] City: ${template.cityName}`);
console.log(`[preview] Guide URL: ${template.guideUrl}`);
console.log(`[preview] HTML: ${outHtml}`);
console.log(`[preview] Text: ${outTxt}`);
