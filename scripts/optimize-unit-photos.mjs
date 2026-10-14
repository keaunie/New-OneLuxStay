// Shrinks a folder of full-size unit photos into web-ready WebP files.
// Usage: node scripts/optimize-unit-photos.mjs <sourceDir> <outDir>
// Writes 01.webp (1600px wide, gallery) and 01-sm.webp (800px wide, cards) per photo, in file-name order.
import { mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const [source, out] = process.argv.slice(2);
if (!source || !out) {
  console.error("Usage: node scripts/optimize-unit-photos.mjs <sourceDir> <outDir>");
  process.exit(1);
}

mkdirSync(out, { recursive: true });
const files = readdirSync(source)
  .filter((name) => /\.jpe?g$/i.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

let total = 0;
for (const [index, name] of files.entries()) {
  const id = String(index + 1).padStart(2, "0");
  const image = sharp(join(source, name), { failOn: "none" }).rotate();
  const large = await image.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78 }).toFile(join(out, `${id}.webp`));
  const small = await image.clone().resize({ width: 800, withoutEnlargement: true }).webp({ quality: 74 }).toFile(join(out, `${id}-sm.webp`));
  total += large.size + small.size;
}
console.log(`${files.length} photos -> ${out} (${(total / 1024 / 1024).toFixed(1)} MB)`);
