import apiBase from "../utils/apiBase";

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
    params.set(key, String(value));
  });
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

const request = async (path, { method = "GET", query = {}, body } = {}) => {
  const response = await fetch(`${apiBase}${path}${toQueryString(query)}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.message || payload?.error || `Apaleo request failed (${response.status})`;
    throw new Error(message);
  }

  return payload;
};

export const fetchApaleoTokenMeta = async ({ forceRefresh = false } = {}) =>
  request("/apaleo-token", { query: { forceRefresh: forceRefresh ? "1" : "0" } });

export const getCachedApaleoToken = async () =>
  request("/apaleo-token", { query: { forceRefresh: "0" } });

export const refreshApaleoToken = async () =>
  request("/apaleo-token", { query: { forceRefresh: "1" } });

export const getApaleoAccount = async ({ forceRefresh = false } = {}) => {
  const payload = await request("/apaleo-token", { query: { forceRefresh: forceRefresh ? "1" : "0" } });
  return payload?.account || null;
};

export const fetchApaleoProperties = async ({ city = "Antwerp", limit, sync = false } = {}) =>
  request("/apaleo-properties", {
    query: {
      city,
      ...(limit ? { limit } : {}),
      ...(sync ? { sync: "1" } : {}),
    },
  });

export const fetchApaleoReservations = async ({
  city = "Antwerp",
  reservationCode = "",
  checkIn = "",
  checkOut = "",
  limit,
  sync = false,
} = {}) =>
  request("/apaleo-reservations", {
    query: {
      city,
      ...(reservationCode ? { reservationCode } : {}),
      ...(checkIn ? { checkIn } : {}),
      ...(checkOut ? { checkOut } : {}),
      ...(limit ? { limit } : {}),
      ...(sync ? { sync: "1" } : {}),
    },
  });

export const fetchApaleoAvailability = async ({
  city = "Antwerp",
  propertyId,
  checkIn,
  checkOut,
  guests = 1,
  sync = false,
} = {}) =>
  request("/apaleo-availability", {
    query: {
      city,
      property_id: propertyId,
      check_in: checkIn,
      check_out: checkOut,
      guests: Math.max(1, Number(guests) || 1),
      ...(sync ? { sync: "1" } : {}),
    },
  });
