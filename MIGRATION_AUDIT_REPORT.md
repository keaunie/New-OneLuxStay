# Migration Audit Report

**Generated:** 2026-06-12  
**Scope:** `supabase/migrations/` — 18 files  
**Audited for:** broken `properties` / `property_nightly_prices` / `property_id` references

---

## Executive Summary

| Severity | Count | Description |
|---|---|---|
| HARD FAILURE | 1 | Will throw an error on a fresh deploy |
| SILENT FAILURE | 3 | Uses `IF EXISTS` guard; runs without error but does nothing |
| NAMING INCONSISTENCY | 3 | Wrong column/table names relative to what production uses |
| ORDERING BUG | 1 | File sorts before its dependency due to filename format mixing |
| DEAD CODE | 1 | Conditional block targeting a table that doesn't exist |

**Tables that do NOT exist in production but are referenced by migrations:**
- `public.properties` — never created; 5 migrations reference it
- `public.property_nightly_prices` — creation migration would fail; table does not exist

---

## Tables That Exist in Production

Derived from migrations that successfully create tables:

| Table | Created By | Status |
|---|---|---|
| `public.bookings` | `20260319_create_bookings.sql` | ✅ Exists |
| `public.listings` | `20260323_prepare_site_data_tables.sql` | ✅ Exists |
| `public.listing_nightly_prices` | `20260323_prepare_site_data_tables.sql` | ✅ Exists |
| `public.site_content` | `20260323_prepare_site_data_tables.sql` | ✅ Exists |
| `public.chat_sessions` | `20260404043000_add_chat_learning_tables.sql` | ✅ Exists |
| `public.chat_messages` | `20260404043000_add_chat_learning_tables.sql` | ✅ Exists |
| `public.chat_feedback` | `20260404043000_add_chat_learning_tables.sql` | ✅ Exists |
| `public.chat_sentiment_lessons` | `20260408093000_add_chat_sentiment_lessons.sql` | ✅ Exists |
| `public.admins_ols_activity_log` | `20260409091500_add_admins_ols_activity_log.sql` | ✅ Exists |
| `public.guest_city_click_events` | `20260409113000_add_guest_city_click_events.sql` | ✅ Exists |
| `public.admin_presence` | `20260514113000_create_admin_presence_table.sql` | ✅ Exists |
| `public.properties` | *(never created)* | ❌ Does NOT exist |
| `public.property_nightly_prices` | `20260421175000` — creation fails | ❌ Does NOT exist |

> **Note:** `public.documents` and `public.sections` are referenced in `20260326_add_ai_knowledge_tables.sql` but not created by these migrations. They are likely managed outside this directory (e.g., Supabase AI assistant schema or a separate seed). Their existence is not verified here.

---

## Missing Columns from `public.listings`

These columns were intended to be added to what is now `public.listings`, but the migrations targeting them were broken (they targeted the non-existent `public.properties`):

| Column | Intended By | Status |
|---|---|---|
| `latitude double precision` | `20260421144000` | ❌ Missing from `listings` |
| `longitude double precision` | `20260421144000` | ❌ Missing from `listings` |
| `guesty_listing_id text` | `20260423102000` | ❌ Missing from `listings` |
| `accommodates integer` | `20260426093000` | ✅ Already present (added in `20260323`) |
| Constraint `listings_accommodates_min_one` | `20260426093000` | ❌ Missing (migration silently skipped) |
| Index `properties_accommodates_idx` | `20260426093000` | ❌ Missing / wrong name |

---

## Broken Migrations — Full Reference List

---

### 1. `20260421175000_create_property_nightly_prices.sql` — HARD FAILURE

**Every line is broken.** The migration creates a table that should not exist, referencing a parent table that does not exist.

| Line | Old Reference | Problem | Recommended Fix |
|---|---|---|---|
| 1 | `create table if not exists public.property_nightly_prices` | Duplicates `public.listing_nightly_prices` already created in `20260323` | Entire migration is superseded — safe to replace with a no-op comment |
| 2 | `references public.properties(id) on delete cascade` | `public.properties` does not exist → FK creation throws an error | Change to `references public.listings(id)` — but table should not be re-created at all |
| 15 | `primary key (property_id, date)` | Column named `property_id` | Should be `listing_id` |
| 18 | `property_nightly_prices_date_idx` | Index name references removed table | Rename to `listing_nightly_prices_date_idx` |
| 19 | `property_nightly_prices_property_id_idx` | Index name references removed table | Rename to `listing_nightly_prices_listing_id_idx` |

**Recommended action:** Replace the entire file with a single `-- superseded by 20260323_prepare_site_data_tables.sql` comment, or delete the migration and re-number. Do not re-create the table.

---

### 2. `20260421144000_add_properties_lat_lng.sql` — SILENT FAILURE

`alter table if exists` prevents an error but the operation does nothing because `public.properties` does not exist. `latitude` and `longitude` are never added to `public.listings`.

