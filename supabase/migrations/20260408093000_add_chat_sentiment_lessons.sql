create extension if not exists pgcrypto;

create table if not exists public.chat_sentiment_lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  sentiment_label text not null check (sentiment_label in ('positive', 'neutral', 'negative')),
  trigger_text text,
  response_guidance text not null,
  example_user_message text,
  example_assistant_style text,
  admin_notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sentiment_lessons_active_updated_at_idx
  on public.chat_sentiment_lessons (active, updated_at desc);

create index if not exists chat_sentiment_lessons_sentiment_label_idx
  on public.chat_sentiment_lessons (sentiment_label, updated_at desc);
