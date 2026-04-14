alter table if exists public.chat_sentiment_lessons
  add column if not exists created_by_id text,
  add column if not exists created_by_email text,
  add column if not exists created_by_name text,
  add column if not exists updated_by_id text,
  add column if not exists updated_by_email text,
  add column if not exists updated_by_name text;
