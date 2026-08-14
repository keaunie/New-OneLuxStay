import test from "node:test";
import assert from "node:assert/strict";
import { majorToMinor, minorToMajor, normalizeOffer, validateStay } from "../netlify/functions/_shared/apaleoBookingService.js";
import { normalizeApaleoProperty } from "../netlify/functions/_shared/apaleoService.js";

test("converts decimal major amounts without floating point rounding", () => {
  assert.equal(majorToMinor("151.00", "EUR"), 15100);
  assert.equal(majorToMinor("0.29", "EUR"), 29);
  assert.equal(majorToMinor("151", "JPY"), 151);
  assert.equal(minorToMajor(15100, "EUR"), 151);
  assert.equal(minorToMajor(151, "JPY"), 151);
});

test("validates dates, adults, and children ages", () => {
  assert.deepEqual(validateStay({ arrival: "2026-09-01", departure: "2026-09-04", adults: 2, childrenAges: [5, 8] }),
    { arrival: "2026-09-01", departure: "2026-09-04", adults: 2, childrenAges: [5, 8] });
  assert.throws(() => validateStay({ arrival: "2026-09-04", departure: "2026-09-01", adults: 2 }), /Departure/);
  assert.throws(() => validateStay({ arrival: "2020-09-01", departure: "2020-09-04", adults: 2 }), /past/);
  assert.throws(() => validateStay({ arrival: "2026-09-01", departure: "2026-09-04", adults: 2, childrenAges: [18] }), /Children/);
});

test("normalizes the identifiers and authoritative totals needed for booking", () => {
  const offer = normalizeOffer({ ratePlan: { id: "ANT-NRF", name: "Non-refundable" }, unitGroup: { id: "ANT-DBL", name: "Double" },
    minGuaranteeType: "Prepayment", availableUnits: 2, totalGrossAmount: { amount: 151, currency: "EUR" },
    prePaymentGrossAmount: { amount: 100, currency: "EUR" }, services: [{ service: { id: "CLEAN" } }] });
  assert.equal(offer.ratePlanId, "ANT-NRF");
  assert.equal(offer.unitGroupId, "ANT-DBL");
  assert.equal(offer.minGuaranteeType, "Prepayment");
  assert.equal(offer.totalGrossAmount.amount, "151");
});

test("normalizes Apaleo's property location without exposing financial fields", () => {
  const property = normalizeApaleoProperty({
    id: "HWH",
    code: "HWH",
    name: "D. HWH",
    description: "One Lux Stay HWH Downtown Los Angeles",
    location: {
      addressLine1: "354 S Spring St",
      postalCode: "90013",
      city: "Los Angeles",
      regionCode: "US-CA",
      countryCode: "US",
    },
    currencyCode: "USD",
    timeZone: "America/Los_Angeles",
    status: "Live",
    isArchived: false,
    bankAccount: { bank: "must not be public" },
    taxId: "must not be public",
  });
  assert.equal(property.city, "Los Angeles");
  assert.equal(property.address, "354 S Spring St");
  assert.equal(property.currencyCode, "USD");
  assert.equal(property.isLive, true);
  assert.equal("bankAccount" in property, false);
  assert.equal("taxId" in property, false);
});
