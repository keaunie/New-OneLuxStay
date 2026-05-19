import { jsonResponse } from "./_shared/http.js";
import {
  getApaleoAccessToken,
  refreshApaleoToken,
  getApaleoAccount,
  getCachedApaleoToken,
} from "./_shared/apaleoService.js";

const isTruthy = (value = "") => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") {
      return jsonResponse(200, { ok: true });
    }

    if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
      return jsonResponse(405, { message: "Method Not Allowed" });
    }

    const query = event.queryStringParameters || {};
    const payload = event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : {};
    const forceRefresh = isTruthy(query.forceRefresh || payload.forceRefresh);
    const debug = isTruthy(query.debug || payload.debug);

    console.log("[apaleo-token] request start", {
      method: event.httpMethod,
      forceRefresh,
      debug,
    });
    console.log("CLIENT ID:", !!process.env.APALEO_CLIENT_ID);
    console.log("CLIENT SECRET:", !!process.env.APALEO_CLIENT_SECRET);
    console.log("ACCOUNT ID:", process.env.APALEO_ACCOUNT_ID);

    const tokenInfo = forceRefresh
      ? { ...(await refreshApaleoToken()), source: "fresh" }
      : (await getCachedApaleoToken()) || (await getApaleoAccessToken());
    let accountLookupError = "";
    const account = await getApaleoAccount({
      accessToken: tokenInfo?.token || "",
      forceRefresh,
    }).catch((error) => {
      accountLookupError = error?.message || String(error);
      console.warn("[apaleo-token] account lookup warning", {
        message: accountLookupError,
      });
      return null;
    });

    return jsonResponse(200, {
      ok: true,
      provider: "apaleo",
      tokenSource: tokenInfo.source || "unknown",
      hasToken: Boolean(tokenInfo.token),
      expiresAt: Number(tokenInfo?.expiresAt || 0) || null,
      account: account
        ? {
            id: account.id || null,
            code: account.code || null,
            name: account.name || null,
          }
        : null,
      ...(debug && accountLookupError ? { accountLookupError } : {}),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("APALEO TOKEN FATAL ERROR");
    console.error(error);
    console.error(error?.stack);

    console.error("[apaleo-token] token retrieval failed", {
      message: error?.message || String(error),
      code: error?.code || null,
      stage: error?.stage || null,
    });

    // Return stack only when explicitly requested (debug=1) to avoid leaking internals by default.
    const query = event?.queryStringParameters || {};
    const debug = isTruthy(query.debug);

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        provider: "apaleo",
        message: "Unable to fetch Apaleo token",
        error: error?.message || String(error),
        errorCode: error?.code || "APALEO_TOKEN_UNAVAILABLE",
        stage: error?.stage || null,
        ...(debug ? { stack: error?.stack || null } : {}),
      }),
    };
  }
}
