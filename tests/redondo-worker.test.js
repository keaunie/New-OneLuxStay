import test from "node:test";
import assert from "node:assert/strict";
import { canonicalRedirectUrl, pathRedirectUrl, CANONICAL_HOST } from "../sites/redondobeach/worker.js";

test("redondo.oneluxstay.com redirects to the main Redondo Beach address, keeping path and query", () => {
  assert.equal(canonicalRedirectUrl("https://redondo.oneluxstay.com/"), `https://${CANONICAL_HOST}/`);
  assert.equal(
    canonicalRedirectUrl("https://redondo.oneluxstay.com/residences/barbara-street-3br?utm_source=google"),
    `https://${CANONICAL_HOST}/residences/barbara-street-3br?utm_source=google`,
  );
  assert.equal(canonicalRedirectUrl("http://redondo.oneluxstay.com/explore"), `https://${CANONICAL_HOST}/explore`);
  assert.equal(canonicalRedirectUrl("https://REDONDO.oneluxstay.com/contact"), `https://${CANONICAL_HOST}/contact`);
});

test("the main address and unrelated hosts are not redirected", () => {
  assert.equal(canonicalRedirectUrl(`https://${CANONICAL_HOST}/`), null);
  assert.equal(canonicalRedirectUrl("https://oneluxstay.com/"), null);
  assert.equal(canonicalRedirectUrl("https://notredondo.oneluxstay.com/"), null);
});

test("ad display paths redirect to the real pages and keep the query string", () => {
  const base = `https://${CANONICAL_HOST}`;
  assert.equal(pathRedirectUrl(`${base}/31-night-stays`), `${base}/long-term-stays`);
  assert.equal(pathRedirectUrl(`${base}/furnished-homes/31-night-stays?gclid=abc`), `${base}/long-term-stays?gclid=abc`);
  assert.equal(pathRedirectUrl(`${base}/residences/monthly-stays/`), `${base}/long-term-stays`);
  assert.equal(pathRedirectUrl(`${base}/furnished-homes`), `${base}/residences`);
});

test("real pages and unit pages are not redirected", () => {
  const base = `https://${CANONICAL_HOST}`;
  assert.equal(pathRedirectUrl(`${base}/residences`), null);
  assert.equal(pathRedirectUrl(`${base}/residences/407-north-broadway-unit-1`), null);
  assert.equal(pathRedirectUrl(`${base}/`), null);
});