| Line | Old Reference | Recommended Replacement |
|---|---|---|
| 1 | `alter table if exists public.properties` | `alter table if exists public.listings` |
| 11 | `where conname = 'properties_latitude_range'` | `where conname = 'listings_latitude_range'` |
| 15 | `alter table public.properties` | `alter table public.listings` |
| 16 | `add constraint properties_latitude_range` | `add constraint listings_latitude_range` |
| 23 | `where conname = 'properties_longitude_range'` | `where conname = 'listings_longitude_range'` |
| 27 | `alter table public.properties` | `alter table public.listings` |
| 28 | `add constraint properties_longitude_range` | `add constraint listings_longitude_range` |
| 33 | `create index if not exists properties_lat_lng_idx` | `create index if not exists listings_lat_lng_idx` |
| 34 | `on public.properties (latitude, longitude)` | `on public.listings (latitude, longitude)` |

---

### 3. `20260423102000_add_properties_guesty_listing_id.sql` — SILENT FAILURE

`alter table if exists` prevents an error but does nothing. `guesty_listing_id` is never added to `public.listings`.

| Line | Old Reference | Recommended Replacement |
|---|---|---|
| 1 | `alter table if exists public.properties` | `alter table if exists public.listings` |
| 4 | `create index if not exists properties_guesty_listing_id_idx` | `create index if not exists listings_guesty_listing_id_idx` |
| 5 | `on public.properties (guesty_listing_id)` | `on public.listings (guesty_listing_id)` |

---

### 4. `20260426093000_add_properties_accommodates.sql` — SILENT FAILURE (partial)

`alter table if exists` prevents an error. The `accommodates` column itself already exists in `public.listings` (added by `20260323`), but the CHECK constraint and index were never applied to it.

| Line | Old Reference | Recommended Replacement |
|---|---|---|
| 1 | `alter table if exists public.properties` | `alter table if exists public.listings` — but `add column if not exists` is now a no-op; only the constraint/index need adding |
| 10 | `where conname = 'properties_accommodates_min_one'` | `where conname = 'listings_accommodates_min_one'` |
| 14 | `alter table public.properties` | `alter table public.listings` |
| 15 | `add constraint properties_accommodates_min_one` | `add constraint listings_accommodates_min_one` |
| 20 | `create index if not exists properties_accommodates_idx` | `create index if not exists listings_accommodates_idx` |
| 21 | `on public.properties (accommodates)` | `on public.listings (accommodates)` |

---

### 5. `20260319_create_bookings.sql` — NAMING INCONSISTENCY

The migration creates `public.bookings` with `property_id text`. This is a plain `text` column, not a foreign key, so it does **not** cause a migration error. However, it is inconsistent with the `listing_id` naming used everywhere else (e.g., `public.listing_nightly_prices.listing_id`, `public.chat_sessions.listing_id`).

| Line | Old Reference | Recommended Replacement |
|---|---|---|
| 5 | `property_id text not null` | `listing_id text not null` |
| 22 | `bookings_property_id_idx on public.bookings (property_id)` | `bookings_listing_id_idx on public.bookings (listing_id)` |

**Note:** Renaming an existing column requires an `ALTER TABLE ... RENAME COLUMN` migration. A new migration should be written rather than editing this file.

---

### 6. `20260512060000_add_pms_provider_columns.sql` — NAMING INCONSISTENCY + DEAD CODE

This migration correctly targets `public.listings` and `public.listing_nightly_prices`. Two issues remain:

**Naming inconsistency — line 69:**

| Line | Old Reference | Recommended Replacement |
|---|---|---|
| 69 | `add column if not exists provider_property_id text` (on `listing_nightly_prices`) | `provider_listing_id text` — the column stores a provider's listing identifier, not a property identifier |

**Dead code — lines 71–82:**

```sql
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'property_nightly_prices'
  ) then
    execute 'alter table public.property_nightly_prices add column ...';
    execute 'alter table public.property_nightly_prices add column ...';
  end if;
end $$;
```

This block targets `public.property_nightly_prices` which does not exist in production. The `IF EXISTS` guard means it silently does nothing. It is legacy cleanup code that can be removed.

---

## Migration Ordering Issue

### `20260319153000_drop_booking_deposit_status.sql` runs BEFORE `20260319_create_bookings.sql`

Supabase applies migrations in lexicographic (filename) order. Due to mixing timestamp formats:
- `20260319153000_drop_booking_deposit_status.sql` — 14-digit timestamp prefix
- `20260319_create_bookings.sql` — 8-digit date-only prefix

At position 9 in the filename, `'1'` (ASCII 49) sorts before `'_'` (ASCII 95), so the **drop** migration runs **before** the **create** migration.

**Practical impact:** Both SQL statements use `IF EXISTS` guards, so no hard error occurs. The drop migration is a no-op on first run, and the table is created correctly afterward. However, the logical intent is inverted and this is a latent risk if guards are ever removed.

**Recommended action:** Rename `20260319_create_bookings.sql` to `20260319000000_create_bookings.sql` (or any timestamp that sorts before `20260319153000`) to restore correct ordering.

