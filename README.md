# One Lux Stay Website

This project is a React + Vite frontend with Netlify Functions for server-side integrations.

## AI Concierge

The site now includes a floating AI concierge widget powered by a Netlify function at `netlify/functions/chat.js`.

Manual concierge content lives in `src/data/conciergeKnowledge.js`.
Edit that file to add or update:

- contact details
- booking guidance
- policies and house rules
- city notes
- FAQ answers
- page guidance copy

Required environment variables:

- `OPENAI_API_KEY`: your OpenAI API key
- `OPENAI_CHAT_MODEL`: optional override for the default model (`gpt-5-mini`)
- `VITE_API_BASE`: optional frontend functions base override
- `VITE_NETLIFY_SITE_URL`: optional absolute Netlify site URL used when the frontend is hosted away from Netlify
- `AI_ALLOWED_ORIGINS`: comma-separated allowed origins for AI endpoints
- `AI_RATE_LIMIT_MAX_REQUESTS`: max AI requests per window (default `20`)
- `AI_RATE_LIMIT_WINDOW_MS`: AI rate-limit window in ms (default `60000`)
- `AI_BLOCK_BOT_UA`: block obvious bot user-agents (`true`/`false`)
- `AI_QUERY_ENABLED`: set `true` to enable `/.netlify/functions/ai-query` in production
- `VITE_ENABLE_AI_AGENT_CONSOLE`: set `true` only when `/ai-agent` should be publicly routable
- `VITE_FORCE_REMOTE_FUNCTIONS`: set `true` only if frontend is hosted outside Netlify and must call an absolute Netlify functions origin
- `ADMINS_OLS_ACCESS_KEY`: optional legacy shared key fallback for the `/admins-ols` admin API
- `ADMINS_OLS_SIGNUP_KEY`: required if you want to create admin accounts from `/admins-ols/login`
- `ADMINS_OLS_ALLOWED_EMAILS`: optional comma-separated emails that should always be treated as admins
- `ADMINS_OLS_SUPERADMIN_EMAILS`: optional comma-separated emails allowed to see the hidden admin audit log

Behavior notes:

- The browser never receives the OpenAI API key.
- The assistant is page-aware and receives route context from the current page.
- The assistant is instructed not to invent live pricing, availability, or policy details it cannot verify.
- Optional chat learning capture is available:
  - Turn logging endpoint: `netlify/functions/chat-learning.js`
  - Session/messages/feedback tables: `chat_sessions`, `chat_messages`, `chat_feedback`
  - Guests can rate assistant replies as `good`/`bad`; recent ratings are used as prompt coaching context.
  - Admins can open `/admins-ols` to review chat activity and add prompt-level sentiment lessons.
  - Admin auth now uses `/admins-ols/login` and signs in with existing Supabase Authentication users from the same project.

## AI Agent (RAG + Booking Handoff)

An additive AI agent endpoint is available at:

- `netlify/functions/ai-query.js`

This endpoint:

- retrieves relevant policy/company sections from Supabase vector search
- uses OpenAI embeddings + response generation
- can read listing context from existing listing APIs
- can call existing booking APIs (`api-availability`, `api-checkout`) without modifying booking logic

Supabase retrieval function/index migration is defined in:

- `supabase/migrations/20260326_add_ai_knowledge_tables.sql`

Seed and embed scripts:

- `npm run supabase:seed:ai-docs`
- `npm run supabase:embed:ai-docs`

New environment variables:

- `OPENAI_AI_QUERY_MODEL` (default: `gpt-5-mini`)
- `OPENAI_EMBEDDING_MODEL` (default: `text-embedding-3-small`)
- `SUPABASE_AI_DOCS_TABLE` (default: `documents`)
- `SUPABASE_AI_SECTIONS_TABLE` (default: `sections`)
- `SUPABASE_AI_MATCH_RPC` (default: `match_document_sections`)
- `SUPABASE_CHAT_SENTIMENT_TABLE` (default: `chat_sentiment_lessons`)

Frontend test console route:

- `/ai-agent`

## Development

- `npm run dev` runs local Vite + Netlify Functions via Netlify Dev
- `npm run dev:client` runs Vite only (no Netlify function proxy)
- `npm run lint` runs ESLint
- `npm run build` builds the frontend bundle

## Supabase Migration Prep

The project now supports a staged data-provider rollout so we can move data into Supabase without breaking current Guesty flows.

### 1) Create/Apply schema

Apply Supabase migrations, including:

- `supabase/migrations/20260323_prepare_site_data_tables.sql`

This creates:

- `public.listings`
- `public.listing_nightly_prices`
- `public.site_content`
- `public.listings_public` view

### 2) Configure environment

Set at minimum:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional table names:

- `SUPABASE_LISTINGS_TABLE` (default: `listings`)
- `SUPABASE_AVAILABILITY_TABLE` (default: `listing_nightly_prices`)
- `SUPABASE_SITE_CONTENT_TABLE` (default: `site_content`)
- `SUPABASE_BOOKINGS_TABLE` (default: `bookings`)

### 3) Seed/sync data

