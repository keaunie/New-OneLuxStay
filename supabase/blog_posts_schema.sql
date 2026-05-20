-- ════════════════════════════════════════════════════════════════
-- OneLuxStay — Blog Posts Table
-- Run this in your Supabase SQL editor (Dashboard → SQL Editor)
-- ════════════════════════════════════════════════════════════════

create table if not exists public.blog_posts (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  slug            text not null unique,
  excerpt         text,
  content         jsonb,                   -- structured block array
  content_html    text,                    -- optional rendered HTML cache
  featured_image  text,
  category        text,
  seo_title       text,
  seo_description text,
  keywords        text[],                  -- array of keyword strings
  published       boolean not null default false,
  author          text,
  reading_time    integer,                 -- estimated reading time in minutes
  related_cities  text[],                  -- e.g. ['dubai', 'antwerp']
  related_slugs   text[],                  -- slugs of related articles
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-update updated_at on every row change
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists blog_posts_set_updated_at on public.blog_posts;
create trigger blog_posts_set_updated_at
  before update on public.blog_posts
  for each row execute function public.set_updated_at();

-- Indexes for common query patterns
create index if not exists blog_posts_slug_idx      on public.blog_posts (slug);
create index if not exists blog_posts_category_idx  on public.blog_posts (category);
create index if not exists blog_posts_published_idx on public.blog_posts (published, created_at desc);

-- Row Level Security
alter table public.blog_posts enable row level security;

-- Public can read published posts
create policy "Public can read published blog posts"
  on public.blog_posts for select
  using (published = true);

-- Authenticated admins can do everything
create policy "Admins can manage all blog posts"
  on public.blog_posts for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- ── Sample data insert ───────────────────────────────────────
-- Uncomment and run after creating the table to seed with the
-- 5 starter articles (summary records — full content stays in
-- src/data/blogPosts.js until you migrate to DB-driven content)

/*
insert into public.blog_posts
  (title, slug, excerpt, category, featured_image, seo_title, seo_description, keywords, published, author, reading_time, related_cities)
values
  (
    'The Complete Guide to Luxury Stays in Dubai (2026)',
    'luxury-stays-dubai-2026-guide',
    'From Dubai Marina to Downtown''s glittering skyline, discover everything you need to know about finding and booking a premium short-term rental in Dubai.',
    'Dubai Travel',
    'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1400&q=85',
    'Luxury Stays in Dubai 2026: The Complete Guide | OneLuxStay',
    'Planning a luxury stay in Dubai? Our 2026 guide covers the best neighborhoods, top short-term rental tips, pricing, and insider advice.',
    array['luxury stays Dubai', 'Dubai short term rental', 'Dubai Marina apartments'],
    true,
    'Lucia van den Berg',
    9,
    array['dubai']
  ),
  (
    'Antwerp Travel Guide 2026: Where to Stay, What to Do',
    'antwerp-travel-guide-2026',
    'Antwerp is Belgium''s most stylish city — a port town turned fashion capital with world-class museums and some of Europe''s most beautiful apartments.',
    'Antwerp Living',
    'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1400&q=85',
    'Antwerp Travel Guide 2026 | OneLuxStay',
    'Discover Antwerp in 2026 — our complete travel guide covers the best areas to stay, top attractions, and insider tips.',
    array['Antwerp travel guide', 'where to stay Antwerp', 'Antwerp luxury apartments'],
    true,
    'Lucia van den Berg',
    10,
    array['antwerp']
  ),
  (
    'Miami Beachfront Stays: The Definitive Luxury Vacation Guide',
    'miami-beachfront-vacation-guide',
    'Miami blends Art Deco glamour, tropical energy, and world-class beaches into one intoxicating package.',
    'Vacation Rentals',
    'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1400&q=85',
    'Miami Beachfront Luxury Stays Guide 2026 | OneLuxStay',
    'Planning a luxury vacation in Miami? Our complete guide covers beachfront rentals, the best neighborhoods, and insider tips.',
    array['Miami luxury stays', 'Miami Beach vacation rental', 'South Beach vacation'],
    true,
    'OneLuxStay Editorial',
    8,
    array['miami']
  ),
  (
    'Redondo Beach: LA''s Most Underrated Luxury Beach Destination',
    'redondo-beach-vacation-guide',
    'While tourists flock to Santa Monica, savvy travelers are discovering Redondo Beach — a genuinely beautiful coastal town without the crowds.',
    'Local Guides',
    'https://images.unsplash.com/photo-1468413253369-08c2a2dde8d8?w=1400&q=85',
    'Redondo Beach Vacation Guide 2026 | OneLuxStay',
    'Discover Redondo Beach — Los Angeles County''s best-kept beach secret. Our guide covers luxury vacation rentals and things to do.',
    array['Redondo Beach vacation', 'Redondo Beach luxury rental', 'South Bay LA beach towns'],
    true,
    'OneLuxStay Editorial',
    7,
    array['redondo-beach']
  ),
  (
    'The Business Traveler''s Complete Guide to Antwerp (2026 Edition)',
    'business-travel-antwerp-guide',
    'Antwerp is one of Europe''s most important business hubs — the world''s diamond capital, home to Europe''s second-largest port.',
    'Business Travel',
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1400&q=85',
    'Business Travel to Antwerp 2026: Corporate Stays & Insider Tips | OneLuxStay',
    'Traveling to Antwerp for business? Our complete corporate travel guide covers the best neighborhoods, coworking spaces, and meeting venues.',
    array['business travel Antwerp', 'corporate apartments Antwerp', 'extended stay Antwerp'],
    true,
    'Marcus Reid',
    8,
    array['antwerp']
  );
*/
