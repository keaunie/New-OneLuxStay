create extension if not exists pgcrypto;

create table if not exists public.chat_sessions (
  session_id text primary key,
  page_type text,
  city text,
  listing_id text,
  pathname text,
  source_origin text,
  user_agent text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.chat_sessions(session_id) on delete cascade,
  message_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  cards jsonb,
  metadata jsonb,
  feedback_label text check (feedback_label in ('good', 'bad')),
  feedback_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, message_id)
);

create table if not exists public.chat_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.chat_sessions(session_id) on delete cascade,
  message_id text not null,
  rating text not null check (rating in ('good', 'bad')),
  assistant_message text,
  user_message text,
  page_context jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, message_id)
);

create index if not exists chat_sessions_last_seen_at_idx
  on public.chat_sessions (last_seen_at desc);

create index if not exists chat_messages_session_created_at_idx
  on public.chat_messages (session_id, created_at desc);

create index if not exists chat_messages_feedback_label_idx
  on public.chat_messages (feedback_label);

create index if not exists chat_feedback_rating_updated_at_idx
  on public.chat_feedback (rating, updated_at desc);
