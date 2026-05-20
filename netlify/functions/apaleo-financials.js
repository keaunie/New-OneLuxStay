import { jsonResponse } from "./_shared/http.js";
import { apaleoRequest } from "./_shared/apaleoService.js";

const allowedOrigins = [
  "http://localhost:8888",
  "http://localhost:5173",
  "https://oneluxstayprop.netlify.app",
  "https://oneluxstay.com",
];

const buildCorsHeaders = (event) => {
  const origin = event?.headers?.origin || "";

  return {
    "Access-Control-Allow-Origin": allowedOrigins.includes(origin)
      ? origin
      : "https://oneluxstayprop.netlify.app",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",
    "Access-Control-Allow-Methods":
      "GET, POST, OPTIONS",
    "Access-Control-Allow-Credentials": "true",
  };
};

// Ensures every response includes proper CORS headers.
const response = (event, statusCode, payload = {}) => {
  const corsHeaders = buildCorsHeaders(event);

  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
    },
    body: JSON.stringify(payload),
  };
};

// Wraps apaleoRequest so failed requests never break the response.
const safeRequest = async (path) => {
  try {
    const result = await apaleoRequest(path);

    return {
      ok: true,
      payload: result?.payload ?? result ?? {},
      error: null,
    };
  } catch (err) {
    console.error("[apaleo-financials] Request failed:", path, err);

    return {
      ok: false,
      payload: null,
      error: String(err?.message || err),
    };
  }
};

export async function handler(event) {
  // =========================
  // PRE-FLIGHT CORS SUPPORT
  // =========================
  if (event.httpMethod === "OPTIONS") {
    return response(event, 200, {});
  }

  if (event.httpMethod !== "GET") {
    return response(event, 405, {
      ok: false,
      message: "Method Not Allowed",
    });
  }

  try {
    const { reservationId } = event.queryStringParameters || {};

    const rid = String(reservationId || "").trim();

    if (!rid) {
      return response(event, 400, {
        ok: false,
        error: "reservationId is required",
      });
    }

    const enc = encodeURIComponent(rid);

    console.log("[apaleo-financials] Loading:", rid);

    // =========================
    // MAIN REQUESTS
    // =========================
    const [foliosRes, accountsRes, authsRes] = await Promise.all([
      safeRequest(`/finance/v1/reservations/${enc}/folios`),

      safeRequest(
        `/payment/v1/reservations/${enc}/payment-accounts`,
      ),

      safeRequest(
        `/payment/v1/reservations/${enc}/authorizations`,
      ),
    ]);

    console.log("[apaleo-financials] Folios:", foliosRes);
    console.log("[apaleo-financials] Accounts:", accountsRes);
    console.log("[apaleo-financials] Authorizations:", authsRes);

    // =========================
    // NORMALIZE PAYMENT ACCOUNTS
    // =========================
    let paymentAccounts = [];

    if (
      Array.isArray(accountsRes.payload?.paymentAccounts)
    ) {
      paymentAccounts =
        accountsRes.payload.paymentAccounts;
    } else if (
      Array.isArray(accountsRes.payload?.accounts)
    ) {
      paymentAccounts =
        accountsRes.payload.accounts;
    } else if (Array.isArray(accountsRes.payload)) {
      paymentAccounts = accountsRes.payload;
    }

    // =========================
    // NORMALIZE AUTHORIZATIONS
    // =========================
    let authorizations = [];

    if (
      Array.isArray(authsRes.payload?.authorizations)
    ) {
      authorizations =
        authsRes.payload.authorizations;
    } else if (Array.isArray(authsRes.payload)) {
      authorizations = authsRes.payload;
    }

    // =========================
    // NORMALIZE FOLIOS
    // =========================
    let rawFolios = [];

    if (Array.isArray(foliosRes.payload?.folios)) {
      rawFolios = foliosRes.payload.folios;
    } else if (Array.isArray(foliosRes.payload)) {
      rawFolios = foliosRes.payload;
    }

    // =========================
    // FETCH FOLIO CHARGES/PAYMENTS
    // =========================
    const folios = await Promise.all(
      rawFolios.map(async (folio) => {
        const folioId = String(
          folio?.id || "",
        ).trim();

        if (!folioId) {
          return {
            ...folio,
            charges: [],
            payments: [],
          };
        }

        const fEnc = encodeURIComponent(folioId);

        const [chargesRes, paymentsRes] =
          await Promise.all([
            safeRequest(
              `/finance/v1/folios/${fEnc}/charges`,
            ),

            safeRequest(
              `/finance/v1/folios/${fEnc}/payments`,
            ),
          ]);

        let charges = [];

        if (
          Array.isArray(chargesRes.payload?.charges)
        ) {
          charges = chargesRes.payload.charges;
        } else if (
          Array.isArray(chargesRes.payload)
        ) {
          charges = chargesRes.payload;
        }

        let payments = [];

        if (
          Array.isArray(paymentsRes.payload?.payments)
        ) {
          payments = paymentsRes.payload.payments;
        } else if (
          Array.isArray(paymentsRes.payload)
        ) {
          payments = paymentsRes.payload;
        }

        return {
          ...folio,
          charges,
          payments,
          _errors: {
            charges: chargesRes.ok
              ? null
              : chargesRes.error,
            payments: paymentsRes.ok
              ? null
              : paymentsRes.error,
          },
        };
      }),
    );

    // =========================
    // SUCCESS RESPONSE
    // =========================
    return response(event, 200, {
      ok: true,
      reservationId: rid,

      folios,
      paymentAccounts,
      authorizations,

      errors: {
        folios: foliosRes.ok
          ? null
          : foliosRes.error,

        paymentAccounts: accountsRes.ok
          ? null
          : accountsRes.error,

        authorizations: authsRes.ok
          ? null
          : authsRes.error,
      },
    });
  } catch (err) {
    console.error(
      "[apaleo-financials] Unhandled error:",
      err,
    );

    return response(event, 500, {
      ok: false,
      error: "Internal server error",
      detail: String(err?.message || err),
    });
  }
}