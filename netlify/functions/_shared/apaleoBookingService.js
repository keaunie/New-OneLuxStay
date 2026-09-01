import crypto from "node:crypto";
import { apaleoRequest, listApaleoProperties } from "./apaleoService.js";
import { supabaseRestRequest, toSupabaseInFilter } from "./supabaseClient.js";

const SESSION_TABLE = "apaleo_booking_sessions";
const MAX_ADULTS = 20;
const MAX_CHILDREN = 10;

const text = (value = "", max = 240) => String(value ?? "").trim().slice(0, max);
const array = (value) => (Array.isArray(value) ? value : []);
const isoDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(text(value, 10)) ? text(value, 10) : "");
const configuredPropertyIds = () => [...new Set(String(process.env.APALEO_PROPERTY_IDS || "")
  .split(",").map((value) => text(value, 120)).filter(Boolean))];

export const getAllowedPropertyIds = async () => {
  const configured = configuredPropertyIds();
  try {
    const rows = await supabaseRestRequest("apaleo_property_mappings", {
      query: { select: "apaleo_property_id", enabled: "eq.true", limit: 5000 },
    });
    return [...new Set([...configured, ...array(rows).map((row) => text(row.apaleo_property_id, 120)).filter(Boolean)])];
  } catch (error) {
    if (configured.length) return configured;
    throw Object.assign(new Error("Apaleo property mappings are unavailable"), {
      statusCode: 503, code: "PROPERTY_MAPPINGS_UNAVAILABLE", cause: error,
    });
  }
};

export const assertAllowedProperty = async (propertyId) => {
  const id = text(propertyId, 120);
  const allowed = await getAllowedPropertyIds();
  if (!allowed.length) {
    const error = new Error("Apaleo property allow-list is not configured");
    error.statusCode = 503;
    error.code = "PROPERTY_ALLOWLIST_MISSING";
    throw error;
  }
  if (!allowed.includes(id)) {
    const error = new Error("Property is not enabled for online booking");
    error.statusCode = 403;
    error.code = "PROPERTY_NOT_ALLOWED";
    throw error;
  }
  return id;
};

export const resolveBookingTarget = async ({ localPropertyId = "", propertyId = "", unitGroupId = "" } = {}) => {
  const localId = text(localPropertyId, 180);
  if (localId) {
    const rows = await supabaseRestRequest("apaleo_inventory_mappings", {
      query: { select: "local_id,apaleo_property_id,apaleo_id", mapping_type: "eq.unit_group", local_id: `eq.${localId}`, enabled: "eq.true", limit: 1 },
    });
    const mapping = array(rows)[0];
    if (!mapping) throw Object.assign(new Error("Property has no enabled Apaleo unit-group mapping"), { statusCode: 409, code: "APALEO_MAPPING_MISSING" });
    return { localPropertyId: localId, propertyId: await assertAllowedProperty(mapping.apaleo_property_id), unitGroupId: text(mapping.apaleo_id, 120) };
  }
  const safePropertyId = await assertAllowedProperty(propertyId);
  return { localPropertyId: safePropertyId, propertyId: safePropertyId, unitGroupId: text(unitGroupId, 120) };
};

export const validateStay = ({ arrival, departure, adults = 1, childrenAges = [] }) => {
  const safeArrival = isoDate(arrival);
  const safeDeparture = isoDate(departure);
  const safeAdults = Number(adults);
  const safeChildren = array(childrenAges).map(Number);
  const today = new Date().toISOString().slice(0, 10);
  if (!safeArrival || !safeDeparture || safeDeparture <= safeArrival) {
    throw Object.assign(new Error("Departure must be after arrival"), { statusCode: 400, code: "INVALID_DATES" });
  }
  if (safeArrival < today) {
    throw Object.assign(new Error("Arrival cannot be in the past"), { statusCode: 400, code: "INVALID_DATES" });
  }
  if (!Number.isInteger(safeAdults) || safeAdults < 1 || safeAdults > MAX_ADULTS) {
    throw Object.assign(new Error("Adults must be between 1 and 20"), { statusCode: 400, code: "INVALID_OCCUPANCY" });
  }
  if (safeChildren.length > MAX_CHILDREN || safeChildren.some((age) => !Number.isInteger(age) || age < 0 || age > 17)) {
    throw Object.assign(new Error("Children ages must be integers from 0 to 17"), { statusCode: 400, code: "INVALID_CHILDREN_AGES" });
  }
  return { arrival: safeArrival, departure: safeDeparture, adults: safeAdults, childrenAges: safeChildren };
};

