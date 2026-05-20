/**
 * apaleo-create-reservation
 *
 * Creates a real Apaleo booking via POST /booking/v1/bookings, then persists
 * the result into Supabase reservation_requests.
 *
 * Required Apaleo scope: distribution:reservations.manage  (must be in APALEO_SCOPE env var)
 * Required Supabase columns (run migration below if missing):
 *   ALTER TABLE reservation_requests
 *     ADD COLUMN IF NOT EXISTS apaleo_booking_id     text,
 *     ADD COLUMN IF NOT EXISTS apaleo_reservation_id text;
 */

import { apaleoRequest } from "./_shared/apaleoService.js";
import { supabaseRestRequest } from "./_shared/supabaseClient.js";

const TABLE            = "reservation_requests";
const BOOKINGS_ENDPOINT = process.env.APALEO_BOOKINGS_ENDPOINT || "/booking/v1/bookings";
const CHANNEL_CODE     = process.env.APALEO_CHANNEL_CODE || "Direct";

// ── Helpers ──────────────────────────────────────────────────────────────────

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  },
  body: JSON.stringify(body),
});

const str = (v, fallback = "") => String(v ?? fallback).trim();
const num = (v, fallback = 0)  => Number.isFinite(Number(v)) ? Number(v) : fallback;

const computeNights = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  const n = Math.round(
    (Date.parse(`${checkOut}T00:00:00`) - Date.parse(`${checkIn}T00:00:00`)) / 86_400_000,
  );
  return n > 0 ? n : 0;
};

// Split "Jane Smith" → { firstName: "Jane", lastName: "Smith" }
// Handles single-word names gracefully.
const splitGuestName = (fullName) => {
  const parts = str(fullName).split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0]  || "Guest",
    lastName:  parts.slice(1).join(" ") || "",
  };
};

