import test from "node:test";
import assert from "node:assert/strict";
import { canonicalRedirectUrl, CANONICAL_HOST } from "../sites/redondobeach/worker.js";

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
