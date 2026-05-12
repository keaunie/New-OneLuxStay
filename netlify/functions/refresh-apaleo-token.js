import { jsonResponse } from "./_shared/http.js";
import { refreshApaleoToken, getApaleoAccount } from "./_shared/apaleoService.js";

const isTruthy = (value = "") => ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET" && event.httpMethod !== "POST") {
    return jsonResponse(405, {
      ok: false,
      provider: "apaleo",
      message: "Method Not Allowed",
    });
  }

  const query = event.queryStringParameters || {};
  const payload = event.httpMethod === "POST" ? JSON.parse(event.body || "{}") : {};
  const includeAccount = isTruthy(query.includeAccount || payload.includeAccount || "1");
  const startedAt = Date.now();

  console.info("[refresh-apaleo-token] invoked", {
    includeAccount,
    context: process.env.CONTEXT || "unknown",
  });

  try {
    const tokenData = await refreshApaleoToken();
    const account = includeAccount
      ? await getApaleoAccount({
          accessToken: tokenData?.token || "",
          forceRefresh: false,
        }).catch((error) => {
          console.warn("[refresh-apaleo-token] account lookup warning", {
            message: error?.message || String(error),
          });
          return null;
        })
      : null;

    return jsonResponse(200, {
      ok: true,
      provider: "apaleo",
      refreshed: true,
      expiresAt: Number(tokenData?.expiresAt || 0) || null,
      tokenSource: "fresh",
      account: account
        ? {
            id: account.id || null,
            code: account.code || null,
            name: account.name || null,
          }
        : null,
      durationMs: Date.now() - startedAt,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[refresh-apaleo-token] failed", {
      message: error?.message || String(error),
      code: error?.code || null,
      stage: error?.stage || null,
    });
    return jsonResponse(502, {
      ok: false,
      provider: "apaleo",
      message: "Unable to refresh Apaleo token",
      error: error?.message || String(error),
      errorCode: error?.code || "APALEO_REFRESH_FAILED",
      stage: error?.stage || null,
      durationMs: Date.now() - startedAt,
    });
  }
}