// ── Handler ───────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return jsonResponse(200, {});
  if (event.httpMethod !== "POST")    return jsonResponse(405, { error: "Method not allowed" });

  // ── 1. Parse body ───────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  const {
    listingId    = "",   // Apaleo unit group ID  (set by ReservationModal)
    listingTitle = "",
    imageUrl     = "",
    propertyId   = "",   // Apaleo property ID    (set by ReservationModal)
    propertyName = "",
    city         = "",
    checkIn      = "",
    checkOut     = "",
    guests       = 1,
    guestName    = "",
    guestEmail   = "",
    guestPhone   = "",
    notes        = "",
    ratePlanId   = "",   // optional — pass from frontend or set APALEO_DEFAULT_RATE_PLAN_ID
  } = body;

  // ── 2. Validate ─────────────────────────────────────────────────────────────
  if (!str(guestName))   return jsonResponse(400, { error: "guestName is required" });
  if (!str(guestEmail))  return jsonResponse(400, { error: "guestEmail is required" });
  if (!checkIn || !checkOut) return jsonResponse(400, { error: "checkIn and checkOut are required" });
  if (checkOut <= checkIn)   return jsonResponse(400, { error: "checkOut must be after checkIn" });
  if (!str(listingId))   return jsonResponse(400, { error: "listingId (Apaleo unitGroupId) is required" });
  if (!str(propertyId))  return jsonResponse(400, { error: "propertyId (Apaleo propertyId) is required" });

  const { firstName, lastName } = splitGuestName(guestName);
  const adults      = Math.max(1, num(guests, 1));
  const nights      = computeNights(checkIn, checkOut);
  const unitGroupId = str(listingId);

  // ── 3a. Resolve ratePlanId ───────────────────────────────────────────────────
  // Priority: request body → env var → dynamic lookup via /booking/v1/rate-plans
  let resolvedRatePlanId =
    str(ratePlanId) ||
    str(process.env.APALEO_DEFAULT_RATE_PLAN_ID || "");

  if (!resolvedRatePlanId) {
    try {
      const ratePlanResponse = await apaleoRequest("/booking/v1/rate-plans", {
        method:    "GET",
        query:     { propertyId: str(propertyId), unitGroupId },
        timeoutMs: 15_000,
      });

      const plans = ratePlanResponse?.payload?.ratePlans ?? ratePlanResponse?.payload ?? [];
      console.log("[apaleo-create-reservation] rate plans", JSON.stringify(plans, null, 2));

      // Prefer an active / public plan; fall back to whatever comes first
      const active = plans.find(
        (p) => p.isActive !== false && (p.channelCode === "Direct" || !p.channelCode),
      ) || plans[0] || null;

      resolvedRatePlanId = str(active?.id || "");
      console.log("[apaleo-create-reservation] selected ratePlanId", resolvedRatePlanId);
    } catch (err) {
      console.error("[apaleo-create-reservation] rate plan lookup failed", err.message);
    }
  }

  if (!resolvedRatePlanId) {
    return jsonResponse(422, {
      ok:    false,
      error: "No valid Apaleo rate plan found for this property and unit group. Set APALEO_DEFAULT_RATE_PLAN_ID or ensure rate plans are configured in Apaleo.",
      code:  "NO_RATE_PLAN",
    });
  }

  // ── 3b. Build Apaleo booking payload ────────────────────────────────────────
  // POST /booking/v1/bookings
  // timeSlices is required by the Apaleo Booking API — omitting it causes 422.
  const bookingPayload = {
    booker: {
      firstName,
      ...(lastName        ? { lastName }                       : {}),
      email: str(guestEmail).toLowerCase(),
      ...(str(guestPhone) ? { phone: str(guestPhone) }         : {}),
    },
    reservations: [
      {
        arrival:     checkIn,
        departure:   checkOut,
        adults,
        channelCode: CHANNEL_CODE,
        property:    { id: str(propertyId) },

        // Guest contact embedded at reservation level
        primaryGuest: {
          firstName,
          ...(lastName        ? { lastName }                   : {}),
          email: str(guestEmail).toLowerCase(),
          ...(str(guestPhone) ? { phone: str(guestPhone) }     : {}),
        },

        // Required: one timeSlice covering the full stay
        timeSlices: [
          {
            arrival:     checkIn,
            departure:   checkOut,
            unitGroupId,
            ratePlanId:  resolvedRatePlanId,
          },
        ],

        ...(str(notes) ? { comment: str(notes).slice(0, 500) } : {}),
      },
    ],
  };

  console.log(
    "[apaleo-create-reservation] FINAL PAYLOAD",
    JSON.stringify(bookingPayload, null, 2),
  );

  // ── 4. Call Apaleo Booking API (POST /booking/v1/bookings) ──────────────────
  let apaleoBookingId     = null;
  let apaleoReservationId = null;

  try {
    const response = await apaleoRequest(BOOKINGS_ENDPOINT, {
      method:    "POST",
      body:      bookingPayload,
      timeoutMs: 30_000,
      retries:   0,  // no retries for writes — avoid duplicate bookings
    });

    apaleoBookingId     = str(response?.payload?.id);
    apaleoReservationId = str(response?.payload?.reservations?.[0]?.id);

    console.log("[apaleo-create-reservation] booking created", {
      apaleoBookingId,
      apaleoReservationId,
      statusCode: response?.statusCode,
    });
  } catch (err) {
    // Always log both the payload we sent AND the full Apaleo response body
    console.error("[apaleo-create-reservation] payload", JSON.stringify(bookingPayload, null, 2));
    console.error("[apaleo-create-reservation] response", {
      status:     err.statusCode,
      statusText: err.statusText || "",
      body:       err.payload    || null,
    });

    // 403 — OAuth scope missing distribution:reservations.manage
    if (Number(err.statusCode) === 403) {
      return jsonResponse(503, {
        ok:    false,
        error: "Apaleo reservation creation is not authorised. Ensure APALEO_SCOPE includes distribution:reservations.manage and re-deploy.",
        code:  "APALEO_SCOPE_INSUFFICIENT",
        apaleoError: err.payload || null,
        payload:     bookingPayload,
      });
    }

    // 422 — Apaleo validation failure: expose everything so we can diagnose
    if (Number(err.statusCode) === 422) {
      console.error("[apaleo-create-reservation] 422 full Apaleo error", JSON.stringify(err.payload, null, 2));
      return jsonResponse(422, {
        ok:    false,
        error: err.message || "Apaleo rejected the booking request.",
        code:  "APALEO_VALIDATION_FAILED",
        apaleoError: err.payload  || null,   // full Apaleo validation response
        payload:     bookingPayload,          // exact body we sent — compare against apaleoError
      });
    }

    return jsonResponse(502, {
      ok:          false,
      error:       err.message || "Failed to create Apaleo reservation",
      code:        err.code    || "APALEO_BOOKING_FAILED",
      apaleoError: err.payload || null,
      payload:     bookingPayload,
    });
  }

  // ── 5. Persist to Supabase ───────────────────────────────────────────────────
  // Supabase failure is non-fatal — the Apaleo booking was already created.
  // Strip undefined values to avoid schema cache errors.
  const record = Object.fromEntries(
    Object.entries({
      listing_id:            str(listingId),
      listing_title:         str(listingTitle),
      image_url:             str(imageUrl),

      property_id:           str(propertyId),
      property_name:         str(propertyName),
      city:                  str(city),

      check_in:              checkIn,
      check_out:             checkOut,
      nights,
      guests:                adults,

      guest_name:            str(guestName),
      guest_email:           str(guestEmail).toLowerCase(),
      guest_phone:           str(guestPhone),

      notes:                 str(notes),
      status:                "confirmed",

      apaleo_booking_id:     apaleoBookingId     || null,
      apaleo_reservation_id: apaleoReservationId || null,
    }).filter(([, v]) => v !== undefined),
  );

  console.log("[apaleo-create-reservation] Supabase record", record);

  let supabaseId = null;
  try {
    const rows = await supabaseRestRequest(TABLE, {
      method: "POST",
      body:   [record],
      prefer: "return=representation",
    });
    supabaseId = (Array.isArray(rows) ? rows[0] : rows)?.id ?? null;
  } catch (err) {
    // Log but do not fail — the Apaleo booking already exists
    console.error("[apaleo-create-reservation] Supabase save warning (non-fatal):", err.message);
  }

  // ── 6. Return confirmation ───────────────────────────────────────────────────
  return jsonResponse(201, {
    success:            true,
    apaleoBookingId,
    apaleoReservationId,
    status:             "confirmed",
    id:                 supabaseId,
    message:            `Booking confirmed. Reference: ${apaleoBookingId || apaleoReservationId}`,
  });
};
