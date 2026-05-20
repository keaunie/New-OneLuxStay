import { supabaseRestRequest } from "./_shared/supabaseClient.js";

const TABLE = "reservation_requests";

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

const str  = (v, fallback = "") => String(v ?? fallback).trim();
const num  = (v, fallback = 0)  => Number.isFinite(Number(v)) ? Number(v) : fallback;

const computeNights = (checkIn, checkOut) => {
  if (!checkIn || !checkOut) return 0;
  const n = Math.round(
    (Date.parse(checkOut + "T00:00:00") - Date.parse(checkIn + "T00:00:00")) / 86_400_000,
  );
  return n > 0 ? n : 0;
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return jsonResponse(200, {});
  }

  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return jsonResponse(400, { error: "Invalid JSON body" });
  }

  // ── Destructure every camelCase field sent by the frontend ──────────────
  const {
    listingId    = "",
    listingTitle = "",
    imageUrl     = "",
    propertyId   = "",
    propertyName = "",
    city         = "",
    checkIn      = "",
    checkOut     = "",
    guests       = 1,
    guestName    = "",
    guestEmail   = "",
    guestPhone   = "",
    notes        = "",
  } = body;

  // ── Validation ──────────────────────────────────────────────────────────
  if (!str(guestName))  return jsonResponse(400, { error: "guestName is required" });
  if (!str(guestEmail)) return jsonResponse(400, { error: "guestEmail is required" });
  if (!checkIn || !checkOut)  return jsonResponse(400, { error: "checkIn and checkOut are required" });
  if (checkOut <= checkIn)    return jsonResponse(400, { error: "checkOut must be after checkIn" });

  // ── Build exact schema payload ──────────────────────────────────────────
  // Fields must match the reservation_requests table columns exactly.
  // No submitted_at, no special_requests, no legacy names.
  const record = {
    listing_id:    str(listingId),
    listing_title: str(listingTitle),
    image_url:     str(imageUrl),

    property_id:   str(propertyId),
    property_name: str(propertyName),
    city:          str(city),

    check_in:  checkIn,
    check_out: checkOut,

    nights: computeNights(checkIn, checkOut),
    guests: num(guests, 1),

    guest_name:  str(guestName),
    guest_email: str(guestEmail).toLowerCase(),
    guest_phone: str(guestPhone),

    notes:  str(notes),
    status: "pending",
  };

  // ── Defensive: strip any keys whose value is undefined ──────────────────
  const payload = Object.fromEntries(
    Object.entries(record).filter(([, v]) => v !== undefined),
  );

  console.log("[reservation payload]", payload);

  try {
    const rows = await supabaseRestRequest(TABLE, {
      method: "POST",
      body: [payload],
      prefer: "return=representation",
    });

    const inserted = Array.isArray(rows) ? rows[0] : rows;
    return jsonResponse(201, { success: true, id: inserted?.id ?? null });
  } catch (err) {
    console.error("[reservation-request] insert error:", err);
    return jsonResponse(500, { error: err.message || "Failed to save reservation request" });
  }
};
