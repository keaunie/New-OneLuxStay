import { guestyRequest, getAvailabilityAndPricing as getGuestyAvailabilityAndPricing } from "./guestyService.js";
import { fetchListingsFromSupabase } from "./supabaseListingsService.js";
import { supabaseRestRequest } from "./supabaseClient.js";
import { isHiddenUnit } from "../../../src/config/hiddenUnits.js";
import {
  listApaleoProperties,
  listApaleoReservations,
  getApaleoAvailability,
  normalizeApaleoAvailability,
  findApaleoReservationByCode,
} from "./apaleoService.js";

const LISTINGS_TABLE = process.env.SUPABASE_LISTINGS_TABLE || "listings";
const BOOKINGS_TABLE = process.env.SUPABASE_BOOKINGS_TABLE || "bookings";
const AVAILABILITY_TABLE = process.env.SUPABASE_AVAILABILITY_TABLE || "listing_nightly_prices";
const AVAILABILITY_ID_COLUMN =
  process.env.SUPABASE_AVAILABILITY_ID_COLUMN ||
  (String(AVAILABILITY_TABLE).startsWith("property_") ? "property_id" : "listing_id");

const PROVIDERS = {
  APALEO: "apaleo",
  GUESTY: "guesty",
};

const sanitizeString = (value = "", maxLength = 300) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const normalizeDate = (value = "") => {
  const source = sanitizeString(value, 80);
  if (!source) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(source)) return source.slice(0, 10);
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const slugify = (value = "") =>
  sanitizeString(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const toArray = (value) => (Array.isArray(value) ? value : []);

const firstNumber = (...values) => {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
};

const toQueryString = (query = {}) => {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value == null || value === "") return;
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item == null || item === "") return;
        params.append(key, String(item));
      });
      return;
    }
    if (typeof value === "object") {
      params.set(key, JSON.stringify(value));
      return;
    }
    params.set(key, String(value));
  });
  return params.toString();
};

const guestyRequestWithQuery = async (path = "", query = {}) => {
  const qs = toQueryString(query);
  const safePath = String(path || "").startsWith("/") ? String(path) : `/${String(path)}`;
  const fullPath = qs ? `${safePath}?${qs}` : safePath;
  return guestyRequest(fullPath);
};

export const detectPmsProvider = () => PROVIDERS.APALEO;

export const normalizeGuestyProperty = (listing = {}) => ({
  id: sanitizeString(listing?._id || listing?.id || listing?.guesty_listing_id, 120),
  title: sanitizeString(listing?.title || listing?.nickname || listing?.name, 220),
  city: sanitizeString(listing?.city || listing?.address?.city, 120),
  country: sanitizeString(listing?.address?.country || listing?.country, 120),
  address: sanitizeString(listing?.address?.full || listing?.address?.address1 || "", 300),
  provider: PROVIDERS.GUESTY,
  images: toArray(listing?.pictures)
    .map((entry) => sanitizeString(entry?.original || entry?.thumbnail || entry?.url, 800))
    .filter(Boolean),
  amenities: toArray(listing?.amenities)
    .map((entry) => sanitizeString(entry, 120))
    .filter(Boolean),
  raw: listing,
});

export const normalizeGuestyReservation = (reservation = {}) => ({
  id: sanitizeString(
    reservation?._id || reservation?.id || reservation?.confirmationCode || reservation?.number,
    120,
  ),
  guestName: sanitizeString(
    reservation?.guest?.fullName || reservation?.guest?.name || reservation?.guestName || reservation?.name,
    220,
  ),
  checkIn: normalizeDate(reservation?.checkInDateLocalized || reservation?.checkIn),
  checkOut: normalizeDate(reservation?.checkOutDateLocalized || reservation?.checkOut),
  propertyId: sanitizeString(reservation?.listing?._id || reservation?.listingId, 120),
  status: sanitizeString(reservation?.status || "unknown", 80).toLowerCase() || "unknown",
  provider: PROVIDERS.GUESTY,
  raw: reservation,
});

export const normalizeGuestyAvailability = (data = {}, { propertyId = "" } = {}) => ({
  propertyId: sanitizeString(propertyId, 120),
  available: Boolean(data?.available),
  price: firstNumber(data?.nightlyRate, 0) || 0,
  currency: sanitizeString(data?.currency || "USD", 12).toUpperCase() || "USD",
  provider: PROVIDERS.GUESTY,
  raw: data,
});