// Decimal-to-minor conversion intentionally avoids binary floating-point arithmetic.
export const majorToMinor = (amount, currency = "EUR") => {
  const value = String(amount ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(value)) throw new Error("Invalid monetary amount");
  const zeroDecimal = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
  const digits = zeroDecimal.has(text(currency, 3).toUpperCase()) ? 0 : 2;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > digits && /[1-9]/.test(fraction.slice(digits))) throw new Error("Amount has unsupported precision");
  return Number(BigInt(whole) * (10n ** BigInt(digits)) + BigInt((fraction.slice(0, digits) + "0".repeat(digits)).slice(0, digits) || "0"));
};

export const minorToMajor = (amount, currency = "EUR") => {
  const value = BigInt(amount);
  const zeroDecimal = new Set(["BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "PYG", "RWF", "UGX", "VND", "VUV", "XAF", "XOF", "XPF"]);
  const digits = zeroDecimal.has(text(currency, 3).toUpperCase()) ? 0 : 2;
  if (!digits) return Number(value);
  const divisor = 10n ** BigInt(digits);
  return Number(value / divisor) + Number(value % divisor) / Number(divisor);
};

const money = (value = {}, fallbackCurrency = "EUR") => ({
  amount: String(value?.amount ?? "0"),
  currency: text(value?.currency || fallbackCurrency, 3).toUpperCase(),
});

export const normalizeOffer = (offer = {}) => {
  const total = money(offer.totalGrossAmount);
  const prepayment = money(offer.prePaymentGrossAmount, total.currency);
  return {
    ratePlanId: text(offer?.ratePlan?.id || offer?.ratePlanId, 120),
    ratePlanName: text(offer?.ratePlan?.name, 240),
    unitGroupId: text(offer?.unitGroup?.id || offer?.unitGroupId, 120),
    unitGroupName: text(offer?.unitGroup?.name, 240),
    minGuaranteeType: text(offer?.minGuaranteeType, 40),
    availableUnits: Math.max(0, Number(offer?.availableUnits || 0)),
    totalGrossAmount: total,
    prePaymentGrossAmount: prepayment,
    cityTax: offer?.cityTax || null,
    cancellationFee: offer?.cancellationFee || null,
    noShowFee: offer?.noShowFee || null,
    mandatoryServices: array(offer?.services),
    timeSlices: array(offer?.timeSlices),
    taxDetails: array(offer?.taxDetails),
  };
};

export const getBookingProperties = async () => {
  const ids = await getAllowedPropertyIds();
  if (!ids.length) return [];
  const properties = await listApaleoProperties();
  const allowedProperties = properties.filter((property) => ids.includes(property.id));
  let websiteByPropertyId = new Map();
  try {
    const mappings = await supabaseRestRequest("apaleo_inventory_mappings", {
      query: {
        select: "local_id,apaleo_property_id,metadata",
        mapping_type: "eq.unit_group",
        enabled: "eq.true",
        limit: 5000,
      },
    });
    const localIds = [...new Set(array(mappings).map((row) => text(row.local_id, 180)).filter(Boolean))];
    const listings = localIds.length
      ? await supabaseRestRequest("listings", {
          query: {
            select: "id,title,city,address,pictures,active,listed,metadata",
            id: `in.${toSupabaseInFilter(localIds)}`,
            limit: 5000,
          },
        })
      : [];
    const listingById = new Map(array(listings).map((listing) => [text(listing.id, 180), listing]));
    const grouped = new Map();
    array(mappings).forEach((mapping) => {
      const propertyId = text(mapping.apaleo_property_id, 120);
      const listing = listingById.get(text(mapping.local_id, 180));
      if (!propertyId || !listing || listing.active === false || listing.listed === false) return;
      if (!grouped.has(propertyId)) grouped.set(propertyId, []);
      grouped.get(propertyId).push({ listing, mapping });
    });
    const imageUrl = (listing = {}) => array(listing.pictures)
      .map((image) => typeof image === "string" ? image : image?.original || image?.large || image?.regular || image?.thumbnail || image?.url)
      .map((value) => text(value, 1000))
      .find(Boolean) || "";
    grouped.forEach((entries, propertyId) => {
      const representative = entries.find(({ listing, mapping }) => mapping?.metadata?.apaleoUnitId && imageUrl(listing))
        || entries.find(({ listing }) => imageUrl(listing))
        || entries[0];
      websiteByPropertyId.set(propertyId, {
        localListingCount: entries.length,
        localListingId: text(representative?.listing?.id, 180),
        localListingTitle: text(representative?.listing?.title, 240),
        coverImage: imageUrl(representative?.listing),
      });
    });
  } catch (error) {
    console.warn("Unable to enrich Apaleo properties with website content", {
      error: error?.message || String(error),
    });
  }
  return allowedProperties.map((property) => ({
    id: property.id,
    code: property.code,
    title: property.title,
    description: property.description,
    city: property.city,
    country: property.country,
    address: property.address,
    location: property.location,
    currencyCode: property.currencyCode,
    timeZone: property.timeZone,
    status: property.status,
    isLive: property.isLive,
    isArchived: property.isArchived,
    provider: property.provider,
    images: property.images,
    amenities: property.amenities,
    ...(websiteByPropertyId.get(property.id) || {
      localListingCount: 0,
      localListingId: "",
      localListingTitle: "",
      coverImage: "",
    }),
  }));
};

export const getOffers = async ({ localPropertyId, propertyId, unitGroupId, arrival, departure, adults, childrenAges = [] }) => {
  const target = await resolveBookingTarget({ localPropertyId, propertyId, unitGroupId });
  const stay = validateStay({ arrival, departure, adults, childrenAges });
  const response = await apaleoRequest("/booking/v1/offers", {
    query: {
      propertyId: target.propertyId,
      arrival: stay.arrival,
      departure: stay.departure,
      adults: stay.adults,
      ...(stay.childrenAges.length ? { childrenAges: stay.childrenAges.join(",") } : {}),
      channelCode: "Ibe",
    },
  });
  const rawOffers = array(response?.payload?.offers);
  const normalized = rawOffers.map(normalizeOffer);
  const bookable = normalized.filter((offer) => offer.ratePlanId && offer.unitGroupId && offer.availableUnits > 0 && (!target.unitGroupId || offer.unitGroupId === target.unitGroupId));
  // Rate plans are set up per property with parallel "STD"/"EXT"/"NEW" variants (legacy/
  // extension/current); guests should only ever see the current one. Falls back to the
  // unfiltered list for any property that doesn't follow this naming convention, so it
  // never silently hides every offer.
  const newOffers = bookable.filter((offer) => /new/i.test(offer.ratePlanId));
  const filtered = newOffers.length ? newOffers : bookable;
  // Apaleo's calendar/rates endpoints show a rate as bookable per-night without applying every
  // constraint (length-of-stay, occupancy) /booking/v1/offers enforces for the full stay, so a
  // property can look available while this call legitimately returns nothing. Log the raw
  // payload whenever that happens so the actual Apaleo-side reason (empty response vs. our own
  // filter dropping results) is visible in the function logs instead of guessed at.
  if (!filtered.length) {
    console.warn("[apaleo-offers] no bookable offers", {
      propertyId: target.propertyId,
      unitGroupId: target.unitGroupId,
      arrival: stay.arrival,
      departure: stay.departure,
      adults: stay.adults,
      rawOfferCount: rawOffers.length,
      rawOffers: normalized.map((offer) => ({
        ratePlanId: offer.ratePlanId,
        unitGroupId: offer.unitGroupId,
        availableUnits: offer.availableUnits,
        minGuaranteeType: offer.minGuaranteeType,
      })),
    });
  }
  return filtered;
};

export const normalizeUnitGroupCalendarAvailability = ({ payload, unitGroupId, from, to }) => {
  const availability = {};
  for (let cursor = Date.parse(`${from}T00:00:00Z`); cursor <= Date.parse(`${to}T00:00:00Z`); cursor += 86_400_000) {
    availability[new Date(cursor).toISOString().slice(0, 10)] = false;
  }
  array(payload?.timeSlices).forEach((slice) => {
    const date = isoDate(String(slice?.from || "").slice(0, 10));
    if (!date || !(date in availability)) return;
    const group = array(slice?.unitGroups).find((entry) =>
      text(entry?.unitGroup?.id || entry?.unitGroupId, 120) === unitGroupId);
    availability[date] = Number(group?.sellableCount || 0) > 0;
  });
  return availability;
};

export const normalizeUnitGroupCalendarRates = ({ rateResponses = [], adults = 1 }) => {
  const days = {};
  array(rateResponses).forEach(({ ratePlan = {}, payload = {} }) => {
    array(payload?.rates).forEach((rate) => {
      const date = isoDate(String(rate?.from || "").slice(0, 10));
      if (!date) return;
      const occupancyPrice = array(rate?.calculatedPrices)
        .find((entry) => Number(entry?.adults) === Number(adults))?.price;
      const price = occupancyPrice || rate?.price;
      const amount = Number(price?.amount);
      const restrictions = rate?.restrictions || {};
      if (!Number.isFinite(amount) || amount < 0 || restrictions.closed === true) return;
      const candidate = {
        date,
        price: amount,
        currency: text(price?.currency || "USD", 3).toUpperCase(),
        ratePlanId: text(ratePlan?.id, 120),
        ratePlanName: text(ratePlan?.name?.en || ratePlan?.name, 240),
        availableForArrival: restrictions.closedOnArrival !== true,
        availableForDeparture: restrictions.closedOnDeparture !== true,
        restrictions: {
          minNights: Math.max(1, Number(restrictions.minLengthOfStay || 1)),
          maxNights: restrictions.maxLengthOfStay == null
            ? null
            : Math.max(1, Number(restrictions.maxLengthOfStay)),
          closedOnArrival: restrictions.closedOnArrival === true,
          closedOnDeparture: restrictions.closedOnDeparture === true,
        },
      };
      const current = days[date];
      if (!current || candidate.price < current.price) days[date] = candidate;
    });
  });
  return days;
};

export const getUnitGroupCalendarAvailability = async ({
  localPropertyId,
  propertyId,
  unitGroupId,
  from,
  to,
  adults = 1,
  childrenAges = [],
}) => {
  const target = await resolveBookingTarget({ localPropertyId, propertyId, unitGroupId });
  const safeFrom = isoDate(from);
  const safeTo = isoDate(to);
  const safeAdults = Number(adults);
  const safeChildren = array(childrenAges).map(Number);
  if (!safeFrom || !safeTo || safeTo < safeFrom) {
    throw Object.assign(new Error("Calendar end date must be on or after its start date"), {
      statusCode: 400,
      code: "INVALID_CALENDAR_DATES",
    });
  }
  const rangeDays = Math.round((Date.parse(`${safeTo}T00:00:00Z`) - Date.parse(`${safeFrom}T00:00:00Z`)) / 86_400_000);
  if (rangeDays > 93) {
    throw Object.assign(new Error("Calendar availability is limited to 94 days per request"), {
      statusCode: 400,
      code: "CALENDAR_RANGE_TOO_LARGE",
    });
  }
  if (!Number.isInteger(safeAdults) || safeAdults < 1 || safeAdults > MAX_ADULTS) {
    throw Object.assign(new Error("Adults must be between 1 and 20"), { statusCode: 400, code: "INVALID_OCCUPANCY" });
  }
  if (safeChildren.length > MAX_CHILDREN || safeChildren.some((age) => !Number.isInteger(age) || age < 0 || age > 17)) {
    throw Object.assign(new Error("Children ages must be integers from 0 to 17"), { statusCode: 400, code: "INVALID_CHILDREN_AGES" });
  }

  const response = await apaleoRequest("/availability/v1/unit-groups", {
    query: {
      propertyId: target.propertyId,
      from: safeFrom,
      to: safeTo,
      timeSliceTemplate: "OverNight",
      unitGroupIds: [target.unitGroupId],
      adults: safeAdults,
      ...(safeChildren.length ? { childrenAges: safeChildren } : {}),
      onlySellable: true,
      pageSize: 500,
    },
  });

  const availability = normalizeUnitGroupCalendarAvailability({
    payload: response?.payload,
    unitGroupId: target.unitGroupId,
    from: safeFrom,
    to: safeTo,
  });

  let rateDays = {};
  let pricingWarning = null;
  try {
    const ratePlanResponse = await apaleoRequest("/rateplan/v1/rate-plans", {
      query: {
        propertyId: target.propertyId,
        unitGroupIds: [target.unitGroupId],
        channelCodes: ["Ibe"],
        timeSliceTemplate: "OverNight",
        includeArchived: false,
        pageSize: 500,
      },
    });
    const ratePlans = array(ratePlanResponse?.payload?.ratePlans)
      .filter((plan) => plan?.isArchived !== true && !array(plan?.promoCodes).length)
      .slice(0, 20);
    const rateRangeEnd = new Date(Date.parse(`${safeTo}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const rateResponses = await Promise.all(ratePlans.map(async (ratePlan) => {
      const rates = await apaleoRequest(`/rateplan/v1/rate-plans/${encodeURIComponent(text(ratePlan?.id, 120))}/rates`, {
        query: { from: safeFrom, to: rateRangeEnd, pageSize: 500 },
      });
      return { ratePlan, payload: rates?.payload };
    }));
    rateDays = normalizeUnitGroupCalendarRates({ rateResponses, adults: safeAdults });
  } catch (error) {
    if (![401, 403].includes(Number(error?.statusCode))) throw error;
    pricingWarning = {
      code: "APALEO_RATE_PERMISSION_MISSING",
      message: "Apaleo inventory is available, but calendar prices and restrictions require rateplans.read and rates.read.",
      requestPath: text(error?.requestPath, 240),
    };
    console.warn("[apaleo-calendar] rate details unavailable; returning inventory-only calendar", {
      propertyId: target.propertyId,
      unitGroupId: target.unitGroupId,
      requestPath: pricingWarning.requestPath,
      statusCode: error?.statusCode,
    });
  }
  const days = Object.keys(availability).map((date) => {
    const rateDay = rateDays[date] || null;
    const available = availability[date] === true && (pricingWarning
      ? true
      : Boolean(rateDay?.availableForArrival));
    return {
      date,
      available,
      price: rateDay?.price ?? null,
      currency: rateDay?.currency || null,
      ratePlanId: rateDay?.ratePlanId || null,
      ratePlanName: rateDay?.ratePlanName || null,
      restrictions: rateDay?.restrictions || null,
    };
  });

  return {
    ...target,
    from: safeFrom,
    to: safeTo,
    availability: Object.fromEntries(days.map((day) => [day.date, day.available])),
    days,
    pricingWarning,
  };
};

export const getServiceOffers = async ({ ratePlanId, arrival, departure, adults, childrenAges = [] }) => {
  const stay = validateStay({ arrival, departure, adults, childrenAges });
  const response = await apaleoRequest("/booking/v1/service-offers", {
    query: {
      ratePlanId: text(ratePlanId, 120), arrival: stay.arrival, departure: stay.departure,
      adults: stay.adults,
      ...(stay.childrenAges.length ? { childrenAges: stay.childrenAges.join(",") } : {}),
      channelCode: "Ibe",
    },
  });
  return array(response?.payload?.services).map((entry) => ({
    serviceId: text(entry?.service?.id || entry?.serviceId, 120),
    name: text(entry?.service?.name, 240),
    pricingUnit: text(entry?.service?.pricingUnit, 60),
    count: Number(entry?.count || 0),
    totalAmount: entry?.totalAmount || null,
    prePaymentGrossAmount: money(entry?.prePaymentGrossAmount),
    dates: array(entry?.dates),
  })).filter((entry) => entry.serviceId);
};

const findOffer = (offers, ratePlanId, unitGroupId) => offers.find((offer) =>
  offer.ratePlanId === text(ratePlanId, 120) && offer.unitGroupId === text(unitGroupId, 120));

export const createBookingSession = async (input = {}) => {
  const stay = validateStay(input);
  const target = await resolveBookingTarget(input);
  const offers = await getOffers({ propertyId: target.propertyId, unitGroupId: target.unitGroupId, ...stay });
  const offer = findOffer(offers, input.ratePlanId, target.unitGroupId || input.unitGroupId);
  if (!offer) throw Object.assign(new Error("Selected offer is no longer available"), { statusCode: 409, code: "OFFER_UNAVAILABLE" });
  const selectedIds = new Set(array(input.selectedServices).map((item) => text(item?.serviceId || item, 120)));
  const availableServices = selectedIds.size ? await getServiceOffers({ ratePlanId: offer.ratePlanId, ...stay }) : [];
  const selectedServices = availableServices.filter((item) => selectedIds.has(item.serviceId));
  if (selectedServices.length !== selectedIds.size) throw Object.assign(new Error("One or more services are unavailable"), { statusCode: 409, code: "SERVICE_UNAVAILABLE" });
  const currency = offer.totalGrossAmount.currency;
  if (selectedServices.some((item) => item.prePaymentGrossAmount.currency !== currency)) {
    throw Object.assign(new Error("Service and stay offer currencies do not match"), { statusCode: 409, code: "CURRENCY_MISMATCH" });
  }
  const servicePrepayment = selectedServices.reduce((sum, item) => sum + majorToMinor(item.prePaymentGrossAmount.amount, currency), 0);
  const row = {
    id: crypto.randomUUID(), state: "OFFER_SELECTED", local_property_id: target.localPropertyId, property_id: target.propertyId,
    arrival: stay.arrival, departure: stay.departure, adults: stay.adults,
    children_ages: stay.childrenAges, unit_group_id: offer.unitGroupId, rate_plan_id: offer.ratePlanId,
    selected_services: selectedServices, quote: offer,
    quoted_total_minor: majorToMinor(offer.totalGrossAmount.amount, currency),
    prepayment_minor: majorToMinor(offer.prePaymentGrossAmount.amount, currency) + servicePrepayment,
    currency, guarantee_type: offer.minGuaranteeType,
    payment_state: offer.minGuaranteeType === "PM6Hold" ? "NOT_REQUIRED" : "REQUIRED",
    expires_at: new Date(Date.now() + Math.max(5, Number(process.env.APALEO_BOOKING_SESSION_TTL_MINUTES || 30)) * 60000).toISOString(),
  };
  const inserted = await supabaseRestRequest(SESSION_TABLE, { method: "POST", body: [row], prefer: "return=representation" });
  return array(inserted)[0] || row;
};

export const getBookingSession = async (id) => {
  const rows = await supabaseRestRequest(SESSION_TABLE, { query: { id: `eq.${text(id, 80)}`, limit: 1 } });
  const session = array(rows)[0];
  if (!session) throw Object.assign(new Error("Booking session not found"), { statusCode: 404, code: "SESSION_NOT_FOUND" });
  if (Date.parse(session.expires_at) <= Date.now() && session.state !== "CONFIRMED") {
    throw Object.assign(new Error("Booking session expired"), { statusCode: 410, code: "SESSION_EXPIRED" });
  }
  return session;
};

export const revalidateBookingSession = async (id) => {
  const session = await getBookingSession(id);
  const offers = await getOffers({ propertyId: session.property_id, unitGroupId: session.unit_group_id, arrival: session.arrival, departure: session.departure, adults: session.adults, childrenAges: session.children_ages });
  const offer = findOffer(offers, session.rate_plan_id, session.unit_group_id);
  if (!offer) throw Object.assign(new Error("Selected offer is no longer available"), { statusCode: 409, code: "OFFER_UNAVAILABLE" });
  const selectedIds = new Set(array(session.selected_services).map((item) => text(item?.serviceId, 120)).filter(Boolean));
  const availableServices = selectedIds.size ? await getServiceOffers({
    ratePlanId: offer.ratePlanId, arrival: session.arrival, departure: session.departure,
    adults: session.adults, childrenAges: session.children_ages,
  }) : [];
  const selectedServices = availableServices.filter((item) => selectedIds.has(item.serviceId));
  if (selectedServices.length !== selectedIds.size) {
    throw Object.assign(new Error("One or more selected services are no longer available"), { statusCode: 409, code: "SERVICE_UNAVAILABLE" });
  }
  const currency = offer.totalGrossAmount.currency;
  if (selectedServices.some((item) => item.prePaymentGrossAmount.currency !== currency)) {
    throw Object.assign(new Error("Service and stay offer currencies do not match"), { statusCode: 409, code: "CURRENCY_MISMATCH" });
  }
  const totalMinor = majorToMinor(offer.totalGrossAmount.amount, currency);
  const prepaymentMinor = majorToMinor(offer.prePaymentGrossAmount.amount, currency) + selectedServices
    .reduce((sum, item) => sum + majorToMinor(item.prePaymentGrossAmount.amount, currency), 0);
  const changed = totalMinor !== Number(session.quoted_total_minor) || prepaymentMinor !== Number(session.prepayment_minor) || offer.minGuaranteeType !== session.guarantee_type;
  const paymentSatisfied = session.payment_state === "AUTHORIZED" || offer.minGuaranteeType === "PM6Hold";
  const patch = { quote: offer, selected_services: selectedServices, quoted_total_minor: totalMinor, prepayment_minor: prepaymentMinor,
    guarantee_type: offer.minGuaranteeType, state: changed ? "PRICE_CHANGED" : (paymentSatisfied ? "READY_TO_BOOK" : "READY_FOR_PAYMENT"), updated_at: new Date().toISOString() };
  const rows = await supabaseRestRequest(`${SESSION_TABLE}?id=eq.${encodeURIComponent(session.id)}`, { method: "PATCH", body: patch, prefer: "return=representation" });
  return { session: array(rows)[0] || { ...session, ...patch }, changed };
};
