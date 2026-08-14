import { jsonResponse } from "./_shared/http.js";
import { getBookingProperties } from "./_shared/apaleoBookingService.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, { ok: true });
  if (event.httpMethod !== "GET") return jsonResponse(405, { message: "Method Not Allowed" });
  try {
    const properties = await getBookingProperties();
    return jsonResponse(200, {
      success: true,
      provider: "apaleo",
      source: "apaleo_inventory_api",
      count: properties.length,
      properties,
    });
  } catch (error) {
    return jsonResponse(Number(error.statusCode) || 502, { message: error.message, code: error.code || "APALEO_PROPERTIES_FAILED" });
  }
}