const uniqueById = (rows = []) => {
  const seen = new Set();
  return rows.filter((row) => {
    const key = sanitizeString(row?.id, 120);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const getNormalizedProperties = async ({ provider = "", city = "", query = {} } = {}) => {
  const selectedProvider = detectPmsProvider({ provider, city, country: query?.country });

  if (selectedProvider === PROVIDERS.APALEO) {
    const rows = await listApaleoProperties({ query });
    return {
      provider: PROVIDERS.APALEO,
      results: uniqueById(rows),
    };
  }

  const supabaseRows = await fetchListingsFromSupabase({
    queryParams: {
      ...query,
      ...(city ? { city } : {}),
    },
  });

  const normalized = toArray(supabaseRows?.results)
    .map((listing) => normalizeGuestyProperty(listing))
    .filter((row) => row.id && !isHiddenUnit(row));

  return {
    provider: PROVIDERS.GUESTY,
    results: uniqueById(normalized),
  };
};

const buildGuestyReservationLookups = (reservationCode = "") => {
  const safeCode = sanitizeString(reservationCode, 120);
  if (!safeCode) return [];

  return [
    { confirmationCode: safeCode },
    { _id: safeCode },
    { id: safeCode },
  ];
};

const findGuestyReservationByCode = async ({ reservationCode = "" } = {}) => {
  const lookups = buildGuestyReservationLookups(reservationCode);
  for (const query of lookups) {
    try {
      const payload = await guestyRequestWithQuery("/reservations", {
        ...query,
        fields:
          "_id confirmationCode status listingId listing._id listing.title listing.nickname guest.fullName checkIn checkOut checkInDateLocalized checkOutDateLocalized",
        limit: 1,
      });
      const list = toArray(payload?.results || payload?.data || payload);
      if (list.length) return normalizeGuestyReservation(list[0]);
    } catch {
      // ignore and continue to next strategy
    }
  }
  return null;
};

export const getNormalizedReservations = async ({
  provider = "",
  city = "",
  query = {},
  reservationCode = "",
} = {}) => {
  const selectedProvider = detectPmsProvider({ provider, city, country: query?.country });

  if (selectedProvider === PROVIDERS.APALEO) {
    if (reservationCode) {
      const match = await findApaleoReservationByCode({ reservationCode });
      return { provider: PROVIDERS.APALEO, results: match ? [match] : [] };
    }
    const rows = await listApaleoReservations({ query });
    return {
      provider: PROVIDERS.APALEO,
      results: uniqueById(rows),
    };
  }

  if (reservationCode) {
    const match = await findGuestyReservationByCode({ reservationCode });
    return { provider: PROVIDERS.GUESTY, results: match ? [match] : [] };
  }

  const payload = await guestyRequestWithQuery("/reservations", {
    ...query,
    fields:
      "_id confirmationCode status listingId listing._id listing.title listing.nickname guest.fullName checkIn checkOut checkInDateLocalized checkOutDateLocalized",
  });

  const list = toArray(payload?.results || payload?.data || payload)
    .map((entry) => normalizeGuestyReservation(entry))
    .filter((row) => row.id);

  return {
    provider: PROVIDERS.GUESTY,
    results: uniqueById(list),
  };
};

export const getNormalizedAvailability = async ({
  provider = "",
  city = "",
  propertyId = "",
  checkIn = "",
  checkOut = "",
  guests = 1,
  query = {},
} = {}) => {
  const selectedProvider = detectPmsProvider({ provider, city, country: query?.country });

  if (selectedProvider === PROVIDERS.APALEO) {
    const rows = await getApaleoAvailability({ propertyId, checkIn, checkOut, guests, query });
    return {
      provider: PROVIDERS.APALEO,
      results: rows.map((entry) => normalizeApaleoAvailability(entry, { propertyId })),
    };
  }

  const availability = await getGuestyAvailabilityAndPricing({
    propertyId,
    checkIn,
    checkOut,
    guests,
  });

  return {
    provider: PROVIDERS.GUESTY,
    results: [normalizeGuestyAvailability(availability, { propertyId })],
  };
};

const buildDateSeries = ({ checkIn = "", checkOut = "" } = {}) => {
  const start = normalizeDate(checkIn);
  const end = normalizeDate(checkOut);
  if (!start || !end) return [];
  const out = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const limit = new Date(`${end}T00:00:00.000Z`);
  while (cursor < limit && out.length < 370) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

export const syncApaleoProperties = async ({ city = "", query = {} } = {}) => {
  const rows = await listApaleoProperties({
    query: {
      ...query,
      ...(city ? { city } : {}),
    },
  });

  if (!rows.length) return { synced: 0, provider: PROVIDERS.APALEO };

  const payload = rows.map((row) => ({
    id: row.id,
    source: "apaleo",
    title: row.title,
    city: row.city,
    city_slug: slugify(row.city),
    currency: "EUR",
    active: true,
    listed: true,
    pms_active: true,
    address: {
      full: row.address,
      city: row.city,
      country: row.country,
    },
    amenities: row.amenities,
    pictures: row.images.map((url) => ({ original: url })),
    metadata: {
      provider: PROVIDERS.APALEO,
      provider_property_id: row.id,
      provider_raw: row.raw || null,
    },
    provider: PROVIDERS.APALEO,
    updated_at: new Date().toISOString(),
  }));

  await supabaseRestRequest(`${LISTINGS_TABLE}?on_conflict=id`, {
    method: "POST",
    body: payload,
    prefer: "resolution=merge-duplicates,return=minimal",
    timeout: 30_000,
  });

  return { synced: payload.length, provider: PROVIDERS.APALEO };
};

export const syncApaleoReservations = async ({ query = {} } = {}) => {
  const rows = await listApaleoReservations({ query });
  if (!rows.length) return { synced: 0, provider: PROVIDERS.APALEO };

  const nowIso = new Date().toISOString();

  const payload = rows.map((row) => ({
    provider: PROVIDERS.APALEO,
    provider_reservation_id: row.id,
    property_id: row.propertyId || "unknown",
    check_in: row.checkIn || nowIso.slice(0, 10),
    check_out: row.checkOut || nowIso.slice(0, 10),
    guest_name: row.guestName || "Guest",
    booking_status: row.status || "unknown",
    guesty_reservation_id: null,
    metadata: {
      provider: PROVIDERS.APALEO,
      provider_reservation_id: row.id,
      raw: row.raw || null,
    },
    updated_at: nowIso,
  }));

  await supabaseRestRequest(`${BOOKINGS_TABLE}?on_conflict=provider,provider_reservation_id`, {
    method: "POST",
    body: payload,
    prefer: "resolution=merge-duplicates,return=minimal",
    timeout: 30_000,
  });

  return { synced: payload.length, provider: PROVIDERS.APALEO };
};

export const syncApaleoAvailability = async ({
  propertyId = "",
  checkIn = "",
  checkOut = "",
  guests = 1,
  query = {},
} = {}) => {
  const rows = await getApaleoAvailability({ propertyId, checkIn, checkOut, guests, query });
  if (!rows.length) return { synced: 0, provider: PROVIDERS.APALEO };

  const dates = buildDateSeries({ checkIn, checkOut });
  const effectiveDates = dates.length ? dates : [normalizeDate(checkIn)].filter(Boolean);

  const payload = [];
  rows.forEach((row) => {
    const normalized = normalizeApaleoAvailability(row, { propertyId });
    const singleDate =
      normalizeDate(row?.date) || normalizeDate(row?.arrivalDate) || normalizeDate(row?.checkInDate);
    const rowDates = singleDate ? [singleDate] : effectiveDates;

    rowDates.forEach((date) => {
      if (!date || !normalized.propertyId) return;
      payload.push({
        [AVAILABILITY_ID_COLUMN]: normalized.propertyId,
        date,
        is_available: normalized.available,
        nightly_rate: firstNumber(normalized.price, 0) || 0,
        cleaning_fee: 0,
        taxes: 0,
        currency: normalized.currency || "EUR",
        source: "apaleo",
        metadata: {
          provider: PROVIDERS.APALEO,
          raw: normalized.raw || null,
        },
        provider: PROVIDERS.APALEO,
        updated_at: new Date().toISOString(),
      });
    });
  });

  if (!payload.length) return { synced: 0, provider: PROVIDERS.APALEO };

  await supabaseRestRequest(`${AVAILABILITY_TABLE}?on_conflict=${AVAILABILITY_ID_COLUMN},date`, {
    method: "POST",
    body: payload,
    prefer: "resolution=merge-duplicates,return=minimal",
    timeout: 30_000,
  });

  return { synced: payload.length, provider: PROVIDERS.APALEO };
};

export const PMS_PROVIDERS = PROVIDERS;
