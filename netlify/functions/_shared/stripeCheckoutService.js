import Stripe from "stripe";

const ZERO_DECIMAL_CURRENCIES = new Set([
  "bif",
  "clp",
  "djf",
  "gnf",
  "jpy",
  "kmf",
  "krw",
  "mga",
  "pyg",
  "rwf",
  "ugx",
  "vnd",
  "vuv",
  "xaf",
  "xof",
  "xpf",
]);

let stripeClient;

export const getStripeClient = () => {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  if (!secretKey) throw new Error("Missing STRIPE_SECRET_KEY");
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, { apiVersion: "2023-10-16" });
  }
  return stripeClient;
};

export const toStripeAmount = (amount, currency) => {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const normalized = String(currency || "USD").trim().toLowerCase();
  return ZERO_DECIMAL_CURRENCIES.has(normalized)
    ? Math.round(numeric)
    : Math.round(numeric * 100);
};

export const parseWebhookSecrets = () =>
  Array.from(
    new Set(
      [
        process.env.STRIPE_WEBHOOK_SECRET,
        process.env.STRIPE_WEBHOOK_SECRETS,
        process.env.STRIPE_WEBHOOK_SECRET_NEXT,
      ]
        .flatMap((value) => String(value || "").split(/[\s,;]+/))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

