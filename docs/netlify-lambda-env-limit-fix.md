# Netlify Lambda 4KB Env Limit Fix

If deploy fails with:

`Your environment variables exceed the 4KB limit imposed by AWS Lambda`

this means too many/too-large variables are being sent to every Netlify Function.

## 1) Keep only function-needed variables in Function scope

For this project, keep these in Function scope:

- `GUESTY_OPEN_API_CLIENT_ID` (or `GUESTY_CLIENT_ID`)
- `GUESTY_OPEN_API_CLIENT_SECRET` (or `GUESTY_CLIENT_SECRET`)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

Optional function vars:

- `OPENAI_API_KEY`, `OPENAI_CHAT_MODEL`
- `OPENAI_AI_QUERY_MODEL`, `OPENAI_EMBEDDING_MODEL`
- `GUESTY_EXTRA_LISTING_IDS`, `GUESTY_ONLY_LISTING_IDS`
- `GUESTY_HIDDEN_LISTING_IDS`, `GUESTY_HIDDEN_LISTING_TITLES`
- `GUESTY_TOKEN_BLOB_STORE`, `GUESTY_TOKEN_BLOB_KEY`
- `GUESTY_BASE_URL`, `GUESTY_OPEN_API_HOST`
- `PUBLIC_SITE_URL`

## 2) Remove these from Function scope (or delete if unused)

These are not referenced by Netlify Functions code:

- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_SHEET_ID`
- `GOOGLE_SHEETS_SHEET_NAME`
- `GUESTY_BE_CLIENT_ID`
- `GUESTY_BE_CLIENT_SECRET`
- `GUESTY_PM_G_AID_CS`
- `GUESTY_PM_ORIGIN`
- `GUESTY_PM_REFERER`
- `GUESTY_PM_X_REQUEST_CONTEXT`
- `GUESTY_MAX_CONCURRENT`
- `GUESTY_MIN_INTERVAL_MS`
- `GUESTY_LISTINGS_CACHE_TTL_MS`
- `STRIPE_SECRET_KEY_test`
- `VITE_API_BASE`
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_LANDING_GALLERY_LISTING_IDS`
- `PORT`

`VITE_*` should be Build scope only.

## 3) Fast audit command

Run:

```bash
npm run netlify:env:audit
```

To compare against a list of variable names:

```bash
node scripts/audit-netlify-function-env.mjs ./my-env-key-list.txt
```

Where `my-env-key-list.txt` contains one env key per line.
