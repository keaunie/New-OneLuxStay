import { jsonResponse } from "./_shared/http.js";
import { listApaleoUnitGroups } from "./_shared/apaleoService.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const query = event.queryStringParameters || {};
  const city = String(query.city || "Antwerp").trim();
  const propertyId = String(query.propertyId || query.property_id || "").trim();
  const limit = Number(query.limit || 0) || undefined;
  const startedAt = Date.now();

  try {
    const results = await listApaleoUnitGroups({
      query: {
        ...(propertyId ? { propertyId } : {}),
        ...(limit ? { limit } : {}),
      },
    });

    return jsonResponse(200, {
      ok: true,
      provider: "apaleo",
      city,
      count: results.length,
      results,
      durationMs: Date.now() - startedAt,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[apaleo-unit-groups] failed", {
      message: error?.message || String(error),
      city,
      propertyId,
    });
    return jsonResponse(502, {
      ok: false,
      provider: "apaleo",
      city,
      message: "Unable to fetch Apaleo unit groups",
      error: error?.message || String(error),
      durationMs: Date.now() - startedAt,
    });
  }
}