- `npm run supabase:seed:content` seeds concierge + review content into `site_content`.
- `npm run supabase:sync:listings` syncs listings from your listings endpoint into Supabase.
- `npm run supabase:health` validates Supabase connectivity for the core tables.

### 4) Switch provider incrementally

These toggles enable Supabase per domain:

- `SUPABASE_USE_FOR_LISTINGS=true`
- `SUPABASE_USE_FOR_AVAILABILITY=true`
- `SUPABASE_USE_FOR_CONTENT=true`

Or set one global provider:

- `APP_DATA_PROVIDER=supabase`

If you want strict Supabase-only behavior (no Guesty fallback), set:

- `APP_DATA_PROVIDER_ENFORCE=true`

## Google Vacation Rentals Feed

A first Hotel List XML endpoint for Google Vacation Rentals is available at:

- `/.netlify/functions/google-vr-hotel-list`

It reads from Supabase (`properties` by default) and outputs XML in `<listings>` / `<listing>` format.

Environment variables:

- `GOOGLE_VR_FEED_TABLE` (default: `properties`)
- `GOOGLE_VR_FEED_LANGUAGE` (default: `en`)
- `GOOGLE_VR_WEBSITE_BASE_URL` (for per-listing direct links)
- `GOOGLE_VR_DEFAULT_COUNTRY` (default: `US`)
- `GOOGLE_VR_DEFAULT_PHONE` (optional)
- `GOOGLE_VR_DEFAULT_CATEGORY` (default: `vacation_rental`)

### Backfilling coordinates (required for listings to emit)

The Google VR Hotel List feed only emits `<listing>` items when `latitude` and `longitude` are present.

1) Apply the migration that adds `properties.latitude` / `properties.longitude`:

- `supabase/migrations/20260421144000_add_properties_lat_lng.sql`

2) Backfill missing coordinates via Nominatim (slow + rate-limited):

- Dry-run: `npm run supabase:geocode:properties`
- Apply updates: `npm run supabase:geocode:properties -- --apply`

Then regenerate the feed:

- `npm run google:vr:debug -- --live --out=google-vr-hotel-list.xml`

### Syncing Guesty → Supabase (recommended)

If your `properties.id` values are **not** Guesty listing IDs, you can still sync Guesty data into Supabase by storing the Guesty listing ID alongside each property, then syncing calendar pricing.

1) Add `properties.guesty_listing_id`:

- Apply: `supabase/migrations/20260423102000_add_properties_guesty_listing_id.sql`

2) Map Guesty listings to Supabase properties (uses lat/lng when available, falls back to address match):

- Dry-run: `npm run supabase:map:guesty-listings`
- Apply: `npm run supabase:map:guesty-listings -- --apply`

3) Sync nightly prices from Guesty calendar into `property_nightly_prices`:

- Dry-run: `npm run supabase:sync:property-nightly-prices`
- Apply: `npm run supabase:sync:property-nightly-prices -- --apply --days=90`

Once populated, the Google ARI endpoints will emit rate + availability messages from `property_nightly_prices`.

## Google ARI (Pricing + Availability)

To show pricing in Google Hotel Center / Google Vacation Rentals, you generally need:

- Hotel List feed (this repo: `/.netlify/functions/google-vr-hotel-list`)
- Transaction (Property Data) message (defines `RoomID` + `PackageID`)
- Rate messages (`OTA_HotelRateAmountNotifRQ`)
- Availability messages (`OTA_HotelAvailNotifRQ`)

This repo provides starter generators for the last three as Netlify Functions:

- `/.netlify/functions/google-vr-ari-property-data?hotel_id=HOTEL_ID`
- `/.netlify/functions/google-vr-ari-rate?hotel_id=HOTEL_ID&start=YYYY-MM-DD&days=30`
- `/.netlify/functions/google-vr-ari-avail?hotel_id=HOTEL_ID&start=YYYY-MM-DD&days=30`

Notes:

- These endpoints read from Supabase `SUPABASE_AVAILABILITY_TABLE` for rates + availability. If you are using the `properties` table as your primary dataset, create `property_nightly_prices` via `supabase/migrations/20260421175000_create_property_nightly_prices.sql` and set `SUPABASE_AVAILABILITY_TABLE=property_nightly_prices`.
- They generate **one hotel per response** (use `hotel_id` that matches the Hotel List feed `<id>`).

Environment variables:

- `GOOGLE_ARI_PARTNER_KEY` (required for `google-vr-ari-property-data`; used for POS in rate/avail messages)
- `GOOGLE_ARI_DEFAULT_DAYS` (default: `30`)
- `GOOGLE_ARI_MAX_DAYS` (default: `180`)
- `GOOGLE_ARI_DEFAULT_GUESTS` (default: `2`)

Local preview (mock data by default):

- `npm run google:ari:debug -- property --hotel-id=demo-hotel-1`
- `npm run google:ari:debug -- rate --hotel-id=demo-hotel-1 --start=2026-04-21 --days=14 --out=ari-rate.xml`
- `npm run google:ari:debug -- avail --hotel-id=demo-hotel-1 --start=2026-04-21 --days=14 --out=ari-avail.xml`
