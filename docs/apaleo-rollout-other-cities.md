# Rolling out Apaleo + Adyen to LA, Redondo Beach, Miami, and Dubai

This extends the Antwerp Apaleo IBE work (see `docs/apaleo-ibe-deployment.md`) to the other
four city pages. The code ships with the checkout flow wired and switched on
(`LEGACY_CHECKOUT_ENABLED = false` in each landing page — see below), but nothing will actually
work for a given property until the real Apaleo/Adyen identifiers are entered per the checklist
below. Until then, guests hitting "Reserve" will see errors from the booking-session API (e.g.
`PROPERTY_NOT_ALLOWED` / `APALEO_MAPPING_MISSING`), not a broken page — the frontend does not fall
back to Guesty.

## What changed in the codebase

- New shared checkout UI: `src/components/apaleo-checkout/` (`DateOfferSearch.jsx`,
  `AdyenPaymentPanel.jsx`, `ApaleoCheckoutModal.jsx`) and `src/hooks/useApaleoBookingFlow.js`,
  driving the existing `api-booking-*` backend via `src/services/apaleoBookingApi.js`.
- `src/LosAngelesLandingPage.jsx`, `src/RedondoBeachLandingPage.jsx`,
  `src/MiamiBeachLandingPage.jsx`, `src/DubaiLandingPage.jsx`: the "Reserve" buttons now open
  `ApaleoCheckoutModal` instead of the legacy Guesty/Stripe modal. The legacy checkout code
  (state, handlers, modal JSX) is still present in each file, gated behind
  `const LEGACY_CHECKOUT_ENABLED = false;` near the top — flip that back to `true` per-file as an
  emergency rollback for that one city without touching anything else.
- `src/App.jsx` / `src/utils/routePreloaders.js`: Miami now has real routes (`/miami`,
  `/miami-beach`, and their sub-routes) pointing at `MiamiBeachLandingPage.jsx` instead of
  redirecting to `/global`.
- `netlify/functions/api-booking-confirm.js`: now also persists a consent record/PDF and emails
  the guest on confirmation (previously only the legacy Guesty flow did this), via the shared
  `netlify/functions/_shared/consentProofService.js`.
- `netlify/functions/api-webhooks-adyen.js`: new — handles Adyen's asynchronous payment
  notifications as a safety net for redirect-based payment methods.
- The old day-by-day priced calendar is replaced by `DateOfferSearch` on these four pages: Apaleo
  prices a specific stay via `/booking/v1/offers`, it doesn't expose a nightly-rate grid the way
  Guesty's calendar endpoint does.

## Per-property enablement checklist

Repeat for each of: LA, Redondo Beach, Miami, Dubai. Nothing here can be filled in without
access to the Apaleo and Adyen dashboards for these accounts.

1. **`apaleo_property_mappings`** — insert a row per property:
   `{ local_property_id, apaleo_property_id, enabled: true }`. `local_property_id` should match
   whatever id the site already uses for that listing (the same value passed as `localPropertyId`
   from the frontend).
2. **`apaleo_inventory_mappings`** — insert at least one row per bookable unit:
   `{ apaleo_property_id, mapping_type: 'unit_group', local_id: <same listing id as above>,
   apaleo_id: <real Apaleo unit-group id>, enabled: true }`. Without this row,
   `resolveBookingTarget` in `apaleoBookingService.js` returns `409 APALEO_MAPPING_MISSING` for
   any booking attempt on that listing.
3. **Adyen config** — confirm `ADYEN_API_KEY`, `ADYEN_MERCHANT_ACCOUNT`, `ADYEN_CLIENT_KEY`, and
   `ADYEN_HMAC_KEY` are set in Netlify. These are account-level and likely already shared with
   Antwerp's configuration; if these four cities settle on separate Adyen merchant accounts or
   currencies, this needs revisiting per-property rather than globally.
4. **Adyen webhook** — in the Adyen Customer Area, add a standard webhook pointed at
   `https://<site>/.netlify/functions/api-webhooks-adyen`, HMAC signing enabled with the same key
   as `ADYEN_HMAC_KEY`, subscribed to at least the `AUTHORISATION` event.
5. **Flip the flag live** — once 1–4 are done for a given property and it's been exercised end to
   end (checklist below), it's already live by default (`LEGACY_CHECKOUT_ENABLED = false`); there
   is no separate step. If it's not ready yet, temporarily set `LEGACY_CHECKOUT_ENABLED = true` in
   that one city's landing page file to fall back to Guesty/Stripe for that property only.

## Known limitation: redirect-only Adyen payment methods

`AdyenPaymentPanel.jsx` mounts Adyen's Drop-in inside the checkout modal. Card payments and
wallet methods that use an overlay/iframe (Google Pay, Apple Pay, most 3DS challenges) work
end-to-end. Payment methods that fully navigate the browser away and back (e.g. iDEAL) return the
guest to `/booking-confirmation?bookingSessionId=...`, but the guest details and consent
signature collected earlier in the modal do not survive that full-page navigation — they only
exist in React state. `BookingConfirmationPage.jsx` will complete the payment
(`submitApaleoPaymentDetails`) and poll for confirmation, but if the session was never confirmed
before the redirect, it cannot auto-confirm without guest/consent data and will show a "payment
is being processed" message instead of a finished booking.

Until session-side guest/consent persistence is added (a schema change, out of scope here),
restrict the Adyen merchant account's allowed payment methods to card and overlay-based wallets
for these four properties, or accept that redirect-method bookings need manual follow-up.

## Manual test checklist (per property, once enabled)

Same as `docs/apaleo-ibe-deployment.md`'s 10-point list, plus:

11. Confirm the "Reserve" button on the property's page opens `ApaleoCheckoutModal` (not the old
    Guesty modal) and that dates/guests search returns real Apaleo offers.
12. Confirm the confirmation email and consent PDF arrive (via `consent-proof.js`) — this path
    was previously only exercised by the legacy Guesty flow.
13. Confirm `LEGACY_CHECKOUT_ENABLED = true` on that one page alone restores the old flow without
    affecting the other three cities.
