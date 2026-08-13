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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const request = async (
  path,
  { method = "GET", query = {}, body, retries = 1, retryDelayMs = 250 } = {},
) => {
  const startedAt = performance.now();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const requestUrl = `${apiBase}${path}${toQueryString(query)}`;

    const response = await fetch(requestUrl, {
      method,
      credentials: "omit",
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const payload = await response.json().catch(() => ({}));
    if (response.ok) {
      return {
        ...payload,
        _meta: {
          endpoint: path,
          url: requestUrl,
          query,
          durationMs: Math.round(performance.now() - startedAt),
          statusCode: response.status,
          retriesUsed: attempt,
        },
      };
    }

    const statusCode = Number(response.status || 0);
    const shouldRetry = (statusCode === 429 || (statusCode >= 500 && statusCode <= 599)) && attempt < retries;
    if (shouldRetry) {
      await sleep(retryDelayMs * (2 ** attempt));
      continue;
    }

    const message = payload?.message || payload?.error || `Apaleo request failed (${response.status})`;
    throw new Error(message);
  }

  throw new Error(`Apaleo request failed unexpectedly for ${path}`);
};

export const fetchApaleoTokenMeta = async ({ forceRefresh = false } = {}) =>
  request("/apaleo-token", { query: { forceRefresh: forceRefresh ? "1" : "0" } });

export const getCachedApaleoToken = async () =>
  request("/apaleo-token", { query: { forceRefresh: "0" } });

export const refreshApaleoToken = async () =>
  request("/apaleo-token", { query: { forceRefresh: "1" } });

export const getApaleoAccount = async ({ forceRefresh = false } = {}) => {
  const payload = await request("/apaleo-account", { query: { forceRefresh: forceRefresh ? "1" : "0" } });
  return payload?.account || null;
};

export const fetchApaleoAccount = async ({ forceRefresh = false } = {}) =>
  request("/apaleo-account", { query: { forceRefresh: forceRefresh ? "1" : "0" } });

export const fetchApaleoProperties = async ({ city = "", limit, sync = false } = {}) =>
  request("/apaleo-properties", {
    query: {
      city,
      ...(limit ? { limit } : {}),
      ...(sync ? { sync: "1" } : {}),
    },
  });

export const fetchApaleoReservations = async ({
  city = "",
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
  city = "",
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

export const fetchApaleoUnitGroups = async ({ city = "", propertyId = "", limit } = {}) =>
  request("/apaleo-unit-groups", {
    query: {
      city,
      ...(propertyId ? { propertyId } : {}),
      ...(limit ? { limit } : {}),
    },
  });

export const fetchApaleoFinancials = async (reservationId) => {
  const rid = String(reservationId || "").trim();
  if (!rid) throw new Error("reservationId is required");
  return request("/apaleo-financials", { query: { reservationId: rid } });
};
