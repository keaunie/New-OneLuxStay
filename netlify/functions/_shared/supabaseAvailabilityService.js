import { calculateNights, roundMoney } from "./pricingService.js";
import {
  isSupabaseEnforced,
  parseEnvBoolean,
  shouldUseSupabaseProvider,
  supabaseRestRequest,
} from "./supabaseClient.js";

const SUPABASE_AVAILABILITY_TABLE = process.env.SUPABASE_AVAILABILITY_TABLE || "listing_nightly_prices";

const normalizeString = (value) => String(value || "").trim();

const firstFiniteNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const toIsoDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const enumerateNights = (checkIn, checkOut) => {
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];

  const dates = [];
  const cursor = new Date(start);
  while (cursor < end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
};

const guestCountAllowed = (row, guests) => {
  const minGuests = firstFiniteNumber(row?.min_guests, row?.minimum_guests, row?.minOccupancy);
  const maxGuests = firstFiniteNumber(row?.max_guests, row?.maximum_guests, row?.maxOccupancy);
  if (Number.isFinite(minGuests) && guests < minGuests) return false;
  if (Number.isFinite(maxGuests) && guests > maxGuests) return false;
  return true;
};

const isRowAvailable = (row) => {
  if (!row || typeof row !== "object") return false;
  if (typeof row.is_available === "boolean") return row.is_available;
  if (typeof row.available === "boolean") return row.available;

  const status = normalizeString(row.status).toLowerCase();
  if (!status) return true;
  if (["available", "open", "free"].includes(status)) return true;
  if (["blocked", "unavailable", "booked", "closed"].includes(status)) return false;
  return true;
};

const normalizePricing = (rows, expectedNights) => {
  const sorted = [...rows].sort((a, b) => String(a.date || a.night).localeCompare(String(b.date || b.night)));
  const roomTotal = roundMoney(
    sorted.reduce((sum, row) => sum + (firstFiniteNumber(row?.nightly_rate, row?.night_price, row?.rate, 0) || 0), 0),
  );
  const nights = Math.max(0, expectedNights || sorted.length);
  const nightlyRate = nights > 0 ? roundMoney(roomTotal / nights) : 0;

  const cleaningFee = roundMoney(
    firstFiniteNumber(
      ...sorted.map((row) => row?.cleaning_fee),
      ...sorted.map((row) => row?.cleaningFee),
      0,
    ) || 0,
  );

  const taxes = roundMoney(
    firstFiniteNumber(
      ...sorted.map((row) => row?.taxes),
      ...sorted.map((row) => row?.tax_amount),
      ...sorted.map((row) => row?.taxAmount),
      0,
    ) || 0,
  );

  const currency =
    normalizeString(sorted[0]?.currency || sorted[0]?.currency_code || process.env.SUPABASE_DEFAULT_CURRENCY || "USD").toUpperCase() ||
    "USD";

  return { nightlyRate, cleaningFee, taxes, currency, nights };
};

export const isSupabaseAvailabilityEnabled = () =>
  shouldUseSupabaseProvider("availability") ||
  shouldUseSupabaseProvider("pricing") ||
  parseEnvBoolean(process.env.SUPABASE_USE_FOR_AVAILABILITY, false);

export const getAvailabilityAndPricingFromSupabase = async ({
  propertyId,
  checkIn,
  checkOut,
  guests = 1,
} = {}) => {
  const listingId = normalizeString(propertyId);
  const normalizedCheckIn = toIsoDate(checkIn);
  const normalizedCheckOut = toIsoDate(checkOut);
  const guestCount = Math.max(1, Number(guests) || 1);

  if (!listingId || !normalizedCheckIn || !normalizedCheckOut) {
    throw new Error("Supabase availability requires propertyId, checkIn, and checkOut");
  }

  const nights = calculateNights(normalizedCheckIn, normalizedCheckOut);
  const expectedDates = enumerateNights(normalizedCheckIn, normalizedCheckOut);
  if (!nights || !expectedDates.length) {
    return {
      available: false,
      nightlyRate: 0,
      cleaningFee: 0,
      taxes: 0,
      currency: "USD",
      nights: 0,
    };
  }

  const rows = await supabaseRestRequest(SUPABASE_AVAILABILITY_TABLE, {
    query: {
      select: "*",
      or: `(listing_id.eq.${listingId},property_id.eq.${listingId})`,
      date: `gte.${normalizedCheckIn}`,
      order: "date.asc",
      limit: Math.max(14, nights + 7),
    },
  });

  const availabilityRows = Array.isArray(rows)
    ? rows.filter((row) => {
        const date = toIsoDate(row?.date || row?.night || "");
        return date && date >= normalizedCheckIn && date < normalizedCheckOut;
      })
    : [];

  const byDate = new Map(
    availabilityRows.map((row) => [toIsoDate(row?.date || row?.night || ""), row]),
  );
  const selectedRows = expectedDates
    .map((date) => byDate.get(date))
    .filter(Boolean);

  if (selectedRows.length !== expectedDates.length) {
    return {
      available: false,
      nightlyRate: 0,
      cleaningFee: 0,
      taxes: 0,
      currency: "USD",
      nights,
    };
  }

  const hasUnavailableDay = selectedRows.some((row) => !isRowAvailable(row) || !guestCountAllowed(row, guestCount));
  if (hasUnavailableDay) {
    return {
      available: false,
      nightlyRate: 0,
      cleaningFee: 0,
      taxes: 0,
      currency: "USD",
      nights,
    };
  }

  const minNights = firstFiniteNumber(selectedRows[0]?.min_nights, selectedRows[0]?.minimum_nights, 1) || 1;
  if (nights < minNights) {
    return {
      available: false,
      nightlyRate: 0,
      cleaningFee: 0,
      taxes: 0,
      currency: "USD",
      nights,
    };
  }

  return {
    available: true,
    ...normalizePricing(selectedRows, nights),
  };
};

export const shouldFallbackToGuestyOnSupabaseError = () => !isSupabaseEnforced();
