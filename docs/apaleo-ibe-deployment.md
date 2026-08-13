# Apaleo IBE deployment

Apaleo is the global PMS and inventory authority for every bookable property. Existing Stripe checkout remains available as a payment option, but Guesty must not be used as the source of availability, restrictions, rates, or reservations after cutover.

## Required configuration

Set secret values in Netlify, never in committed files:

- `APALEO_CLIENT_ID`, `APALEO_CLIENT_SECRET`, and the minimum scopes in `APALEO_SCOPE`.
- Enable every migrated property in `apaleo_property_mappings`. `APALEO_PROPERTY_IDS` is an emergency/additive allow-list only. If neither source has IDs, no properties are exposed.
- `ADYEN_API_KEY`, `ADYEN_MERCHANT_ACCOUNT`, `ADYEN_CLIENT_KEY`, and `ADYEN_ENVIRONMENT=test`.
- `ADYEN_LIVE_URL_PREFIX` only when switching to live Adyen.
- `APALEO_WEBHOOK_SECRET`: a high-entropy value placed in the Apaleo subscription URL as `?token=...`.

Apply `supabase/migrations/20260813090000_apaleo_ibe_foundation.sql`, then insert enabled property and inventory mappings. Keep Row Level Security enabled; these tables are server-only.

## Internal endpoints

- `api-booking-properties`, `api-booking-offers`, `api-booking-service-offers`
- `api-booking-sessions`, `api-booking-session-revalidate`
- `api-booking-payment-methods`, `api-booking-payments`, `api-booking-payment-details`
- `api-booking-confirm`, `api-booking-confirmation`
- `api-webhooks-apaleo`

## Manual test checklist

1. In Adyen test mode, verify only allow-listed properties are returned.
2. Search a multi-night offer with adults and children ages; compare totals, city tax, restrictions, and mandatory services to Apaleo.
3. Select and remove an optional service and verify server revalidation.
4. Exercise `Prepayment`, `CreditCard`, and `PM6Hold` offers independently.
5. Complete successful and failed 3DS test cards and a declined payment retry.
6. Change the rate or inventory before revalidation and confirm the browser receives `PRICE_CHANGED` or `OFFER_UNAVAILABLE`.
7. Double-submit confirmation and confirm only one Apaleo booking is created.
8. Deliver the same webhook twice and confirm one `apaleo_webhook_events` row.
9. Verify every city uses Apaleo offers. If Stripe is offered, verify it is only the payment processor and does not restore Guesty pricing or availability.
10. Review sessions in recovery states before any manual retry. Never automatically retry `PAYMENT_AUTHORIZED_BOOKING_UNKNOWN`.

## Webhook subscription

Create an Apaleo subscription for only enabled property IDs and required reservation events. Use:

`https://<site>/.netlify/functions/api-webhooks-apaleo?token=<APALEO_WEBHOOK_SECRET>`

Apaleo sends a health check during subscription creation. Record the returned subscription ID operationally so it can be removed during rollback.

## Rollback

Disable the global Apaleo checkout feature flag and stop accepting new bookings. Do not silently restore Guesty as an inventory authority after the operational migration. Do not delete session, payment, or webhook records. Remove the Apaleo webhook subscriptions, then disable the mapped properties. Existing Stripe payment infrastructure does not need removal.

## Retention

Expire abandoned sessions after 30 minutes by default. Schedule deletion or anonymization of expired, unconfirmed sessions according to the privacy policy. Retain payment references and confirmed booking audit data only as long as operational and legal requirements demand.
