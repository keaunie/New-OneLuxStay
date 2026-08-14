import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { getPath, escapeHmacValue, isValidHmac, sessionIdFromMerchantReference } from "../netlify/functions/api-webhooks-adyen.js";

test("getPath reads dotted paths and returns undefined for missing branches", () => {
  assert.equal(getPath({ amount: { value: 15100 } }, "amount.value"), 15100);
  assert.equal(getPath({}, "amount.value"), undefined);
});

test("escapeHmacValue escapes backslashes and colons per Adyen's HMAC spec", () => {
  assert.equal(escapeHmacValue("a:b"), "a\\:b");
  assert.equal(escapeHmacValue("a\\b"), "a\\\\b");
  assert.equal(escapeHmacValue(undefined), "");
});

test("sessionIdFromMerchantReference strips the apaleo- prefix used by api-booking-payments.js", () => {
  assert.equal(sessionIdFromMerchantReference("apaleo-abc123"), "abc123");
  assert.equal(sessionIdFromMerchantReference("something-else"), "");
  assert.equal(sessionIdFromMerchantReference(""), "");
});

const HMAC_KEY_HEX = "44782DEF547AAA06C910C43932B1EB0C71FC68D9D25BDB8A5652E3384781658D";

const buildSignedItem = (overrides = {}) => {
  const item = {
    pspReference: "psp123",
    originalReference: "",
    merchantAccountCode: "OneLuxStayECOM",
    merchantReference: "apaleo-session-1",
    amount: { value: 15100, currency: "EUR" },
    eventCode: "AUTHORISATION",
    success: "true",
    ...overrides,
  };
  const fields = ["pspReference", "originalReference", "merchantAccountCode", "merchantReference", "amount.value", "amount.currency", "eventCode", "success"];
  const dataString = fields.map((field) => escapeHmacValue(getPath(item, field))).join(":");
  const signature = crypto.createHmac("sha256", Buffer.from(HMAC_KEY_HEX, "hex")).update(Buffer.from(dataString, "utf-8")).digest("base64");
  return { ...item, additionalData: { hmacSignature: signature } };
};

test("isValidHmac accepts a correctly signed notification item", () => {
  const item = buildSignedItem();
  assert.equal(isValidHmac(item, HMAC_KEY_HEX), true);
});

test("isValidHmac rejects a tampered notification item", () => {
  const item = buildSignedItem();
  item.amount.value = 1;
  assert.equal(isValidHmac(item, HMAC_KEY_HEX), false);
});

test("isValidHmac rejects when the key or signature is missing", () => {
  const item = buildSignedItem();
  assert.equal(isValidHmac(item, ""), false);
  assert.equal(isValidHmac({ ...item, additionalData: {} }, HMAC_KEY_HEX), false);
});
