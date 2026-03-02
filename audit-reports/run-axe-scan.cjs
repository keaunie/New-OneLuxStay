const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const AxeBuilder = require("@axe-core/playwright").default;

const base = "http://127.0.0.1:4173";
const routes = [
  "/",
  "/?checkout=cancelled",
  "/antwerp",
  "/los-angeles",
  "/miami-beach",
  "/redondo-beach",
  "/dubai",
  "/listings",
  "/global",
  "/privacy-policy",
  "/terms",
  "/california-privacy-policy",
  "/acknowledge",
  "/booking-confirmation"
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const results = [];

  for (const route of routes) {
    const url = `${base}${route}`;
    const started = Date.now();
    let status = "ok";
    let error = null;
    let axe = null;

    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
      await page.waitForTimeout(4500);
      axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .analyze();
    } catch (e) {
      status = "error";
      error = e && e.message ? e.message : String(e);
    }

    results.push({
      route,
      url,
      status,
      error,
      durationMs: Date.now() - started,
      violations: axe ? axe.violations : [],
      incomplete: axe ? axe.incomplete : [],
      passes: axe ? axe.passes.length : 0,
      inapplicable: axe ? axe.inapplicable.length : 0
    });
  }

  await browser.close();

  const outDir = path.join(process.cwd(), "audit-reports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "axe-report.json");
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), base, results }, null, 2));

  for (const entry of results) {
    const count = entry.violations ? entry.violations.length : 0;
    console.log(`${entry.route}\t${entry.status}\tviolations=${count}`);
  }
})();
