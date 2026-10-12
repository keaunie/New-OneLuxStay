import { getStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";
import { buildConsentPdf, CONSENT_STORE_NAME, CONSENT_PDF_STORE_NAME } from "./_shared/consentProofService.js";

// Internal lookup used by the Apaleo UI backend: given a reservation (and/or booking) id,
// returns the guest's signed consent proof PDF. Guarded by a shared secret because the
// dossier contains personal data. Not meant to be called from a browser.
//   GET /.netlify/functions/consent-proof-lookup?reservationId=PILVAOAE-1&bookingId=PILVAOAE
//   Header: x-consent-lookup-key: <CONSENT_LOOKUP_SECRET>

const MAX_SCAN = 3000;
const CONCURRENCY = 20;

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const getBlobStore = (name) => {
  const siteID = process.env.NETLIFY_SITE_ID;
  const apiToken = process.env.NETLIFY_API_TOKEN;
  return siteID && apiToken ? getStore(name, { siteID, token: apiToken }) : getStore(name);
};

const secretMatches = (provided, expected) => {
  const a = Buffer.from(String(provided || ""));
  const b = Buffer.from(String(expected || ""));
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
};

const norm = (value) => String(value || "").trim().toLowerCase();

// Runs `check` over keys with bounded concurrency; resolves with the first non-null result.
const findFirst = async (keys, check) => {
  let index = 0;
  let found = null;
  const worker = async () => {
    while (!found && index < keys.length) {
      const key = keys[index++];
      try {
        const result = await check(key);
        if (result && !found) found = result;
      } catch {
        // ignore unreadable entries
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return found;
};

const pdfResponse = (bytes) => ({
  statusCode: 200,
  headers: {
    "Content-Type": "application/pdf",
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline; filename=\"consent-proof.pdf\"",
  },
  isBase64Encoded: true,
  body: Buffer.from(bytes).toString("base64"),
});

export async function handler(event) {
  if (event.httpMethod !== "GET") return jsonResponse(405, { message: "Method Not Allowed" });

  const expectedSecret = process.env.CONSENT_LOOKUP_SECRET;
  if (!expectedSecret) return jsonResponse(503, { message: "Consent lookup is not configured" });
  const headers = event.headers || {};
  if (!secretMatches(headers["x-consent-lookup-key"], expectedSecret)) {
    return jsonResponse(401, { message: "Unauthorized" });
  }

  const wanted = new Set(
    [event.queryStringParameters?.reservationId, event.queryStringParameters?.bookingId]
      .map(norm)
      .filter(Boolean),
  );
  if (!wanted.size) return jsonResponse(400, { message: "Missing reservationId or bookingId" });

  try {
    // 1) The exact PDF originally sent to the guest — its blob metadata carries the reservation/booking id.
    const pdfStore = getBlobStore(CONSENT_PDF_STORE_NAME);
    const { blobs: pdfBlobs = [] } = await pdfStore.list();
    const pdfKey = await findFirst(pdfBlobs.slice(0, MAX_SCAN).map((b) => b.key), async (key) => {
      const entry = await pdfStore.getMetadata(key);
      const meta = entry?.metadata || {};
      return [meta.reservationId, meta.bookingId].some((v) => wanted.has(norm(v))) ? key : null;
    });
    if (pdfKey) {
      const file = await pdfStore.get(pdfKey, { type: "arrayBuffer" });
      if (file) return pdfResponse(file);
    }

    // 2) Fall back to the stored consent record and rebuild the dossier from it.
    const proofStore = getBlobStore(CONSENT_STORE_NAME);
    const { blobs: proofBlobs = [] } = await proofStore.list();
    const record = await findFirst(proofBlobs.slice(0, MAX_SCAN).map((b) => b.key), async (key) => {
      const payload = await proofStore.get(key, { type: "json" });
      return payload && wanted.has(norm(payload.reservationId)) ? payload : null;
    });
    if (record) {
      const bytes = await buildConsentPdf({
        ...record,
        confirmationId: record.confirmationId || record.sessionId,
      });
      return pdfResponse(bytes);
    }

    return jsonResponse(404, { message: "No consent proof on file for this reservation" });
  } catch (error) {
    console.error("[consent-proof-lookup]", error?.message || error);
    return jsonResponse(500, { message: "Consent lookup failed" });
  }
}
