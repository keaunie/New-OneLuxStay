import { getStore } from "@netlify/blobs";
import { fetchWithTimeout } from "./http.js";
import { getGuestyOpenApiCredentials } from "./guestyEnv.js";
import { calculateNights, roundMoney } from "./pricingService.js";

const OPEN_API_HOST = process.env.GUESTY_OPEN_API_HOST || "https://open-api.guesty.com";
const OPEN_API_V1 = String(process.env.GUESTY_BASE_URL || `${OPEN_API_HOST}/v1`).replace(/\/+$/, "");
const TOKEN_STORE_NAME = process.env.GUESTY_TOKEN_BLOB_STORE || "guesty-oauth";
const TOKEN_KEY = process.env.GUESTY_TOKEN_BLOB_KEY || "access-token";

let tokenStorePromise;

const firstNumber = (...values) => {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const getBlobStore = async () => {
  if (!tokenStorePromise) {
    tokenStorePromise = (async () => {
      try {
        const siteID = process.env.NETLIFY_SITE_ID;
        const apiToken = process.env.NETLIFY_API_TOKEN;
        return siteID && apiToken
          ? getStore(TOKEN_STORE_NAME, { siteID, token: apiToken })
          : getStore(TOKEN_STORE_NAME);
      } catch {
        return null;
      }
    })();
  }
  return tokenStorePromise;
};

const requestGuestyToken = async () => {
  const { clientId, clientSecret } = getGuestyOpenApiCredentials();
  if (!clientId || !clientSecret) {
    throw new Error("Missing Guesty API credentials");
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "open-api",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const response = await fetchWithTimeout(`${OPEN_API_HOST}/oauth2/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Guesty token request failed (${response.status})`);
  }

  return text ? JSON.parse(text) : {};
};

export const getGuestyToken = async () => {
  const now = Date.now();
  if (
    globalThis.GUESTY_TOKEN &&
    Number(globalThis.GUESTY_TOKEN_EXPIRES || 0) > now + 60_000
  ) {
    return globalThis.GUESTY_TOKEN;
  }

  const store = await getBlobStore();
  if (store) {
    const cached = await store.get(TOKEN_KEY, { type: "json" });
    if (cached?.token && Number(cached?.expiresAt || 0) > now + 60_000) {
      globalThis.GUESTY_TOKEN = cached.token;
      globalThis.GUESTY_TOKEN_EXPIRES = cached.expiresAt;
      return cached.token;
    }
  }

  const tokenPayload = await requestGuestyToken();
  const token = String(tokenPayload.access_token || "").trim();
  if (!token) throw new Error("Guesty token response missing access_token");

  const record = {
    token,
    expiresAt: now + Number(tokenPayload.expires_in || 0) * 1000,
  };

  if (store) {
    await store.setJSON(TOKEN_KEY, record);
  }

  globalThis.GUESTY_TOKEN = record.token;
  globalThis.GUESTY_TOKEN_EXPIRES = record.expiresAt;
  return record.token;
};

export const guestyRequest = async (path, { method = "GET", body } = {}) => {
  const token = await getGuestyToken();
  const response = await fetchWithTimeout(`${OPEN_API_V1}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(payload?.message || text || `Guesty request failed (${response.status})`);
  }

  return payload;
};

const extractQuotePricing = (quote, { checkIn, checkOut } = {}) => {
  const ratePlan = quote?.rates?.ratePlans?.[0] || quote?.ratePlans?.[0] || null;
  const quoteMoney =
    ratePlan?.money?.money ||
    ratePlan?.money ||
    quote?.money?.money ||
    quote?.money ||
    null;
  const quoteDays = Array.isArray(ratePlan?.days) ? ratePlan.days : [];
  const currency = String(
    quoteMoney?.currency || quoteDays[0]?.currency || quote?.currency || "USD",
  ).toUpperCase();
  const nights = quoteDays.length || calculateNights(checkIn, checkOut);

  const breakdown = { accommodation: 0, cleaning: 0, taxes: 0, fees: 0 };
  const invoiceItems = Array.isArray(quoteMoney?.invoiceItems) ? quoteMoney.invoiceItems : [];
  invoiceItems.forEach((item) => {
    const amount = Number(item?.amount);
    if (!Number.isFinite(amount)) return;
    const normalType = String(item?.normalType || item?.type || "").toUpperCase();
    const secondType = String(item?.secondIdentifier || item?.secondType || "").toUpperCase();
    const label = String(item?.title || item?.name || item?.description || "").toUpperCase();
    const isCleaning =
      normalType === "CF" ||
      normalType === "CLEANING_FEE" ||
      /\bCLEAN(ING)?\b/.test(normalType) ||
      /\bCLEAN(ING)?\b/.test(secondType) ||
      /\bCLEAN(ING)?\b/.test(label);
    const isTax =
      normalType === "OCT" ||
      normalType === "TAX" ||
      normalType === "OCCUPANCY_TAX" ||
      /\b(TAX|VAT)\b/.test(normalType) ||
      /\b(TAX|VAT)\b/.test(secondType) ||
      /\b(TAX|VAT)\b/.test(label);

    if (normalType === "AF" || normalType === "ACCOMMODATION_FARE") breakdown.accommodation += amount;
    else if (isCleaning) breakdown.cleaning += amount;
    else if (isTax) breakdown.taxes += amount;
    else breakdown.fees += amount;
  });

  const daySum = quoteDays.reduce((sum, day) => {
    const price = firstNumber(day?.manualPrice, day?.price, day?.basePrice);
    return sum + (Number.isFinite(price) ? price : 0);
  }, 0);

  const accommodation = firstNumber(
    quoteMoney?.fareAccommodation,
    breakdown.accommodation,
    daySum,
  ) || 0;
  const cleaningFee = firstNumber(
    quoteMoney?.fareCleaning,
    quoteMoney?.cleaning,
    quoteMoney?.cleaningFee,
    breakdown.cleaning,
    0,
  ) || 0;
  const taxes = firstNumber(
    quoteMoney?.fareTaxes,
    quoteMoney?.fareTax,
    quoteMoney?.taxes,
    quoteMoney?.taxAmount,
    quoteMoney?.totalTaxes,
    breakdown.taxes,
    0,
  ) || 0;
  const nightlyRate =
    firstNumber(
      quoteDays[0]?.manualPrice,
      quoteDays[0]?.price,
      quoteDays[0]?.basePrice,
      nights > 0 ? accommodation / nights : null,
    ) || 0;

  return {
    currency,
    nights,
    nightlyRate: roundMoney(nightlyRate),
    cleaningFee: roundMoney(cleaningFee),
    taxes: roundMoney(taxes),
    rawQuote: quote,
  };
};

export const getAvailabilityAndPricing = async ({
  propertyId,
  checkIn,
  checkOut,
  guests = 1,
} = {}) => {
  const availabilityQuery = new URLSearchParams({
    ids: String(propertyId || ""),
    available: JSON.stringify({
      checkIn,
      checkOut,
      minOccupancy: Math.max(1, Number(guests) || 1),
    }),
  });

  const availabilityPayload = await guestyRequest(`/listings?${availabilityQuery.toString()}`);
  const availableResults = Array.isArray(availabilityPayload?.results) ? availabilityPayload.results : [];
  const available = availableResults.some((item) =>
    String(item?._id || item?.id || "") === String(propertyId || ""),
  );

  if (!available) {
    return {
      available: false,
      nightlyRate: 0,
      cleaningFee: 0,
      taxes: 0,
      currency: "USD",
      nights: calculateNights(checkIn, checkOut),
    };
  }

  const quotesPayload = await guestyRequest(
    "/quotes/multiple?mergeAccommodationFarePriceComponents=true",
    {
      method: "POST",
      body: {
        quotes: [
          {
            checkInDateLocalized: String(checkIn),
            checkOutDateLocalized: String(checkOut),
            unitTypeId: String(propertyId),
            guestsCount: Math.max(1, Number(guests) || 1),
            numberOfGuests: {
              numberOfAdults: Math.max(1, Number(guests) || 1),
            },
            source: "website",
            applyPromotions: true,
            count: 1,
          },
        ],
      },
    },
  );

  const results = Array.isArray(quotesPayload?.results) ? quotesPayload.results : [];
  const quote =
    results.find((item) =>
      String(item?.unitTypeId || item?.listingId || item?._id || "") === String(propertyId || ""),
    ) || results[0] || null;

  if (!quote) {
    throw new Error("Guesty quote response did not contain pricing for the requested property");
  }

  return {
    available: true,
    ...extractQuotePricing(quote, { checkIn, checkOut }),
  };
};

const buildGuestyReservationPayload = ({
  propertyId,
  checkIn,
  checkOut,
  guest,
  amount,
  currency,
  roomTotal,
  cleaningFee,
  taxes,
  fees,
} = {}) => {
  const guestName = [guest?.firstName, guest?.lastName].filter(Boolean).join(" ").trim();
  const nameParts = guestName.split(/\s+/).filter(Boolean);
  const firstName = guest?.firstName || nameParts[0] || "Guest";
  const lastName = guest?.lastName || nameParts.slice(1).join(" ") || "Guest";
  const miscFees = roundMoney((Number(fees) || 0) - (Number(cleaningFee) || 0) - (Number(taxes) || 0));

  return {
    listingId: String(propertyId),
    checkInDateLocalized: String(checkIn),
    checkOutDateLocalized: String(checkOut),
    status: "confirmed",
    source: "website",
    guest: {
      firstName,
      lastName,
      email: guest?.email || "",
      phone: guest?.phone || "",
    },
    money: {
      currency: String(currency || "USD").toUpperCase(),
      fareAccommodation: roundMoney(roomTotal),
      fareCleaning: roundMoney(cleaningFee),
      invoiceItems: [
        ...(Number(taxes) > 0 ? [{ title: "Occupancy Tax", amount: roundMoney(taxes), normalType: "OCT" }] : []),
        ...(miscFees > 0 ? [{ title: "Fees", amount: miscFees, normalType: "OTHER" }] : []),
      ],
      total: roundMoney(amount),
    },
  };
};

export const createBooking = async ({
  propertyId,
  checkIn,
  checkOut,
  guest,
  price,
} = {}) => {
  const payload = buildGuestyReservationPayload({
    propertyId,
    checkIn,
    checkOut,
    guest,
    amount: price?.grand_total,
    currency: price?.currency,
    roomTotal: price?.room_total,
    cleaningFee: price?.cleaning_fee,
    taxes: price?.taxes,
    fees: price?.fees,
  });

  const reservation = await guestyRequest("/reservations", {
    method: "POST",
    body: payload,
  });

  return reservation;
};
