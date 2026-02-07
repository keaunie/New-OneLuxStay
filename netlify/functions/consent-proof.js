import { getStore } from "@netlify/blobs";

const CONSENT_PDF_STORE_NAME = "consent-proof-pdfs";

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const getPdfStore = async () => {
  try {
    const siteID = process.env.NETLIFY_SITE_ID;
    const apiToken = process.env.NETLIFY_API_TOKEN;
    return siteID && apiToken
      ? getStore(CONSENT_PDF_STORE_NAME, { siteID, token: apiToken })
      : getStore(CONSENT_PDF_STORE_NAME);
  } catch {
    return null;
  }
};

export async function handler(event) {
  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const token = event.queryStringParameters?.token || "";
  if (!token) {
    return jsonResponse(400, { message: "Missing token" });
  }

  const store = await getPdfStore();
  if (!store) {
    return jsonResponse(500, { message: "Consent proof storage unavailable" });
  }

  const file = await store.get(token, { type: "arrayBuffer" });
  if (!file) {
    return jsonResponse(404, { message: "Consent proof not found" });
  }

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Cache-Control": "private, max-age=300",
      "Content-Disposition": "inline; filename=\"consent-proof.pdf\"",
    },
    isBase64Encoded: true,
    body: Buffer.from(file).toString("base64"),
  };
}