---

## Orphaned Schema References — Summary Table

| File | Line | Old Reference | Type | Recommended Replacement |
|---|---|---|---|---|
| `20260421175000_create_property_nightly_prices.sql` | 1 | `public.property_nightly_prices` | Table name | **Delete/replace entire file** — superseded by `20260323` |
| `20260421175000_create_property_nightly_prices.sql` | 2 | `public.properties(id)` | FK target | `public.listings(id)` — moot if file is replaced |
| `20260421175000_create_property_nightly_prices.sql` | 2 | `property_id uuid` | Column name | `listing_id text` — moot if file is replaced |
| `20260421175000_create_property_nightly_prices.sql` | 15 | `primary key (property_id, date)` | Column name | `(listing_id, date)` — moot if file is replaced |
| `20260421175000_create_property_nightly_prices.sql` | 18 | `property_nightly_prices_date_idx` | Index name | Moot if file is replaced |
| `20260421175000_create_property_nightly_prices.sql` | 19 | `property_nightly_prices_property_id_idx` | Index name | Moot if file is replaced |
| `20260421144000_add_properties_lat_lng.sql` | 1 | `public.properties` | Table name | `public.listings` |
| `20260421144000_add_properties_lat_lng.sql` | 11 | `properties_latitude_range` | Constraint name | `listings_latitude_range` |
| `20260421144000_add_properties_lat_lng.sql` | 15–16 | `public.properties` / `properties_latitude_range` | Table + constraint | `public.listings` / `listings_latitude_range` |
| `20260421144000_add_properties_lat_lng.sql` | 23 | `properties_longitude_range` | Constraint name | `listings_longitude_range` |
| `20260421144000_add_properties_lat_lng.sql` | 27–28 | `public.properties` / `properties_longitude_range` | Table + constraint | `public.listings` / `listings_longitude_range` |
| `20260421144000_add_properties_lat_lng.sql` | 33–34 | `properties_lat_lng_idx` on `public.properties` | Index | `listings_lat_lng_idx` on `public.listings` |
| `20260423102000_add_properties_guesty_listing_id.sql` | 1 | `public.properties` | Table name | `public.listings` |
| `20260423102000_add_properties_guesty_listing_id.sql` | 4–5 | `properties_guesty_listing_id_idx` on `public.properties` | Index | `listings_guesty_listing_id_idx` on `public.listings` |
| `20260426093000_add_properties_accommodates.sql` | 1 | `public.properties` | Table name | `public.listings` |
| `20260426093000_add_properties_accommodates.sql` | 10 | `properties_accommodates_min_one` | Constraint name | `listings_accommodates_min_one` |
| `20260426093000_add_properties_accommodates.sql` | 14–15 | `public.properties` / `properties_accommodates_min_one` | Table + constraint | `public.listings` / `listings_accommodates_min_one` |
| `20260426093000_add_properties_accommodates.sql` | 20–21 | `properties_accommodates_idx` on `public.properties` | Index | `listings_accommodates_idx` on `public.listings` |
| `20260319_create_bookings.sql` | 5 | `property_id text` | Column name | `listing_id text` (requires separate rename migration) |
| `20260319_create_bookings.sql` | 22 | `bookings_property_id_idx` on `(property_id)` | Index | `bookings_listing_id_idx` on `(listing_id)` (requires separate migration) |
| `20260512060000_add_pms_provider_columns.sql` | 69 | `provider_property_id` on `listing_nightly_prices` | Column name | `provider_listing_id` (naming inconsistency, not a hard failure) |
| `20260512060000_add_pms_provider_columns.sql` | 71–82 | `public.property_nightly_prices` | Dead code block | Remove the DO block entirely |

---

## Recommended Fix Priority

| Priority | Action |
|---|---|
| P1 — Fix now | Replace `20260421175000_create_property_nightly_prices.sql` with a no-op or delete it. It will hard-fail on any clean deploy. |
| P1 — Fix now | Write a new migration: `ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS latitude ...` to recover the silent-failed work from `20260421144000`. |
| P1 — Fix now | Write a new migration: `ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS guesty_listing_id text` to recover silent-failed work from `20260423102000`. |
| P2 — Fix soon | Rewrite `20260421144000`, `20260423102000`, `20260426093000` to target `public.listings` so they are idempotent and correct going forward. |
| P2 — Fix soon | Add the missing `listings_accommodates_min_one` constraint and `listings_accommodates_idx` index via a new migration. |
| P3 — Low risk | Rename `20260319_create_bookings.sql` → `20260319000000_create_bookings.sql` to fix ordering. |
| P3 — Low risk | Write a new migration to rename `bookings.property_id` → `bookings.listing_id`. |
| P3 — Low risk | Remove the dead `property_nightly_prices` DO block from `20260512060000`. |
| P4 — Cosmetic | Rename `listing_nightly_prices.provider_property_id` → `provider_listing_id` for naming consistency. |
