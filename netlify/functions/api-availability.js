import { getAvailabilityAndPricing } from "./_shared/availabilityService.js";
import { calculatePrice } from "./_shared/pricingService.js";
import { jsonResponse } from "./_shared/http.js";

export async function handler(event) {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }

  if (event.httpMethod !== "GET") {
    return jsonResponse(405, { message: "Method Not Allowed" });
  }

  const query = event.queryStringParameters || {};
  const propertyId = String(query.property_id || query.propertyId || "").trim();
  const checkIn = String(query.check_in || query.checkIn || "").trim();
  const checkOut = String(query.check_out || query.checkOut || "").trim();
  const guests = Math.max(1, Number(query.guests || 1) || 1);

  if (!propertyId || !checkIn || !checkOut) {
    return jsonResponse(400, {
      message: "Missing property_id, check_in, or check_out",
    });
  }

  try {
    const availability = await getAvailabilityAndPricing({
      propertyId,
      checkIn,
      checkOut,
      guests,
    });

    if (!availability.available) {
      return jsonResponse(200, {
        available: false,
        nightly_rate: 0,
        cleaning_fee: 0,
        taxes: 0,
        security_deposit: 0,
        currency: "USD",
        room_total: 0,
        fees: 0,
        grand_total: 0,
      });
    }

    const calculated = calculatePrice({
      nightlyRate: availability.nightlyRate,
      numberOfNights: availability.nights,
      cleaningFee: availability.cleaningFee,
      taxes: availability.taxes,
      securityDeposit: availability.securityDeposit || 0,
      currency: availability.currency,
    });

    return jsonResponse(200, {
      available: true,
      nightly_rate: calculated.nightly_rate,
      cleaning_fee: calculated.cleaning_fee,
      taxes: calculated.taxes,
      security_deposit: calculated.security_deposit,
      currency: calculated.currency,
      room_total: calculated.room_total,
      fees: calculated.fees,
      grand_total: calculated.grand_total,
    });
  } catch (error) {
    return jsonResponse(502, {
      message: "Unable to fetch availability from Guesty",
      error: error?.message || String(error),
    });
  }
}
