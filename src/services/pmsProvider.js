import apiBase from "../utils/apiBase";
import {
  fetchApaleoProperties,
  fetchApaleoReservations,
  fetchApaleoAvailability,
} from "./apaleoService.js";

export const PMS_PROVIDERS = {
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

const isAntwerpCity = (value = "") => {
  const normalized = sanitizeString(value, 180).toLowerCase();
  return /(antwerp|antwerpen|anvers|belgium|belgie|belgique)/.test(normalized);
};

export const detectPmsProvider = ({ city = "", country = "", provider = "" } = {}) => {
  const explicit = sanitizeString(provider, 40).toLowerCase();
  if (explicit === PMS_PROVIDERS.APALEO || explicit === PMS_PROVIDERS.GUESTY) return explicit;
  if (isAntwerpCity([city, country].join(" "))) return PMS_PROVIDERS.APALEO;
  return PMS_PROVIDERS.GUESTY;
};

const request = async (path) => {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Accept: "application/json" },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || payload?.error || `PMS request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
};

const normalizeGuestyProperty = (listing = {}) => ({
  id: sanitizeString(listing?._id || listing?.id || listing?.guesty_listing_id, 120),
  title: sanitizeString(listing?.title || listing?.nickname || listing?.name, 220),
  city: sanitizeString(listing?.city || listing?.address?.city, 120),
  country: sanitizeString(listing?.address?.country || listing?.country, 120),
  address: sanitizeString(listing?.address?.full || listing?.address?.address1 || "", 300),
  provider: PMS_PROVIDERS.GUESTY,
  images: Array.isArray(listing?.pictures)
    ? listing.pictures
        .map((entry) => sanitizeString(entry?.original || entry?.thumbnail || entry?.url, 800))
        .filter(Boolean)
    : [],
  amenities: Array.isArray(listing?.amenities)
    ? listing.amenities.map((entry) => sanitizeString(entry, 120)).filter(Boolean)
    : [],
  raw: listing,
});

const normalizeGuestyReservation = (reservation = {}) => ({
  id: sanitizeString(
    reservation?._id || reservation?.id || reservation?.confirmationCode || reservation?.number,
    120,
  ),
  guestName: sanitizeString(reservation?.guest?.fullName || reservation?.guestName || "", 220),
  checkIn: normalizeDate(reservation?.checkInDateLocalized || reservation?.checkIn),
  checkOut: normalizeDate(reservation?.checkOutDateLocalized || reservation?.checkOut),
  propertyId: sanitizeString(reservation?.listing?._id || reservation?.listingId, 120),
  status: sanitizeString(reservation?.status || "unknown", 80).toLowerCase() || "unknown",
  provider: PMS_PROVIDERS.GUESTY,
  raw: reservation,
});

const normalizeGuestyAvailability = (payload = {}, { propertyId = "" } = {}) => ({
  propertyId: sanitizeString(propertyId, 120),
  available: Boolean(payload?.available),
  price: Number(payload?.nightly_rate ?? payload?.nightlyRate ?? 0) || 0,
  currency: sanitizeString(payload?.currency || "USD", 12).toUpperCase() || "USD",
  provider: PMS_PROVIDERS.GUESTY,
  raw: payload,
});

export const getProperties = async ({ city = "", provider = "" } = {}) => {
  const selectedProvider = detectPmsProvider({ city, provider });
  if (selectedProvider === PMS_PROVIDERS.APALEO) {
    const payload = await fetchApaleoProperties({ city: city || "Antwerp" });
    return {
      provider: PMS_PROVIDERS.APALEO,
      results: Array.isArray(payload?.results) ? payload.results : [],
    };
  }

  const qs = new URLSearchParams({
    ...(city ? { city } : {}),
    limit: "100",
  }).toString();
  const payload = await request(`/listings?${qs}`);
  return {
    provider: PMS_PROVIDERS.GUESTY,
    results: Array.isArray(payload?.results) ? payload.results.map(normalizeGuestyProperty) : [],
  };
};

export const getReservations = async ({ city = "", provider = "", reservationCode = "" } = {}) => {
  const selectedProvider = detectPmsProvider({ city, provider });
  if (selectedProvider === PMS_PROVIDERS.APALEO) {
    const payload = await fetchApaleoReservations({
      city: city || "Antwerp",
      reservationCode,
    });
    return {
      provider: PMS_PROVIDERS.APALEO,
      results: Array.isArray(payload?.results) ? payload.results : [],
    };
  }

  if (!reservationCode) {
    return { provider: PMS_PROVIDERS.GUESTY, results: [] };
  }

  const payload = await request(`/getReservation?reservationId=${encodeURIComponent(reservationCode)}`);
  return {
    provider: PMS_PROVIDERS.GUESTY,
    results: Array.isArray(payload?.results) ? payload.results.map(normalizeGuestyReservation) : [],
  };
};

export const getAvailability = async ({
  city = "",
  provider = "",
  propertyId = "",
  checkIn = "",
  checkOut = "",
  guests = 1,
} = {}) => {
  const selectedProvider = detectPmsProvider({ city, provider });

  if (selectedProvider === PMS_PROVIDERS.APALEO) {
    const payload = await fetchApaleoAvailability({
      city: city || "Antwerp",
      propertyId,
      checkIn,
      checkOut,
      guests,
    });
    return {
      provider: PMS_PROVIDERS.APALEO,
      results: Array.isArray(payload?.results) ? payload.results : [],
    };
  }

  const qs = new URLSearchParams({
    property_id: String(propertyId),
    check_in: String(checkIn),
    check_out: String(checkOut),
    guests: String(Math.max(1, Number(guests) || 1)),
  }).toString();
  const payload = await request(`/api-availability?${qs}`);

  return {
    provider: PMS_PROVIDERS.GUESTY,
    results: [normalizeGuestyAvailability(payload, { propertyId })],
  };
};
